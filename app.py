from flask import Flask, request, jsonify, send_from_directory, render_template
import pdfkit
from fpdf import FPDF
from flask_cors import CORS
from werkzeug.utils import secure_filename
import sqlite3, hashlib, jwt, datetime, os, json
import traceback
import logging

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app, supports_credentials=True)
app.config['SECRET_KEY'] = 'PERF_EVAL_SECRET_2024'
DB_PATH = 'database.db'
AVATAR_UPLOAD_FOLDER = os.path.join('static', 'uploads', 'avatars')

# configure basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')

DEPARTMENTS = [
    "CSE", "EEE", "BBA", "EMBA", "ENGLISH", "Fashion design", "M.ED", "MBA","MPH"
]

# ─── DB INIT ─────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    # ১. ইউজার টেবিল 
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'teacher',
        profile_image TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    # ২. ডিপার্টমেন্ট টেবিল 
    c.execute('''CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        code TEXT UNIQUE NOT NULL
    )''')

    # ৩. সেমিস্টার টেবিল 
    c.execute('''CREATE TABLE IF NOT EXISTS semesters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        department_id INTEGER NOT NULL,
        number INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY(department_id) REFERENCES departments(id),
        UNIQUE(department_id, number)
    )''')

    # ৪. স্টুডেন্ট টেবিল 
    c.execute('''CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        batch TEXT NOT NULL,
        department_id INTEGER NOT NULL,
        semester_id INTEGER NOT NULL,
        email TEXT,
        phone TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(department_id) REFERENCES departments(id),
        FOREIGN KEY(semester_id) REFERENCES semesters(id)
    )''')

   # ৫. ল্যাব মার্কস টেবিল (১০০ মার্কসের নতুন ডিস্ট্রিবিউশন অনুযায়ী )
    c.execute('''CREATE TABLE IF NOT EXISTS lab_marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,       -- স্টুডেন্টের আইডি
        batch TEXT NOT NULL,            -- ব্যাচ
        department_id INTEGER NOT NULL, -- ডিপার্টমেন্ট আইডি
        semester_id INTEGER NOT NULL,   -- সেমিস্টার আইডি
        subject_code TEXT NOT NULL,     -- সাবজেক্ট কোড (যেমন: CSE 1101)
        subject_name TEXT,              -- সাবজেক্ট এর নাম
        teacher_name TEXT,              -- শিক্ষকের নাম
        attendance REAL DEFAULT 0,      -- ১০ মার্কস
        lab_report REAL DEFAULT 0,      -- ২০ মার্কস
        viva REAL DEFAULT 0,            -- ১০ মার্কস
        practical REAL DEFAULT 0,       -- ১০ মার্কস
        mid_exam REAL DEFAULT 0,        -- ২০ মার্কস
        final_exam REAL DEFAULT 0,      -- ৩০ মার্কস
        total REAL DEFAULT 0,           -- মোট ১০০
        subject_credit REAL DEFAULT 3.0, -- এখানে কমাটি নিশ্চিত করা হয়েছে
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES students(student_id),
        UNIQUE(student_id, subject_code)
    )''')

    # ৬. থিওরি মার্কস টেবিল (১০০ মার্কসের নতুন ডিস্ট্রিবিউশন করা)
    c.execute('''CREATE TABLE IF NOT EXISTS theory_marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,       -- স্টুডেন্টের আইডি
        batch TEXT NOT NULL,            -- ব্যাচ
        department_id INTEGER NOT NULL, -- ডিপার্টমেন্ট আইডি
        semester_id INTEGER NOT NULL,   -- সেমিস্টার আইডি
        subject_code TEXT NOT NULL,     -- সাবজেক্ট কোড (যেমন: GED 1102)
        subject_name TEXT,              -- সাবজেক্ট এর নাম
        teacher_name TEXT,              -- শিক্ষকের নাম
        attendance REAL DEFAULT 0,      -- ১০ মার্কস
        assignment REAL DEFAULT 0,      -- ১০ মার্কস
        class_test REAL DEFAULT 0,      -- ১০ মার্কস
        quiz REAL DEFAULT 0,            -- ১০ মার্কস
        presentation REAL DEFAULT 0,    -- ১০ মার্কস
        mid_exam REAL DEFAULT 0,        -- ২০ মার্কস
        final_exam REAL DEFAULT 0,      -- ৩০ মার্কস
        total REAL DEFAULT 0,           -- মোট ১০০
        subject_credit REAL DEFAULT 3.0, -- এখানে কমাটি নিশ্চিত করা হয়েছে
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES students(student_id),
        UNIQUE(student_id, subject_code)
    )''')

    # নতুন টেবিল: ৮. সেমিস্টার রেজাল্ট টেবিল (GPA & CGPA এর জন্য)
    c.execute('''CREATE TABLE IF NOT EXISTS semester_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        semester_id INTEGER NOT NULL,
        batch TEXT NOT NULL,
        department_id INTEGER NOT NULL,
        total_credits REAL DEFAULT 0,
        earned_credits REAL DEFAULT 0,
        gpa REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES students(student_id),
        UNIQUE(student_id, semester_id)
    )''')

    # ৭. সাধারণ বা সমন্বিত marks টেবিল (যদি আপনার ফ্রন্টএন্ড এই সিঙ্গেল টেবিলে ডেটা পাঠায়)
    c.execute('''CREATE TABLE IF NOT EXISTS marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch TEXT NOT NULL,
        department TEXT NOT NULL,
        semester TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_code TEXT NOT NULL,
        subject_name TEXT,
        teacher_name TEXT,
        student_id TEXT NOT NULL,
        marks_breakdown TEXT NOT NULL,
        total_marks REAL NOT NULL,
        UNIQUE(student_id, subject_code)
    )''')

    # ডিফল্ট ডিপার্টমেন্টগুলো ডাটাবেজে ইনসার্ট করা
    for dept in DEPARTMENTS:
        c.execute('INSERT OR IGNORE INTO departments(name, code) VALUES(?,?)', (dept, dept))
    conn.commit()

    # প্রতি ডিপার্টমেন্টের জন্য অটোমেটিক ৮টি সেমিস্টার তৈরি
    c.execute('SELECT id FROM departments')
    depts = c.fetchall()
    for dept in depts:
        for sem in range(1, 9):
            c.execute('INSERT OR IGNORE INTO semesters(department_id, number, name) VALUES(?,?,?)',
                      (dept['id'], sem, f'Semester {sem}'))

    # একটি ডিফল্ট অ্যাডমিন/টিচার ইউজার তৈরি করা যাতে লগইন সহজ হয়
    c.execute('INSERT OR IGNORE INTO users(name,email,password,role,profile_image) VALUES(?,?,?,?,?)',
              ('Admin User', 'admin@example.com', hash_password('password'), 'teacher', ''))
    conn.commit()
    conn.close()
    os.makedirs(AVATAR_UPLOAD_FOLDER, exist_ok=True)


        

# ==========================================
# ২. মার্কস সেভ ও আপডেট করার API রাউট 
# ==========================================
@app.route('/api/marks/submit', methods=['POST'])
def save_marks():
    try:
        # JS থেকে পাঠানো JSON ডাটা রিসিভ করা
        data = request.get_json()
        
        batch = data.get('batch')
        department_input = data.get('department') or data.get('department_id')
        semester_input = data.get('semester') or data.get('semester_id')
        subject_type = data.get('subjectType')
        subject_code = data.get('subjectCode')
        subject_name = data.get('subjectName', '')
        teacher_name = data.get('teacherName', '')
        student_id = data.get('studentId') or data.get('student_id')

        # ডাটাবেসে department ও semester টেক্সট হিসেবে সেভ করার জন্য যদি আইডি আসে সেটা রিসল্ভ করি
        department = None
        semester = None
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        if department_input is not None:
            if str(department_input).isdigit():
                dept_row = cursor.execute('SELECT code FROM departments WHERE id=?', (int(department_input),)).fetchone()
                department = dept_row['code'] if dept_row else str(department_input)
            else:
                department = str(department_input)

        if semester_input is not None:
            if str(semester_input).isdigit():
                sem_row = cursor.execute('SELECT name FROM semesters WHERE id=?', (int(semester_input),)).fetchone()
                semester = sem_row['name'] if sem_row else str(semester_input)
            else:
                semester = str(semester_input)

        # মার্কসের ব্রেকডাউন অবজেক্টটিকে টেক্সট/JSON স্ট্রিং-এ রূপান্তর
        marks_breakdown = json.dumps(data.get('marks', {}))
        total_marks = data.get('totalMarks', 0)

        # প্রাথমিক ভ্যালিডেশন চেক
        if not all([batch, department, semester, subject_type, subject_code, student_id]):
            conn.close()
            return jsonify({"status": "error", "message": "প্রয়োজনীয় সব তথ্য পাঠানো হয়নি!"}), 400

        # INSERT OR REPLACE ব্যবহার করায় আগে ডাটা থাকলে অটো আপডেট (Overwrite) হবে, ডুপ্লিকেট হবে না
        cursor.execute('''
            INSERT OR REPLACE INTO marks 
            (batch, department, semester, subject_type, subject_code, subject_name, teacher_name, student_id, marks_breakdown, total_marks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (batch, department, semester, subject_type, subject_code, subject_name, teacher_name, student_id, marks_breakdown, total_marks))
        
        conn.commit()
        conn.close()
    
        return jsonify({
                "status": "success", 
                "message": f"আইডি {student_id}-এর মার্কস সফলভাবে ডাটাবেজে সেভ হয়েছে!",
                "total_marks": total_marks
        }), 200  

    except Exception as e:
        return jsonify({"status": "error", "message": f"সার্ভার ত্রুটি: {str(e)}"}), 500







def get_wkhtmltopdf_config():
    wk_paths = [r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe", r"C:\Program Files (x86)\wkhtmltopdf\bin\wkhtmltopdf.exe"]
    wk_path = next((p for p in wk_paths if os.path.exists(p)), None)
    return pdfkit.configuration(wkhtmltopdf=wk_path) if wk_path else None


def render_pdf(html, out_path):
    """Render HTML to PDF with wkhtmltopdf via pdfkit."""
    config = get_wkhtmltopdf_config()
    if not config:
        return False
    try:
        pdfkit.from_string(html, out_path, configuration=config)
        return True
    except Exception:
        return False


def generate_exam_pdf_fpdf(students, exam_type, batch, out_path, dept_name=None, generated_on=None):
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_fill_color(232, 238, 251)
    pdf.set_text_color(26, 86, 219)
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 12, 'Lab & Theory Performance Evaluation System', ln=True, align='C', fill=True)
    pdf.ln(4)
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', 'B', 16)
    title = f"{dept_name} - {exam_type.upper()} Report" if dept_name else f"Exam Report - {exam_type.capitalize()}"
    pdf.cell(0, 10, title, ln=True, align='C')
    pdf.ln(4)
    pdf.set_font('Arial', '', 12)
    if generated_on or batch:
        pdf.cell(0, 8, f"Date: {generated_on or ''} | Batch: {batch or 'All'}", ln=True, align='C')
    pdf.ln(8)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(10, 8, '#', 1)
    pdf.cell(30, 8, 'Student ID', 1)
    pdf.cell(50, 8, 'Name', 1)
    pdf.cell(30, 8, 'Batch', 1)
    pdf.cell(40, 8, 'Subject', 1)
    pdf.cell(20, 8, 'Total', 1)
    pdf.ln()
    pdf.set_font('Arial', '', 9)
    if students:
        for idx, s in enumerate(students, 1):
            pdf.cell(10, 8, str(idx), 1)
            pdf.cell(30, 8, s.get('student_id', ''), 1)
            pdf.cell(50, 8, s.get('name', ''), 1)
            pdf.cell(30, 8, s.get('batch', ''), 1)
            pdf.cell(40, 8, s.get('subject_code', '') or s.get('subject_name', ''), 1)
            pdf.cell(20, 8, str(s.get('total', 0)), 1)
            pdf.ln()
    else:
        pdf.cell(180, 8, 'No students found', 1, ln=True, align='C')
    pdf.output(out_path)
    return True


def generate_student_cgpa_pdf_fpdf(student, out_path, dept_name=None, generated_on=None, cgpa=None):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_fill_color(232, 238, 251)
    pdf.set_text_color(26, 86, 219)
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 12, 'Lab & Theory Performance Evaluation System', ln=True, align='C', fill=True)
    pdf.ln(6)
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, 'Student CGPA Grade Sheet', ln=True, align='C')
    pdf.ln(6)
    pdf.set_font('Arial', '', 12)
    if generated_on:
        pdf.cell(0, 8, f"Date: {generated_on}", ln=True, align='C')
    pdf.ln(8)

    if student:
        pdf.set_font('Arial', 'B', 11)
        pdf.set_fill_color(232, 238, 251)
        pdf.cell(40, 10, 'Student ID', 1, 0, 'C', 1)
        pdf.cell(55, 10, 'Name', 1, 0, 'C', 1)
        pdf.cell(30, 10, 'Batch', 1, 0, 'C', 1)
        pdf.cell(40, 10, 'Department', 1, 0, 'C', 1)
        pdf.cell(25, 10, 'CGPA', 1, 1, 'C', 1)

        pdf.set_font('Arial', '', 11)
        pdf.cell(40, 10, student.get('student_id', ''), 1, 0, 'C')
        pdf.cell(55, 10, student.get('name', ''), 1, 0, 'C')
        pdf.cell(30, 10, student.get('batch', ''), 1, 0, 'C')
        pdf.cell(40, 10, dept_name or student.get('department_id', ''), 1, 0, 'C')
        pdf.cell(25, 10, f"{cgpa:.2f}", 1, 1, 'C')
    else:
        pdf.multi_cell(0, 8, 'No student data found for given ID.')

    pdf.output(out_path)
    return True


def generate_batch_cgpa_pdf_fpdf(students, batch, out_path, dept_name=None, generated_on=None):
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_fill_color(232, 238, 251)
    pdf.set_text_color(26, 86, 219)
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 12, 'Lab & Theory Performance Evaluation System', ln=True, align='C', fill=True)
    pdf.ln(4)
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, f'Batch CGPA Report', ln=True, align='C')
    pdf.ln(4)
    pdf.set_font('Arial', '', 12)
    if generated_on or batch:
        pdf.cell(0, 8, f"Date: {generated_on or ''} | Batch: {batch or ''}", ln=True, align='C')
    pdf.ln(8)
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(15, 8, '#', 1)
    pdf.cell(45, 8, 'Student ID', 1)
    pdf.cell(80, 8, 'Name', 1)
    pdf.cell(30, 8, 'Batch', 1)
    pdf.cell(25, 8, 'CGPA', 1)
    pdf.ln()
    pdf.set_font('Arial', '', 11)
    if students:
        for idx, s in enumerate(students, 1):
            pdf.cell(15, 8, str(idx), 1)
            pdf.cell(45, 8, s.get('student_id', ''), 1)
            pdf.cell(80, 8, s.get('name', ''), 1)
            pdf.cell(30, 8, s.get('batch', ''), 1)
            pdf.cell(25, 8, f"{s.get('cgpa', 0):.2f}", 1)
            pdf.ln()
    else:
        pdf.cell(195, 8, 'No students found', 1, ln=True, align='C')
    pdf.output(out_path)
    return True


# ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def make_token(user_id, email, role):
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        # datetime.datetime.utcnow() এর পরিবর্তে timezone-aware বা timezone ছাড়া standard timedelta ব্যবহার
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

def verify_token(token):
    try:
        return jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
    except:
        return None

def auth_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        data = verify_token(token)
        if not data:
            return jsonify({'error': 'Unauthorized'}), 401
        request.user = data
        return f(*args, **kwargs)
    return decorated


def calculate_grade_and_gp(total_marks):
    if total_marks >= 80:
        return 'A+', 4.00
    elif total_marks >= 75:
        return 'A', 3.75
    elif total_marks >= 70:
        return 'A-', 3.50
    elif total_marks >= 65:
        return 'B+', 3.25
    elif total_marks >= 60:
        return 'B', 3.00
    elif total_marks >= 55:
        return 'B-', 2.75
    elif total_marks >= 50:
        return 'C+', 2.50
    elif total_marks >= 45:
        return 'C', 2.25
    elif total_marks >= 40:
        return 'D', 2.00
    else:
        return 'F', 0.00


# ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
@app.route('/api/auth/register', methods=['POST'])
def register():
    d = request.json
    if not d or not d.get('name') or not d.get('email') or not d.get('password'):
        return jsonify({'error': 'All fields required'}), 400
    conn = get_db()
    try:
        conn.execute('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',
                     (d['name'], d['email'], hash_password(d['password']), d.get('role','teacher')))
        conn.commit()
        return jsonify({'message': 'Registration successful!'})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email already exists'}), 409
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST'])
def login():
    d = request.json
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE email=? AND password=?',
                        (d.get('email',''), hash_password(d.get('password','')))).fetchone()
    conn.close()
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401
    token = make_token(user['id'], user['email'], user['role'])
    return jsonify({'token': token, 'user': {
        'id': user['id'], 'name': user['name'],
        'email': user['email'], 'role': user['role'],
        'profile_image': user['profile_image']
    }})

@app.route('/api/auth/profile', methods=['GET', 'PUT'])
@auth_required
def profile():
    conn = get_db()
    if request.method == 'GET':
        user = conn.execute('SELECT id,name,email,role,profile_image,created_at FROM users WHERE id=?',
                            (request.user['user_id'],)).fetchone()
        conn.close()
        return jsonify(dict(user))
    d = request.json
    updates = []
    vals = []
    for field in ['name', 'profile_image']:
        if field in d:
            updates.append(f'{field}=?')
            vals.append(d[field])
    if d.get('password'):
        updates.append('password=?')
        vals.append(hash_password(d['password']))
    vals.append(request.user['user_id'])
    conn.execute(f'UPDATE users SET {", ".join(updates)} WHERE id=?', vals)
    conn.commit()
    conn.close()
    return jsonify({'message': 'Profile updated'})


@app.route('/api/auth/profile/avatar', methods=['POST'])
@auth_required
def upload_profile_avatar():
    if 'avatar' not in request.files:
        return jsonify({'error': 'No avatar file uploaded'}), 400
    file = request.files['avatar']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
        return jsonify({'error': 'Invalid file type'}), 400

    os.makedirs(AVATAR_UPLOAD_FOLDER, exist_ok=True)
    user_id = request.user['user_id']
    timestamp = int(datetime.datetime.now().timestamp())
    new_filename = f'avatar_{user_id}_{timestamp}{ext}'
    save_path = os.path.join(AVATAR_UPLOAD_FOLDER, new_filename)
    file.save(save_path)

    profile_image_url = f'/static/uploads/avatars/{new_filename}'
    conn = get_db()
    conn.execute('UPDATE users SET profile_image=? WHERE id=?', (profile_image_url, user_id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Avatar uploaded', 'profile_image': profile_image_url})


# ─── DEPARTMENT & SEMESTER ────────────────────────────────────────────────────
@app.route('/api/departments', methods=['GET', 'POST'])
@auth_required
def departments():
    conn = get_db()
    if request.method == 'GET':
        depts = conn.execute('SELECT * FROM departments ORDER BY name').fetchall()
        conn.close()
        return jsonify([dict(d) for d in depts])
    d = request.json
    try:
        conn.execute('INSERT INTO departments(name,code) VALUES(?,?)', (d['name'], d['code']))
        dept_id = conn.execute('SELECT id FROM departments WHERE code=?', (d['code'],)).fetchone()['id']
        for sem in range(1, 9):
            conn.execute('INSERT OR IGNORE INTO semesters(department_id,number,name) VALUES(?,?,?)',
                         (dept_id, sem, f'Semester {sem}'))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Department added with 8 semesters!'})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Department already exists'}), 409

@app.route('/api/departments/<int:dept_id>/semesters', methods=['GET'])
@auth_required
def get_semesters(dept_id):
    conn = get_db()
    sems = conn.execute('SELECT * FROM semesters WHERE department_id=? ORDER BY number', (dept_id,)).fetchall()
    conn.close()
    return jsonify([dict(s) for s in sems])


@app.route('/api/departments/<int:dept_id>', methods=['DELETE'])
@auth_required
def delete_department(dept_id):
    conn = get_db()
    students = conn.execute('SELECT student_id FROM students WHERE department_id=?', (dept_id,)).fetchall()
    student_ids = [row['student_id'] for row in students]
    try:
        conn.execute('DELETE FROM lab_marks WHERE department_id=?', (dept_id,))
        conn.execute('DELETE FROM theory_marks WHERE department_id=?', (dept_id,))
        conn.execute('DELETE FROM semester_results WHERE department_id=?', (dept_id,))
        if student_ids:
            placeholders = ','.join('?' for _ in student_ids)
            conn.execute(f'DELETE FROM marks WHERE student_id IN ({placeholders})', student_ids)
        conn.execute('DELETE FROM students WHERE department_id=?', (dept_id,))
        conn.execute('DELETE FROM semesters WHERE department_id=?', (dept_id,))
        conn.execute('DELETE FROM departments WHERE id=?', (dept_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Department deleted'})
    except Exception as e:
        conn.rollback()
        conn.close()
        logging.error('Department delete failed: %s', e)
        return jsonify({'error': 'Unable to delete department'}), 500


# Public endpoints (no auth) for frontend dropdown population when user is not logged in
@app.route('/api/public/departments', methods=['GET'])
def public_departments():
    conn = get_db()
    depts = conn.execute('SELECT * FROM departments ORDER BY name').fetchall()
    conn.close()
    return jsonify([dict(d) for d in depts])


@app.route('/api/public/departments/<int:dept_id>/semesters', methods=['GET'])
def public_get_semesters(dept_id):
    conn = get_db()
    sems = conn.execute('SELECT * FROM semesters WHERE department_id=? ORDER BY number', (dept_id,)).fetchall()
    conn.close()
    return jsonify([dict(s) for s in sems])


# ─── STUDENTS ─────────────────────────────────────────────────────────────────
@app.route('/api/students', methods=['GET', 'POST'])
@auth_required
def students():
    conn = get_db()
    if request.method == 'GET':
        dept_id = request.args.get('department_id')
        sem_id = request.args.get('semester_id')
        batch = request.args.get('batch')
        search = request.args.get('search', '')
        q = '''SELECT s.*, d.name as dept_name, d.code as dept_code,
               sem.number as sem_number
               FROM students s
               JOIN departments d ON s.department_id = d.id
               JOIN semesters sem ON s.semester_id = sem.id
               WHERE 1=1'''
        params = []
        if dept_id:
            q += ' AND s.department_id=?'; params.append(dept_id)
        if sem_id:
            q += ' AND s.semester_id=?'; params.append(sem_id)
        if batch:
            q += ' AND s.batch=?'; params.append(batch)
        if search:
            q += ' AND (s.student_id LIKE ? OR s.name LIKE ?)'; params += [f'%{search}%', f'%{search}%']
        q += ' ORDER BY s.name'
        rows = conn.execute(q, params).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    d = request.json
    try:
        conn.execute('''INSERT INTO students(student_id,name,batch,department_id,semester_id,email,phone)
                        VALUES(?,?,?,?,?,?,?)''',
                     (d['student_id'], d['name'], d['batch'], d['department_id'],
                      d['semester_id'], d.get('email',''), d.get('phone','')))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Student added!'})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Student ID already exists'}), 409

@app.route('/api/students/<int:sid>', methods=['GET', 'PUT', 'DELETE'])
@auth_required
def student_detail(sid):
    conn = get_db()
    if request.method == 'GET':
        s = conn.execute('''SELECT s.*, d.name as dept_name, sem.number as sem_number
                            FROM students s JOIN departments d ON s.department_id=d.id
                            JOIN semesters sem ON s.semester_id=sem.id WHERE s.id=?''', (sid,)).fetchone()
        conn.close()
        return jsonify(dict(s)) if s else (jsonify({'error':'Not found'}),404)
    if request.method == 'PUT':
        d = request.json
        conn.execute('''UPDATE students SET name=?,batch=?,department_id=?,semester_id=?,email=?,phone=?
                        WHERE id=?''',
                     (d['name'],d['batch'],d['department_id'],d['semester_id'],
                      d.get('email',''),d.get('phone',''),sid))
        conn.commit(); conn.close()
        return jsonify({'message': 'Updated!'})
    # DELETE student and related marks using the actual student_id value
    student = conn.execute('SELECT student_id FROM students WHERE id=?', (sid,)).fetchone()
    if student:
        student_id = student['student_id']
        conn.execute('DELETE FROM students WHERE id=?', (sid,))
        conn.execute('DELETE FROM lab_marks WHERE student_id=?', (student_id,))
        conn.execute('DELETE FROM theory_marks WHERE student_id=?', (student_id,))
        conn.commit(); conn.close()
        return jsonify({'message': 'Deleted!'})
    conn.close()
    return jsonify({'error': 'Not found'}), 404


# ─── LAB MARKS ───────────────────────────────────────────────────────────────
@app.route('/api/lab-marks', methods=['GET', 'POST'])
@auth_required
def lab_marks():
    conn = get_db()
    if request.method == 'GET':
        dept_id = request.args.get('department_id')
        sem_id = request.args.get('semester_id')
        batch = request.args.get('batch')
        student_id = request.args.get('student_id')
        search = request.args.get('search')
        q = '''SELECT lm.*, s.name as student_name, s.student_id as roll,
               s.batch, d.name as dept_name
               FROM lab_marks lm
               JOIN students s ON lm.student_id = s.student_id
               JOIN departments d ON s.department_id = d.id
               WHERE 1=1'''
        params = []
        if dept_id: q += ' AND s.department_id=?'; params.append(dept_id)
        if sem_id: q += ' AND lm.semester_id=?'; params.append(sem_id)
        if batch: q += ' AND s.batch=?'; params.append(batch)
        if student_id: q += ' AND lm.student_id=?'; params.append(student_id)
        if search:
            q += ' AND (lm.student_id LIKE ? OR s.name LIKE ?)'
            params.append(f'%{search}%')
            params.append(f'%{search}%')
        rows = conn.execute(q, params).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    
    d = request.json
    try:
        # subject_credit রিসিভ করা (ডিফল্ট ৩.০ ক্রেডিট)
        subject_credit = float(d.get('subject_credit', 3.0))
        
        total = (float(d.get('attendance', 0)) + float(d.get('lab_report', 0)) + 
                 float(d.get('viva', 0)) + float(d.get('practical', 0)) + 
                 float(d.get('mid_exam', 0)) + float(d.get('final_exam', 0)))
        
        # INSERT এবং ON CONFLICT এ subject_credit কলাম যুক্ত করা হয়েছে
        conn.execute('''INSERT INTO lab_marks(student_id, batch, department_id, semester_id, subject_code, subject_name, subject_credit, teacher_name, attendance, lab_report, viva, practical, mid_exam, final_exam, total)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(student_id, subject_code) DO UPDATE SET
                        subject_credit=excluded.subject_credit,
                        attendance=excluded.attendance, lab_report=excluded.lab_report,
                        viva=excluded.viva, practical=excluded.practical,
                        mid_exam=excluded.mid_exam, final_exam=excluded.final_exam,
                        total=excluded.total, updated_at=CURRENT_TIMESTAMP''',
                     (d['student_id'], d['batch'], d['department_id'], d['semester_id'], d['subject_code'], d.get('subject_name',''), subject_credit, d.get('teacher_name',''),
                      d.get('attendance',0), d.get('lab_report',0), d.get('viva',0), d.get('practical',0), d.get('mid_exam',0), d.get('final_exam',0), total))
        conn.commit(); conn.close()
        return jsonify({'message': 'Lab marks saved!'})
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/lab-marks/<int:mid>', methods=['PUT', 'DELETE'])
@auth_required
def lab_mark_detail(mid):
    conn = get_db()
    if request.method == 'DELETE':
        conn.execute('DELETE FROM lab_marks WHERE id=?', (mid,))
        conn.commit(); conn.close()
        return jsonify({'message': 'Deleted!'})
    
    d = request.json
    # PUT আপডেটেও subject_credit রিসিভ করা হচ্ছে
    subject_credit = float(d.get('subject_credit', 3.0))
    
    total = (float(d.get('attendance', 0)) + float(d.get('lab_report', 0)) + 
             float(d.get('viva', 0)) + float(d.get('practical', 0)) + 
             float(d.get('mid_exam', 0)) + float(d.get('final_exam', 0)))
    
    conn.execute('''UPDATE lab_marks SET subject_credit=?, attendance=?, lab_report=?, viva=?, practical=?,
                    mid_exam=?, final_exam=?, total=?, updated_at=CURRENT_TIMESTAMP WHERE id=?''',
                 (subject_credit, d.get('attendance',0), d.get('lab_report',0), d.get('viva',0),
                  d.get('practical',0), d.get('mid_exam',0), d.get('final_exam',0), total, mid))
    conn.commit(); conn.close()
    return jsonify({'message': 'Updated!'})

# ─── THEORY MARKS ─────────────────────────────────────────────────────────────
@app.route('/api/theory-marks', methods=['GET', 'POST'])
@auth_required
def theory_marks():
    conn = get_db()
    if request.method == 'GET':
        dept_id = request.args.get('department_id')
        sem_id = request.args.get('semester_id')
        batch = request.args.get('batch')
        student_id = request.args.get('student_id')
        search = request.args.get('search')
        q = '''SELECT tm.*, s.name as student_name, s.student_id as roll,
               s.batch, d.name as dept_name
               FROM theory_marks tm
               JOIN students s ON tm.student_id = s.student_id
               JOIN departments d ON s.department_id = d.id
               WHERE 1=1'''
        params = []
        if dept_id: q += ' AND s.department_id=?'; params.append(dept_id)
        if sem_id: q += ' AND tm.semester_id=?'; params.append(sem_id)
        if batch: q += ' AND s.batch=?'; params.append(batch)
        if student_id: q += ' AND tm.student_id=?'; params.append(student_id)
        if search:
            q += ' AND (tm.student_id LIKE ? OR s.name LIKE ?)'
            params.append(f'%{search}%')
            params.append(f'%{search}%')
        rows = conn.execute(q, params).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    
    d = request.json
    try:
        # subject_credit রিসিভ করা (ডিফল্ট ৩.০ ক্রেডিট)
        subject_credit = float(d.get('subject_credit', 3.0))
        
        total = (float(d.get('attendance', 0)) + float(d.get('assignment', 0)) + 
                 float(d.get('class_test', 0)) + float(d.get('quiz', 0)) + 
                 float(d.get('presentation', 0)) + float(d.get('mid_exam', 0)) + float(d.get('final_exam', 0)))
                 
        # INSERT এবং ON CONFLICT এ subject_credit কলাম যুক্ত করা হয়েছে
        conn.execute('''INSERT INTO theory_marks(student_id, batch, department_id, semester_id, subject_code, subject_name, subject_credit, teacher_name, attendance, assignment, class_test, quiz, presentation, mid_exam, final_exam, total)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(student_id, subject_code) DO UPDATE SET
                        subject_credit=excluded.subject_credit,
                        attendance=excluded.attendance, assignment=excluded.assignment,
                        class_test=excluded.class_test, quiz=excluded.quiz,
                        presentation=excluded.presentation, mid_exam=excluded.mid_exam,
                        final_exam=excluded.final_exam, total=excluded.total, updated_at=CURRENT_TIMESTAMP''',
                     (d['student_id'], d['batch'], d['department_id'], d['semester_id'], d['subject_code'], d.get('subject_name',''), subject_credit, d.get('teacher_name',''),
                      d.get('attendance',0), d.get('assignment',0), d.get('class_test',0), d.get('quiz',0), d.get('presentation',0), d.get('mid_exam',0), d.get('final_exam',0), total))
        conn.commit(); conn.close()
        return jsonify({'message': 'Theory marks saved!'})
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/theory-marks/<int:mid>', methods=['PUT', 'DELETE'])
@auth_required
def theory_mark_detail(mid):
    conn = get_db()
    if request.method == 'DELETE':
        conn.execute('DELETE FROM theory_marks WHERE id=?', (mid,))
        conn.commit(); conn.close()
        return jsonify({'message': 'Deleted!'})
    
    d = request.json
    # PUT আপডেটেও subject_credit রিসিভ করা হচ্ছে
    subject_credit = float(d.get('subject_credit', 3.0))
    
    total = (float(d.get('attendance', 0)) + float(d.get('assignment', 0)) + 
             float(d.get('class_test', 0)) + float(d.get('quiz', 0)) + 
             float(d.get('presentation', 0)) + float(d.get('mid_exam', 0)) + float(d.get('final_exam', 0)))
    
    conn.execute('''UPDATE theory_marks SET subject_credit=?, attendance=?, assignment=?, class_test=?, quiz=?, presentation=?,
                    mid_exam=?, final_exam=?, total=?, updated_at=CURRENT_TIMESTAMP WHERE id=?''',
                 (subject_credit, d.get('attendance',0), d.get('assignment',0), d.get('class_test',0),
                  d.get('quiz',0), d.get('presentation',0), d.get('mid_exam',0), d.get('final_exam',0), total, mid))
    conn.commit(); conn.close()
    return jsonify({'message': 'Updated!'})

# ==========================================
# ৩. মার্কস দেখার (View) জন্য API রাউট
# ==========================================
@app.route('/api/marks', methods=['GET'])
@auth_required
def get_marks():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # ফ্রন্টএন্ড থেকে পাঠানো ফিল্টারিং প্যারামিটারগুলো ধরা
        batch = request.args.get('batch')
        department = request.args.get('department')
        semester = request.args.get('semester')
        student_id = request.args.get('student_id')
        subject_code = request.args.get('subject_code')
        
        # ডায়নামিক কুয়েরি তৈরি করা
        q = "SELECT * FROM marks WHERE 1=1"
        params = []
        
        if batch:
            q += " AND batch = ?"
            params.append(batch)
        if department:
            q += " AND department = ?"
            params.append(department)
        if semester:
            q += " AND semester = ?"
            params.append(semester)
        if student_id:
            q += " AND student_id = ?"
            params.append(student_id)
        if subject_code:
            q += " AND subject_code = ?"
            params.append(subject_code)
            
        rows = cursor.execute(q, params).fetchall()
        conn.close()
        
        # ডাটাবেজে ব্রেকডাউনটি স্ট্রিং হিসেবে থাকে, তাই ওটাকে আবার আসল JSON-এ কনভার্ট করে পাঠানো
        results = []
        for r in rows:
            item = dict(r)
            try:
                item['marks_breakdown'] = json.loads(item['marks_breakdown'])
            except:
                pass
            results.append(item)
            
        return jsonify(results), 200

    except Exception as e:
        return jsonify({"status": "error", "message": f"সার্ভার ত্রুটি: {str(e)}"}), 500



# ─── DASHBOARD / STATS ────────────────────────────────────────────────────────
@app.route('/api/stats/dashboard', methods=['GET'])
@auth_required
def dashboard_stats():
    dept_id = request.args.get('department_id')
    sem_id = request.args.get('semester_id')
    batch = request.args.get('batch')

    conn = get_db()
    total_students = conn.execute('SELECT COUNT(*) as c FROM students').fetchone()['c']
    total_depts = conn.execute('SELECT COUNT(*) as c FROM departments').fetchone()['c']

    base_query = '''
        SELECT d.name, d.code, d.id,
               COUNT(s.id) as student_count
        FROM departments d
        LEFT JOIN students s ON s.department_id = d.id'''
    join_conds = ['s.department_id = d.id']
    params = []
    if sem_id:
        join_conds.append('s.semester_id = ?')
        params.append(sem_id)
    if batch:
        join_conds.append('s.batch = ?')
        params.append(batch)
    if join_conds:
        base_query = base_query.replace('s.department_id = d.id', ' AND '.join(join_conds))

    if dept_id:
        base_query += ' WHERE d.id = ?'
        params.append(dept_id)

    base_query += ' GROUP BY d.id ORDER BY d.name'
    dept_stats = conn.execute(base_query, tuple(params)).fetchall()

    dept_performance = []
    for dept in dept_stats:
        lab_query = '''SELECT AVG(lm.total) as avg FROM lab_marks lm
                          JOIN students s ON lm.student_id=s.student_id
                          WHERE s.department_id=?'''
        theory_query = '''SELECT AVG(tm.total) as avg FROM theory_marks tm
                           JOIN students s ON tm.student_id=s.student_id
                           WHERE s.department_id=?'''
        lab_params = [dept['id']]
        th_params = [dept['id']]
        if sem_id:
            lab_query += ' AND s.semester_id = ?'
            theory_query += ' AND s.semester_id = ?'
            lab_params.append(sem_id)
            th_params.append(sem_id)
        if batch:
            lab_query += ' AND s.batch = ?'
            theory_query += ' AND s.batch = ?'
            lab_params.append(batch)
            th_params.append(batch)

        lab_avg = conn.execute(lab_query, tuple(lab_params)).fetchone()['avg'] or 0
        th_avg = conn.execute(theory_query, tuple(th_params)).fetchone()['avg'] or 0
        dept_performance.append({
            **dict(dept),
            'lab_avg': round(lab_avg, 1),
            'theory_avg': round(th_avg, 1),
            'overall': round((lab_avg + th_avg) / 2, 1)
        })
    conn.close()
    return jsonify({
        'total_students': total_students,
        'total_departments': total_depts,
        'dept_performance': dept_performance
    })

@app.route('/api/stats/semester/<int:sem_id>', methods=['GET'])
@auth_required
def semester_stats(sem_id):
    conn = get_db()
    students = conn.execute('''
        SELECT s.id, s.name, s.student_id as roll,
               (SELECT SUM(total) FROM lab_marks WHERE student_id=s.student_id AND semester_id=?) as lab_total,
               (SELECT SUM(total) FROM theory_marks WHERE student_id=s.student_id AND semester_id=?) as theory_total
        FROM students s
        WHERE s.semester_id=?
    ''', (sem_id, sem_id, sem_id)).fetchall()
    
    result = []
    for st in students:
        lab_total = st['lab_total'] or 0
        th_total = st['theory_total'] or 0
        grand = lab_total + th_total
        grade = 'A+' if grand>=90 else 'A' if grand>=80 else 'B+' if grand>=70 else 'B' if grand>=60 else 'C' if grand>=50 else 'F'
        result.append({**dict(st), 'grand_total': round(grand,1), 'grade': grade,
                       'lab_total': round(lab_total,1), 'theory_total': round(th_total,1)})
    conn.close()
    return jsonify(result)




@app.route('/api/analytics/weak-students', methods=['GET'])
@auth_required
def get_weak_students():
    conn = get_db()
    # থিওরি বা ল্যাবে ৫০ এর নিচে পাওয়া স্টুডেন্টদের কুয়েরি
    q = '''
        SELECT s.student_id, s.name, s.batch, d.name as dept_name, 'Theory' as type, tm.subject_code, tm.total
        FROM theory_marks tm
        JOIN students s ON tm.student_id = s.student_id
        JOIN departments d ON s.department_id = d.id
        WHERE tm.total < 50
        UNION
        SELECT s.student_id, s.name, s.batch, d.name as dept_name, 'Lab' as type, lm.subject_code, lm.total
        FROM lab_marks lm
        JOIN students s ON lm.student_id = s.student_id
        JOIN departments d ON s.department_id = d.id
        WHERE lm.total < 50
    '''
    rows = conn.execute(q).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])



GRADE_POINT_TABLE = [
    (80, 100, 'A+', 4.00),
    (75, 79, 'A', 3.75),
    (70, 74, 'A-', 3.50),
    (65, 69, 'B+', 3.25),
    (60, 64, 'B', 3.00),
    (55, 59, 'B-', 2.75),
    (50, 54, 'C+', 2.50),
    (45, 49, 'C', 2.25),
    (40, 44, 'D', 2.00),
    (0, 39, 'F', 0.00)
]

# গ্রেড এবং জিপিএ ক্যালকুলেশনের জন্য একটি হেল্পার ফাংশন
def get_grade_point(total_marks):
    try:
        score = float(total_marks)
    except (TypeError, ValueError):
        score = 0.0

    for low, high, grade, point in GRADE_POINT_TABLE:
        if low <= score <= high:
            return point, grade
    return 0.00, 'F'

def calculate_grade_and_gp(total_marks):
    grade_point, grade = get_grade_point(total_marks)
    return grade, grade_point

def calculate_grade_points(total_marks):
    return get_grade_point(total_marks)

@app.route('/api/reports/semester-cgpa', methods=['GET'])
@auth_required
def semester_cgpa_report():
    sem_id = request.args.get('semester_id')
    dept_id = request.args.get('department_id')
    batch = request.args.get('batch')
    student_id = request.args.get('student_id') # নির্দিষ্ট সিঙ্গেল আইডি-র জন্য ফিল্টার

    if not sem_id:
        return jsonify({'error': 'semester_id is required!'}), 400

    conn = get_db()
    
    # ১. থিওরি মার্কস ডাটা রিড করা
    t_q = '''SELECT tm.*, s.name as student_name, s.batch, d.name as dept_name 
             FROM theory_marks tm
             JOIN students s ON tm.student_id = s.student_id
             JOIN departments d ON s.department_id = d.id
             WHERE tm.semester_id = ?'''
    t_params = [sem_id]
    if dept_id: t_q += ' AND s.department_id = ?'; t_params.append(dept_id)
    if batch: t_q += ' AND s.batch = ?'; t_params.append(batch)
    if student_id: t_q += ' AND tm.student_id = ?'; t_params.append(student_id)
    theory_rows = conn.execute(t_q, t_params).fetchall()

    # ২. ল্যাব মার্কস ডাটা রিড করা
    l_q = '''SELECT lm.*, s.name as student_name, s.batch, d.name as dept_name 
             FROM lab_marks lm
             JOIN students s ON lm.student_id = s.student_id
             JOIN departments d ON s.department_id = d.id
             WHERE lm.semester_id = ?'''
    l_params = [sem_id]
    if dept_id: l_q += ' AND s.department_id = ?'; l_params.append(dept_id)
    if batch: l_q += ' AND s.batch = ?'; l_params.append(batch)
    if student_id: l_q += ' AND lm.student_id = ?'; l_params.append(student_id)
    lab_rows = conn.execute(l_q, l_params).fetchall()
    
    conn.close()

    # স্টুডেন্ট ওয়াইজ ডাটা স্ট্রাকচার তৈরি
    students_data = {}

    def process_marks(rows, course_type):
        for row in rows:
            sid = row['student_id']
            if sid not in students_data:
                students_data[sid] = {
                    'student_id': sid,
                    'student_name': row['student_name'],
                    'batch': row['batch'],
                    'department_name': row['dept_name'],
                    'subjects': []
                }
            
            total_marks = float(row['total'] or 0)
            credit = float(row['subject_credit'] if 'subject_credit' in row.keys() else 3.0)
            gp, grade = calculate_grade_points(total_marks)

            students_data[sid]['subjects'].append({
                'subject_code': row['subject_code'],
                'subject_name': row['subject_name'],
                'type': course_type,
                'credit': credit,
                'total_marks': total_marks,
                'grade': grade,
                'grade_point': gp
            })

    process_marks(theory_rows, 'Theory')
    process_marks(lab_rows, 'Lab')

    # ফাইনাল জিপিএ/সিজিপিএ ক্যালকুলেশন লজিক (Single ID বা All Students এর মিক্সড ডাটা)
    report_list = []
    for sid, data in students_data.items():
        total_credits = 0.0
        total_quality_points = 0.0
        
        for sub in data['subjects']:
            total_credits += sub['credit']
            total_quality_points += (sub['grade_point'] * sub['credit'])
        
        # সেমিস্টার জিপিএ নির্ধারণ
        semester_gpa = round(total_quality_points / total_credits, 2) if total_credits > 0 else 0.00
        data['total_credits_earned'] = total_credits
        data['semester_gpa'] = semester_gpa
        report_list.append(data)

    return jsonify(report_list)


@app.route('/api/analytics/overview', methods=['GET'])
@auth_required
def analytics_overview():
    conn = get_db()
    
    # ১. ডিপার্টমেন্ট অনুযায়ী মোট স্টুডেন্ট সংখ্যা (বার/ডোনাট চার্টের জন্য)
    dept_stats_rows = conn.execute('''
        SELECT d.name as dept_name, COUNT(s.id) as student_count 
        FROM departments d
        LEFT JOIN students s ON d.id = s.department_id
        GROUP BY d.id
    ''').fetchall()
    
    dept_labels = [r['dept_name'] for r in dept_stats_rows]
    dept_counts = [r['student_count'] for r in dept_stats_rows]

    # ২. থিওরি ও ল্যাব এক্সামের এভারেজ পারফরম্যান্স (রাডার চার্টের জন্য)
    avg_theory = conn.execute('SELECT AVG(total) as avg_marks FROM theory_marks').fetchone()
    avg_lab = conn.execute('SELECT AVG(total) as avg_marks FROM lab_marks').fetchone()
    
    performance_radar = {
        'labels': ['Attendance', 'Mid Exam', 'Final Exam', 'Assignments/Reports', 'Quiz/Viva/Practical'],
        'theory_avg': [
            round(conn.execute('SELECT AVG(attendance) FROM theory_marks').fetchone()[0] or 0, 2),
            round(conn.execute('SELECT AVG(mid_exam) FROM theory_marks').fetchone()[0] or 0, 2),
            round(conn.execute('SELECT AVG(final_exam) FROM theory_marks').fetchone()[0] or 0, 2),
            round(conn.execute('SELECT AVG(assignment) FROM theory_marks').fetchone()[0] or 0, 2),
            round(conn.execute('SELECT AVG(quiz + presentation) FROM theory_marks').fetchone()[0] or 0, 2)
        ],
        'lab_avg': [
            round(conn.execute('SELECT AVG(attendance) FROM lab_marks').fetchone()[0] or 0, 2),
            round(conn.execute('SELECT AVG(mid_exam) FROM lab_marks').fetchone()[0] or 0, 2),
            round(conn.execute('SELECT AVG(final_exam) FROM lab_marks').fetchone()[0] or 0, 2),
            round(conn.execute('SELECT AVG(lab_report) FROM lab_marks').fetchone()[0] or 0, 2),
            round(conn.execute('SELECT AVG(viva + practical) FROM lab_marks').fetchone()[0] or 0, 2)
        ]
    }

    # ৩. উইক স্টুডেন্ট ডিটেকশন (যাদের যেকোনো সাবজেক্টের টোটাল মার্কস ৪০ এর কম অর্থাৎ গ্রেড F)
    weak_students_query = '''
        SELECT DISTINCT s.student_id, s.name as student_name, s.batch, d.name as dept_name,
               'Theory' as exam_type, tm.subject_code, tm.total as marks
        FROM theory_marks tm
        JOIN students s ON tm.student_id = s.student_id
        JOIN departments d ON s.department_id = d.id
        WHERE tm.total < 40
        UNION
        SELECT DISTINCT s.student_id, s.name as student_name, s.batch, d.name as dept_name,
               'Lab' as exam_type, lm.subject_code, lm.total as marks
        FROM lab_marks lm
        JOIN students s ON lm.student_id = s.student_id
        JOIN departments d ON s.department_id = d.id
        WHERE lm.total < 40
    '''
    weak_rows = conn.execute(weak_students_query).fetchall()
    weak_students_list = [dict(r) for r in weak_rows]

    # ৪. পাস বনাম ফেল অনুপাত (ডোনাট চার্টের জন্য)
    # এখানে মোট এন্ট্রির মধ্যে কতজন পাস (>=৪০) এবং কতজন ফেল (<৪০) তা জেনারেট করা হয়েছে
    total_theory = conn.execute('SELECT COUNT(*) FROM theory_marks').fetchone()[0] or 0
    fail_theory = conn.execute('SELECT COUNT(*) FROM theory_marks WHERE total < 40').fetchone()[0] or 0
    
    total_lab = conn.execute('SELECT COUNT(*) FROM lab_marks').fetchone()[0] or 0
    fail_lab = conn.execute('SELECT COUNT(*) FROM lab_marks WHERE total < 40').fetchone()[0] or 0
    
    total_entries = total_theory + total_lab
    total_fails = fail_theory + fail_lab
    total_passes = total_entries - total_fails

    conn.close()

    return jsonify({
        'department_distribution': {
            'labels': dept_labels,
            'data': dept_counts
        },
        'performance_radar': performance_radar,
        'pass_fail_summary': {
            'labels': ['Passed Courses', 'Failed Courses (F Grade)'],
            'data': [total_passes, total_fails]
        },
        'weak_students_count': len(weak_students_list),
        'weak_students_details': weak_students_list
    })


# ─── SIMPLE PDF GENERATORS (uses WeasyPrint, saves to static/generated)
@app.route('/api/pdf/exam', methods=['POST'])
def pdf_exam():
    try:
        d = request.get_json() or {}
        exam_type = d.get('exam_type', 'lab')
        batch = d.get('batch', '')
        dept_id = d.get('department_id')
        sem_id = d.get('semester_id')

        if dept_id is None or sem_id is None or str(dept_id).strip() == '' or str(sem_id).strip() == '':
            return jsonify({'error': 'department_id and semester_id are required'}), 400

        try:
            dept_id = int(dept_id)
            sem_id = int(sem_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'department_id and semester_id must be valid integers'}), 400

        marks = fetch_student_marks(exam_type, dept_id, sem_id, batch)
        conn = get_db()
        dept_row = conn.execute('SELECT name, code FROM departments WHERE id=?', (dept_id,)).fetchone()
        dept_name = dept_row['name'] if dept_row else ''
        conn.close()

        out_dir = os.path.join(app.static_folder, 'generated')
        os.makedirs(out_dir, exist_ok=True)
        fname = f'exam_{exam_type}_{dept_id}_{sem_id}_{int(datetime.datetime.now().timestamp())}.pdf'
        out_path = os.path.join(out_dir, fname)
        config = get_wkhtmltopdf_config()
        generated_on = datetime.datetime.now().strftime('%d/%m/%Y')
        if config:
            html = render_template('pdf_exam.html', marks=marks, exam_type=exam_type, batch=batch, dept_name=dept_name, generated_on=generated_on)
            if not render_pdf(html, out_path):
                return jsonify({'error': 'PDF rendering failed using wkhtmltopdf.'}), 500
        else:
            if not generate_exam_pdf_fpdf(marks, exam_type, batch, out_path, dept_name=dept_name, generated_on=generated_on):
                return jsonify({'error': 'PDF fallback generation failed.'}), 500

        return jsonify({'url': f'/static/generated/{fname}'}), 200
    except Exception as e:
        logging.exception('Failed to generate exam PDF')
        if 'ENV_DEVELOPMENT' in globals() and ENV_DEVELOPMENT:
            return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500
        return jsonify({'error': str(e)}), 500


@app.route('/api/pdf/student-cgpa', methods=['POST'])
def pdf_student_cgpa():
    try:
        d = request.get_json() or {}
        student_id = d.get('student_id')
        sem_id = d.get('semester_id')
        if not student_id:
            return jsonify({'error': 'student_id required'}), 400

        result = fetch_student_cgpa(student_id, sem_id)
        if not result:
            return jsonify({'error': 'Student not found'}), 404

        student = result['student']
        records = result['records']
        cgpa = result['cgpa']
        dept_name = student.get('dept_name', '')
        selected_semester = ''
        conn = get_db()
        if sem_id:
            sem_row = conn.execute('SELECT number, name FROM semesters WHERE id=?', (sem_id,)).fetchone()
            if sem_row:
                selected_semester = sem_row['name'] or f'Semester {sem_row["number"]}'
        conn.close()

        out_dir = os.path.join(app.static_folder, 'generated')
        os.makedirs(out_dir, exist_ok=True)
        fname = f'student_cgpa_{student_id}_{int(datetime.datetime.now().timestamp())}.pdf'
        out_path = os.path.join(out_dir, fname)
        config = get_wkhtmltopdf_config()
        generated_on = datetime.datetime.now().strftime('%d/%m/%Y')
        if config:
            html = render_template('pdf_student_cgpa.html', student=student, records=records, cgpa=cgpa, dept_name=dept_name, generated_on=generated_on, selected_semester=selected_semester)
            if not render_pdf(html, out_path):
                return jsonify({'error': 'PDF rendering failed using wkhtmltopdf.'}), 500
        else:
            if not generate_student_cgpa_pdf_fpdf(student, out_path, dept_name=dept_name, generated_on=generated_on, cgpa=cgpa):
                return jsonify({'error': 'PDF fallback generation failed.'}), 500

        return jsonify({'url': f'/static/generated/{fname}'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/pdf/batch-cgpa', methods=['POST'])
def pdf_batch_cgpa():
    try:
        d = request.get_json() or {}
        batch = d.get('batch')
        dept_id = d.get('department_id')
        sem_id = d.get('semester_id')
        if not batch or not dept_id:
            return jsonify({'error': 'batch and department_id are required'}), 400

        students = fetch_batch_cgpa(batch, dept_id, sem_id)
        conn = get_db()
        dept_name = ''
        if dept_id:
            drow = conn.execute('SELECT name FROM departments WHERE id=?', (dept_id,)).fetchone()
            dept_name = drow['name'] if drow else ''
        conn.close()

        out_dir = os.path.join(app.static_folder, 'generated')
        os.makedirs(out_dir, exist_ok=True)
        fname = f'batch_cgpa_{batch}_{int(datetime.datetime.now().timestamp())}.pdf'
        out_path = os.path.join(out_dir, fname)
        config = get_wkhtmltopdf_config()
        generated_on = datetime.datetime.now().strftime('%d/%m/%Y')
        if config:
            html = render_template('pdf_batch_cgpa.html', students=students, batch=batch, dept_name=dept_name, generated_on=generated_on)
            if not render_pdf(html, out_path):
                return jsonify({'error': 'PDF rendering failed using wkhtmltopdf.'}), 500
        else:
            if not generate_batch_cgpa_pdf_fpdf(students, batch, out_path, dept_name=dept_name, generated_on=generated_on):
                return jsonify({'error': 'PDF fallback generation failed.'}), 500

        return jsonify({'url': f'/static/generated/{fname}'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def fetch_student_marks(exam_type, dept_id, sem_id, batch=None):
    conn = get_db()
    if exam_type == 'lab':
        query = '''
            SELECT 
                s.student_id,
                s.name,
                s.batch,
                lm.subject_code,
                lm.subject_name,
                lm.attendance,
                lm.lab_report,
                lm.viva,
                lm.practical,
                lm.mid_exam,
                lm.final_exam,
                lm.total
            FROM students s
            LEFT JOIN lab_marks lm ON s.student_id = lm.student_id AND lm.semester_id = ?
            WHERE s.department_id = ? AND s.semester_id = ?
        '''
    else:  # theory
        query = '''
            SELECT 
                s.student_id,
                s.name,
                s.batch,
                tm.subject_code,
                tm.subject_name,
                tm.attendance,
                tm.assignment,
                tm.class_test,
                tm.quiz,
                tm.presentation,
                tm.mid_exam,
                tm.final_exam,
                tm.total
            FROM students s
            LEFT JOIN theory_marks tm ON s.student_id = tm.student_id AND tm.semester_id = ?
            WHERE s.department_id = ? AND s.semester_id = ?
        '''

    params = [sem_id, dept_id, sem_id]
    if batch:
        query += ' AND s.batch = ?'
        params.append(batch)
    query += ' ORDER BY s.student_id, s.name'

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.route('/api/student-marks', methods=['POST'])
def get_student_marks():
    """Fetch student marks based on exam type, department, semester, and batch"""
    try:
        d = request.get_json() or {}
        exam_type = d.get('exam_type', 'lab')
        dept_id = d.get('department_id')
        sem_id = d.get('semester_id')
        batch = d.get('batch', '')

        if dept_id is None or sem_id is None or str(dept_id).strip() == '' or str(sem_id).strip() == '':
            return jsonify({'error': 'Department and Semester are required'}), 400

        try:
            dept_id = int(dept_id)
            sem_id = int(sem_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'Department and Semester must be valid integers'}), 400

        return jsonify(fetch_student_marks(exam_type, dept_id, sem_id, batch)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def load_student_marks_for_cgpa(student_id, upto_sem_id=None):
    conn = get_db()
    marks = []

    q_lab = '''
        SELECT lm.semester_id as semester_id,
               sem.number as sem_number,
               sem.name as semester_name,
               lm.subject_credit as total_credits,
               lm.total as total_marks
        FROM lab_marks lm
        JOIN semesters sem ON lm.semester_id = sem.id
        WHERE lm.student_id = ?'''
    params = [student_id]
    if upto_sem_id:
        q_lab += ' AND lm.semester_id <= ?'
        params.append(upto_sem_id)
    marks.extend([dict(r) for r in conn.execute(q_lab, params).fetchall()])

    q_theory = '''
        SELECT tm.semester_id as semester_id,
               sem.number as sem_number,
               sem.name as semester_name,
               tm.subject_credit as total_credits,
               tm.total as total_marks
        FROM theory_marks tm
        JOIN semesters sem ON tm.semester_id = sem.id
        WHERE tm.student_id = ?'''
    params = [student_id]
    if upto_sem_id:
        q_theory += ' AND tm.semester_id <= ?'
        params.append(upto_sem_id)
    marks.extend([dict(r) for r in conn.execute(q_theory, params).fetchall()])

    conn.close()
    return marks


def aggregate_cgpa_records(raw_marks):
    semester_map = {}
    for record in raw_marks:
        sem_id = record['semester_id']
        if sem_id not in semester_map:
            semester_map[sem_id] = {
                'semester_id': sem_id,
                'semester_number': record.get('sem_number'),
                'semester_name': record.get('semester_name'),
                'total_credits': 0.0,
                'quality_points': 0.0
            }
        credit = float(record.get('total_credits') or 0.0)
        total_marks = float(record.get('total_marks') or 0.0)
        gp, _ = calculate_grade_points(total_marks)
        semester_map[sem_id]['total_credits'] += credit
        semester_map[sem_id]['quality_points'] += gp * credit

    records = []
    total_quality = 0.0
    total_credits = 0.0
    for sem in sorted(semester_map.values(), key=lambda item: item.get('semester_number') or 0):
        credits = sem['total_credits']
        gpa = round(sem['quality_points'] / credits, 2) if credits > 0 else 0.0
        records.append({
            'semester_id': sem['semester_id'],
            'semester_name': sem['semester_name'],
            'semester_number': sem['semester_number'],
            'sem_number': sem['semester_number'],
            'total_credits': credits,
            'earned_credits': credits,
            'gpa': gpa
        })
        total_quality += sem['quality_points']
        total_credits += credits

    cgpa = round(total_quality / total_credits, 2) if total_credits > 0 else 0.0
    return records, cgpa


def fetch_student_cgpa(student_id, upto_sem_id=None):
    conn = get_db()
    student = conn.execute(
        'SELECT s.*, d.code as dept_code, d.name as dept_name FROM students s JOIN departments d ON s.department_id=d.id WHERE s.student_id=?',
        (student_id,)
    ).fetchone()
    if not student:
        conn.close()
        return None
    # If a specific semester is requested, compute that semester's GPA
    # from subject-level marks (lab + theory) rather than relying on
    # precomputed `semester_results`. This ensures the current semester
    # GPA is derived directly from individual subject totals.
    if upto_sem_id:
        raw_marks = load_student_marks_for_cgpa(student_id, upto_sem_id)
        records, cgpa = aggregate_cgpa_records(raw_marks)
        conn.close()
        return {'student': dict(student), 'records': records, 'cgpa': cgpa}

    params = [student_id]
    q = 'SELECT sr.*, sem.number as sem_number FROM semester_results sr JOIN semesters sem ON sr.semester_id=sem.id WHERE sr.student_id=?'
    if upto_sem_id:
        q += ' AND sr.semester_id <= ?'
        params.append(upto_sem_id)
    q += ' ORDER BY sem.number'

    rows = conn.execute(q, params).fetchall()
    records = [dict(r) for r in rows]
    if not records:
        raw_marks = load_student_marks_for_cgpa(student_id, upto_sem_id)
        records, cgpa = aggregate_cgpa_records(raw_marks)
    else:
        total_credits = sum([r['total_credits'] for r in records]) if records else 0.0
        cgpa = round(sum([(r.get('gpa') or 0) * (r.get('total_credits') or 0) for r in records]) / total_credits, 2) if total_credits > 0 else 0.0

    conn.close()
    return {'student': dict(student), 'records': records, 'cgpa': cgpa}


def fetch_batch_cgpa(batch, dept_id, upto_sem_id=None):
    conn = get_db()
    params = [batch, dept_id]
    q = 'SELECT student_id, name, batch, department_id FROM students WHERE batch=? AND department_id=?'
    if upto_sem_id:
        q += ' AND semester_id <= ?'
        params.append(upto_sem_id)
    q += ' ORDER BY name'

    rows = conn.execute(q, params).fetchall()
    result = []
    for s in rows:
        student_result = fetch_student_cgpa(s['student_id'], upto_sem_id)
        result.append({
            'student_id': s['student_id'],
            'name': s['name'],
            'batch': s['batch'],
            'department_id': s['department_id'],
            'cgpa': student_result['cgpa'] if student_result else 0.0,
            'records': student_result['records'] if student_result else []
        })
    conn.close()
    return result


# New endpoint: return structured student CGPA data for export
@app.route('/api/student-cgpa-data', methods=['POST'])
def student_cgpa_data():
    try:
        d = request.get_json() or {}
        student_id = d.get('student_id')
        upto_sem_id = d.get('semester_id')
        if not student_id:
            return jsonify({'error': 'student_id is required'}), 400
        result = fetch_student_cgpa(student_id, upto_sem_id)
        if not result:
            return jsonify({'error': 'Student not found'}), 404
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# New endpoint: return batch CGPA list for export
@app.route('/api/batch-cgpa-data', methods=['POST'])
def batch_cgpa_data():
    try:
        d = request.get_json() or {}
        batch = d.get('batch')
        dept_id = d.get('department_id')
        upto_sem_id = d.get('semester_id')
        if not batch or not dept_id:
            return jsonify({'error': 'batch and department_id are required'}), 400
        result = fetch_batch_cgpa(batch, dept_id, upto_sem_id)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─── SERVE FRONTEND ───────────────────────────────────────────────────────────
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.template_folder, 'index.html')



# ─── SERVER START (SMART CONFIGURATION) ──────────────────────────────────────
# এই ভ্যারিয়েবলটি True রাখলে ডেভেলপমেন্ট মোড, False করে দিলে প্রোডাকশন মোড হবে
ENV_DEVELOPMENT = True  #False

if __name__ == '__main__':
    init_db()
    
    if ENV_DEVELOPMENT:
        logging.info("Running in development mode on http://localhost:5000")
        app.run(debug=True, host='127.0.0.1', port=5000)
    else:
        logging.info("Running in production mode on port 5000")
        app.run(debug=False, host='0.0.0.0', port=5000)





