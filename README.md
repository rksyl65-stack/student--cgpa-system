# Lab ও Theory Performance Evaluation System
## সম্পূর্ণ সেটআপ ও ব্যবহার গাইড

---

## 📁 ফাইল স্ট্রাকচার

```
perf_eval/
├── app.py                  ← Flask Backend (API + Auto DB)
├── requirements.txt        ← Python packages
├── database.db            ← SQLite Database (auto-created)
├── templates/
│   └── index.html         ← Main Frontend HTML
├── static/
│   ├── css/
│   │   └── style.css      ← All Styles
│   └── js/
│       └── app.js         ← All JavaScript Logic
└── note/                  ← Development notes (ignore করুন)
    ├── apppp.js
    └── js.js
```

---

## ⚙️ সেটআপ করার নিয়ম

### Step 1: Python ইন্সটল করুন
Python 3.8+ দরকার। [https://python.org](https://python.org) থেকে ডাউনলোড করুন।

### Step 2: Dependencies ইন্সটল করুন
```bash
cd perf_eval
pip install -r requirements.txt
```

`requirements.txt` এ যা আছে:
```
flask==3.0.0
flask-cors==4.0.0
PyJWT==2.8.0
pdfkit==1.0.0
fpdf2==2.8.7
```

### Step 3: Server চালু করুন
```bash
python app.py
```

✅ সফলভাবে চালু হলে দেখবেন:
```
✅ Database initialized with departments, semesters, and custom tables.
🚀 Server running on http://localhost:5000
```

### Step 4: Browser এ খুলুন
```
http://localhost:5000
```

---

## 🔐 প্রথমবার ব্যবহার

1. **Sign Up** বাটনে ক্লিক করুন
2. নাম, ইমেইল, পাসওয়ার্ড দিন → রেজিস্ট্রেশন করুন
3. সফল হলে পপআপ দেখাবে: **"রেজিস্ট্রেশন সম্পন্ন হয়েছে! এখন লগইন করুন।"**
4. **Login** বাটনে ক্লিক করে লগইন করুন
5. Dashboard এ প্রবেশ করুন

> 🔑 লগইন হলে JWT Token স্বয়ংক্রিয়ভাবে localStorage-এ সেভ হয় এবং ৭ দিন পর্যন্ত valid থাকে।

---

## 🗄️ Database (Auto Create)

`database.db` ফাইলটি **স্বয়ংক্রিয়ভাবে** তৈরি হবে।

### ৯টি Default Department (Auto):
| Code | Department Name |
|------|----------------|
| CSE | Computer Science & Engineering |
| EEE | Electrical & Electronic Engineering |
| BBA | Bachelor of Business Administration |
| EMBA | Executive MBA |
| ENGLISH | English |
| Fashion design | Fashion Design |
| M.ED | Master of Education |
| MBA | Master of Business Administration |
| MPH | Master of Public Health |

### প্রতি Department এ ৮টি Semester (Auto):
Semester 1 → Semester 8 স্বয়ংক্রিয়ভাবে তৈরি হয়।

### নতুন Department যোগ করলে:
8টি Semester স্বয়ংক্রিয়ভাবে তৈরি হবে ✓

### Database Tables:
| Table | বর্ণনা |
|-------|--------|
| `users` | লগইন ইউজার (Teacher) |
| `departments` | ডিপার্টমেন্ট তালিকা |
| `semesters` | প্রতি ডিপার্টমেন্টের সেমিস্টার |
| `students` | স্টুডেন্ট তথ্য |
| `lab_marks` | ল্যাব মার্কস (১০০ নম্বর) |
| `theory_marks` | থিওরি মার্কস (১০০ নম্বর) |
| `marks` | সমন্বিত মার্কস (General) |

---

## 📊 Marking System

### Lab (মোট ১০০ মার্কস)

#### Continuous Assessment (মোট ৫০):
| Component | সর্বোচ্চ |
|-----------|---------|
| Attendance | ১০ |
| Lab Report | ২০ |
| Viva | ১০ |
| Practical | ১০ |

#### Exam (মোট ৫০):
| পরীক্ষা | সর্বোচ্চ |
|---------|---------|
| Mid Exam | ২০ |
| Final Exam | ৩০ |

---

### Theory (মোট ১০০ মার্কস)

#### Continuous Assessment (মোট ৫০):
| Component | সর্বোচ্চ |
|-----------|---------|
| Attendance | ১০ |
| Assignment | ১০ |
| Class Test | ১০ |
| Quiz | ১০ |
| Presentation | ১০ |

#### Exam (মোট ৫০):
| পরীক্ষা | সর্বোচ্চ |
|---------|---------|
| Mid Exam | ২০ |
| Final Exam | ৩০ |

---

## 🎓 Bangladesh UGC Grading System

মার্কস সেভ হওয়ার সময় স্বয়ংক্রিয়ভাবে গ্রেড নির্ধারণ হয়:

| মোট মার্কস | Letter Grade | Grade Point |
|-----------|-------------|-------------|
| ৮০ - ১০০ | A+ | 4.00 |
| ৭৫ - ৭৯ | A | 3.75 |
| ৭০ - ৭৪ | A- | 3.50 |
| ৬৫ - ৬৯ | B+ | 3.25 |
| ৬০ - ৬৪ | B | 3.00 |
| ৫৫ - ৫৯ | B- | 2.75 |
| ৫০ - ৫৪ | C+ | 2.50 |
| ৪৫ - ৪৯ | C | 2.25 |
| ৪০ - ৪৪ | D | 2.00 |
| ০ - ৩৯ | F | 0.00 |

Quality Point = Grade Point × Credit Hour

---

## 🌐 API Endpoints

সব API endpoint-এ `Authorization: Bearer <token>` header প্রয়োজন (register ও login বাদে)।

### Auth
| Method | Endpoint | বর্ণনা |
|--------|----------|--------|
| POST | `/api/auth/register` | নতুন ইউজার রেজিস্ট্রেশন |
| POST | `/api/auth/login` | লগইন (Token পাওয়া) |
| GET | `/api/auth/profile` | প্রোফাইল দেখুন |
| PUT | `/api/auth/profile` | নাম/পাসওয়ার্ড/ছবি আপডেট |

### Departments & Semesters
| Method | Endpoint | বর্ণনা |
|--------|----------|--------|
| GET | `/api/departments` | সব ডিপার্টমেন্ট |
| POST | `/api/departments` | নতুন ডিপার্টমেন্ট (৮ সেমিস্টার auto) |
| GET | `/api/departments/:id/semesters` | নির্দিষ্ট ডিপার্টমেন্টের সেমিস্টার |

### Students
| Method | Endpoint | বর্ণনা |
|--------|----------|--------|
| GET | `/api/students` | স্টুডেন্ট লিস্ট (filter: dept, sem, batch, search) |
| POST | `/api/students` | নতুন স্টুডেন্ট যোগ |
| GET | `/api/students/:id` | একজন স্টুডেন্টের তথ্য |
| PUT | `/api/students/:id` | স্টুডেন্ট আপডেট |
| DELETE | `/api/students/:id` | স্টুডেন্ট ও তার সব মার্কস ডিলিট |

### Lab Marks
| Method | Endpoint | বর্ণনা |
|--------|----------|--------|
| GET | `/api/lab-marks` | ল্যাব মার্কস লিস্ট (filter: dept, sem, batch, student_id) |
| POST | `/api/lab-marks` | ল্যাব মার্কস সেভ/আপডেট |
| PUT | `/api/lab-marks/:id` | ল্যাব মার্কস আপডেট |
| DELETE | `/api/lab-marks/:id` | ল্যাব মার্কস ডিলিট |

### Theory Marks
| Method | Endpoint | বর্ণনা |
|--------|----------|--------|
| GET | `/api/theory-marks` | থিওরি মার্কস লিস্ট (filter: dept, sem, batch, student_id) |
| POST | `/api/theory-marks` | থিওরি মার্কস সেভ/আপডেট |
| PUT | `/api/theory-marks/:id` | থিওরি মার্কস আপডেট |
| DELETE | `/api/theory-marks/:id` | থিওরি মার্কস ডিলিট |

### Stats & Reports
| Method | Endpoint | বর্ণনা |
|--------|----------|--------|
| GET | `/api/stats/dashboard` | Dashboard summary (total students, dept performance) |
| GET | `/api/stats/semester/:id` | নির্দিষ্ট সেমিস্টারের সব স্টুডেন্টের রেজাল্ট |

### Marks (General)
| Method | Endpoint | বর্ণনা |
|--------|----------|--------|
| POST | `/api/marks/submit` | সমন্বিত মার্কস সেভ (marks table) |

---

## 📱 Features

- ✅ Mobile Responsive
- ✅ Desktop Responsive
- ✅ JWT Authentication (৭ দিন valid)
- ✅ Auto SQLite Database (`database.db`)
- ✅ ৯টি Default Department (Auto)
- ✅ ৮টি Semester per Department (Auto)
- ✅ Lab ও Theory আলাদা মডিউল
- ✅ মার্কস সেভে Duplicate প্রতিরোধ (Upsert)
- ✅ UGC Grade ও GPA Auto-calculation
- ✅ Credit Hour support (1.0 / 1.5 / 2.0 / 3.0 / 4.0)
- ✅ Student Search (ID বা নাম দিয়ে)
- ✅ Batch Filter (Day Batch / Diploma Batch)
- ✅ PDF Report Generation (Lab, Theory, CGPA)
- ✅ Graph Charts (Bar, Line, Radar, Doughnut)
- ✅ Weak Student Detection (Overall < 15)
- ✅ Profile Image Upload (Base64)
- ✅ Animated Header
- ✅ Sidebar Navigation (Collapsible)
- ✅ Back Button Navigation

---

## 🛠️ সমস্যা সমাধান

### সার্ভার চালু না হলে:
```bash
# pip দিয়ে package আবার ইন্সটল করুন
pip install flask flask-cors PyJWT
```

### Port 5000 busy থাকলে:
```bash
# অন্য port ব্যবহার করুন
python app.py --port 8080
```
অথবা `app.py` এর শেষ লাইনে `port=5000` → `port=8080` পরিবর্তন করুন।

### Database রিসেট করতে চাইলে:
```bash
# database.db ফাইলটি ডিলিট করুন, পরের রান-এ নতুন তৈরি হবে
del database.db       # Windows
rm database.db        # Mac/Linux
```

---

## 🧾 PDF Environment
PDF জেনারেশন ফিচারের জন্য `wkhtmltopdf` ইনস্টল থাকা প্রয়োজন। না থাকলে `/api/pdf/...` route বা frontend থেকে PDF তৈরি কাজ নাও করতে পারে।

### Windows-এ ইনস্টল
1. https://wkhtmltopdf.org/downloads.html থেকে Windows installer ডাউনলোড করুন
2. ইনস্টল করুন
3. যদি দরকার হয়, `wkhtmltopdf.exe` এর path `C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe` এ স্থাপন করুন

### Mac/Linux-এ ইনস্টল
```bash
# Ubuntu/Debian
sudo apt-get install wkhtmltopdf

# Mac (Homebrew)
brew install wkhtmltopdf
```

---

## 📌 গুরুত্বপূর্ণ নোট

- **Database ফাইলের নাম:** `database.db` (পুরনো README-তে ভুলভাবে `perf_eval.db` লেখা ছিল)
- একই Student ID ও Subject Code-এ দ্বিতীয়বার মার্কস দিলে **আপডেট** হবে, নতুন row তৈরি হবে না
- স্টুডেন্ট ডিলিট করলে তার সব Lab ও Theory মার্কসও ডিলিট হয়
- CGPA রিপোর্টের জন্য `/api/reports/semester-cgpa` endpoint frontend থেকে call হয় — এটি backend-এ যোগ করতে হতে পারে প্রয়োজনে#   s t u d e n t - - c g p a - s y s t e m  
 