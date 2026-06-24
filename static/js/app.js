              /* ═══════════════════════════════════════════════
                Lab & Theory Performance Evaluation System
                Main JavaScript Application — FIXED VERSION
              ═══════════════════════════════════════════════ */

// Use relative API path to avoid CORS/host mismatches when the app
// is served from the same origin. This ensures requests work whether
// the page is accessed via localhost or 127.0.0.1.

const API = '/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = JSON.parse(localStorage.getItem('user') || 'null');
let pageHistory = [];
let currentPage = 'dashboard';
let departments = [];
let charts = {};

/* ─── INIT ─────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  updateClock();
  setInterval(updateClock, 1000);
  if (TOKEN) {
    if (USER) {
      await enterApp();
    } else {
      const restored = await restoreSession();
      if (restored) await enterApp();
    }
  }

  // Marks entry type change event listeners
  const meType = document.getElementById('meType');
  const meExam = document.getElementById('meExamType');
  const meDept = document.getElementById('meDept');

  if (meType) meType.onchange = renderMarksForm;
  if (meExam) meExam.onchange = renderMarksForm;
  if (meDept) meDept.onchange = loadMeSemesters;
});

function updateClock() {
  const el = document.getElementById('currentTime');
  if (el) el.textContent = new Date().toLocaleString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
}

/* ─── AUTH ─────────────────────────────────────── */
function showLogin() {
  document.getElementById('loginForm').classList.add('active');
  document.getElementById('signupForm').classList.remove('active');
}

function showSignup() {
  document.getElementById('signupForm').classList.add('active');
  document.getElementById('loginForm').classList.remove('active');
}

async function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!name || !email || !password) { showToast('Fill in all the information.', 'error'); return; }

  const res = await api('/auth/register', 'POST', { name, email, password });
  if (res.message) {
    showPopup('Success!', 'Registration completed! Please login.');
    showLogin();
  } else {
    showToast(res.error || 'Error occurred', 'error');
  }
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showToast('Enter your email and password.', 'error'); return; }

  const res = await api('/auth/login', 'POST', { email, password });
  if (res.token) {
    TOKEN = res.token;
    USER = res.user;
    localStorage.setItem('token', TOKEN);
    localStorage.setItem('user', JSON.stringify(USER));
    enterApp();
  } else {
    showToast(res.error || 'Login failed', 'error');
  }
}

/* ─── API HELPER (একটিমাত্র সংজ্ঞা) ────────────── */
async function api(endpoint, method = 'GET', body = null) {
  try {
    const opts = { method, headers: {} };
    if (TOKEN) {
      opts.headers['Authorization'] = `Bearer ${TOKEN}`;
    }
    if (body && method !== 'GET') {
      if (body instanceof FormData) {
        opts.body = body;
      } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(API + endpoint, opts);
    const data = await res.json().catch(() => null);
    if (res.status === 401) {
      if (TOKEN) {
        doLogout();
        showToast('Session expired or invalid. Please login again.', 'error');
      }
      return data || { error: 'Unauthorized', status: 401 };
    }
    return data;
  } catch (e) {
    console.error(e);
    return { error: 'Server connection problem' };
  }
}

function openPdfInTab(url) {
  if (!url) return false;
  const win = window.open(url, '_blank');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    showToast('New tab blocked, please use the download button.', 'error');
    return false;
  }
  win.focus();
  return true;
}

async function restoreSession() {
  const data = await api('/auth/profile');
  if (data && data.id) {
    USER = data;
    localStorage.setItem('user', JSON.stringify(USER));
    return true;
  }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  TOKEN = '';
  USER = null;
  return false;
}

function doLogout() {
  TOKEN = ''; USER = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('authOverlay').classList.add('active');
  document.getElementById('authOverlay').classList.remove('hidden');
  showLogin();
}

async function enterApp() {
  document.getElementById('authOverlay').classList.remove('active');
  document.getElementById('authOverlay').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  if (USER) {
    const avatar = USER.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(USER.name)}&background=1a56db&color=fff`;
    document.getElementById('topbarAvatar').src = avatar;
  }
  await loadDepartments();
  initPdfDashboard();
  navigate('dashboard');
}

function togglePassword(fieldId, button) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  const icon = button.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    if (icon) icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

/**
 * Initialize PDF dashboard dropdowns when the app is ready.
 */
function initPdfDashboard() {
  populateDeptDropdowns('examDept', 'examSem');
  populateDeptDropdowns('studentDept', 'studentSem');
  populateDeptDropdowns('batchDept', 'batchSem');
}


/* ─── NAVIGATION ────────────────────────────────── */
function navigate(page) {
  if (currentPage !== page) {
    pageHistory.push(currentPage);
  }
  currentPage = page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll(`.nav-item[onclick*="${page}"]`).forEach(n => n.classList.add('active'));

  const backBtn = document.getElementById('backBtn');
  if (pageHistory.length > 0 && page !== 'dashboard') {
    backBtn.style.display = 'flex';
  } else {
    backBtn.style.display = 'none';
  }

  const loaders = {
    'dashboard': loadDashboard,
    'departments': loadDeptAccordion,
    'students': () => { populateDeptDropdowns('filterDept', 'filterSem'); loadStudents(); },
    'add-student': () => { populateDeptDropdowns('addDept', 'addSem'); },
    'marks-entry': () => { populateDeptDropdowns('meDept', 'meSem'); renderMarksForm(); },
    
      //'marks-view': () => { populateDeptDropdowns('mvDept', 'mvSem'); },

      'marks-view': () => { 
      populateDeptDropdowns('mvDept', 'mvSem'); 
      loadMvMarks(); // এই ফাংশনটি কল  যেন পেজে ঢোকার সাথে সাথেই সব মার্কস লোড হয়ে যায়
      },

    'graph': () => { populateGraphFilters(); loadGraphData(); },
    'pdf-gen': () => { 
      populateDeptDropdowns('examDept', 'examSem'); 
      populateDeptDropdowns('studentDept', 'studentSem'); 
      populateDeptDropdowns('batchDept', 'batchSem'); 
    },
    'profile': loadProfile,
  };
  if (loaders[page]) loaders[page]();

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function goBack() {
  if (pageHistory.length > 0) {
    const prev = pageHistory.pop();
    navigate(prev);
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const wrapper = document.querySelector('.main-wrapper');
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('open');
  } else {
    sidebar.classList.toggle('collapsed');
    wrapper.classList.toggle('expanded');
  }
}

/* ─── LOAD DEPARTMENTS ──────────────────────────── */
async function loadDepartments() {
  let data = null;
  if (TOKEN) {
    data = await api('/departments');
  }
  if (!Array.isArray(data) || data.error) {
    try {
      const res = await fetch(API + '/public/departments');
      if (res.ok) data = await res.json(); else data = [];
    } catch (e) {
      console.error('Public departments fetch failed', e);
      data = [];
    }
  }
  if (Array.isArray(data)) departments = data;
  return departments;
}

function populateDeptDropdowns(deptId, semId) {
  const el = document.getElementById(deptId);
  if (!el) return;
  el.innerHTML = '<option value="">Choose a department</option>';
  departments.forEach(d => {
    el.innerHTML += `<option value="${d.id}">${d.code} - ${d.name}</option>`;
  });
  el.onchange = () => loadSemestersFor(semId, deptId);
}

async function loadSemestersFor(semId, deptId) {
  const deptEl = document.getElementById(deptId);
  const semEl = document.getElementById(semId);
  if (!semEl || !deptEl || !deptEl.value) return;
  let data = null;
  if (TOKEN) {
    data = await api(`/departments/${deptEl.value}/semesters`);
  }
  if (!Array.isArray(data) || data.error) {
    try {
      const res = await fetch(API + `/public/departments/${deptEl.value}/semesters`);
      data = res.ok ? await res.json() : [];
    } catch (e) {
      console.error('Public semesters fetch failed', e);
      data = [];
    }
  }
  semEl.innerHTML = '<option value="">Choose a semester</option>';
  if (Array.isArray(data)) {
    data.forEach(s => {
      semEl.innerHTML += `<option value="${s.id}">Semester ${s.number}</option>`;
    });
  }
}

/* ─── DASHBOARD ─────────────────────────────────── */
async function loadDashboard() {
  const data = await api('/stats/dashboard');
  if (data.error) return;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card" style="border-left-color:#1a56db">
      <div class="stat-icon" style="background:#e8eefb;color:#1a56db"><i class="fas fa-users"></i></div>
      <div class="stat-info"><h3>${data.total_students}</h3><p>Total Students</p></div>
    </div>
    <div class="stat-card" style="border-left-color:#10b981">
      <div class="stat-icon" style="background:#d1fae5;color:#10b981"><i class="fas fa-building"></i></div>
      <div class="stat-info"><h3>${data.total_departments}</h3><p>Departments</p></div>
    </div>
    <div class="stat-card" style="border-left-color:#f59e0b">
      <div class="stat-icon" style="background:#fef3c7;color:#f59e0b"><i class="fas fa-flask"></i></div>
      <div class="stat-info"><h3>Lab</h3><p>Performance Module</p></div>
    </div>
    <div class="stat-card" style="border-left-color:#06b6d4">
      <div class="stat-icon" style="background:#e0f2fe;color:#06b6d4"><i class="fas fa-book"></i></div>
      <div class="stat-info"><h3>Theory</h3><p>Performance Module</p></div>
    </div>
  `;

  const colors = ['#1a56db', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6'];
  const cardsHtml = (data.dept_performance || []).map((d, i) => `
    <div class="dept-card" onclick="navigate('students')" style="border-top-color:${colors[i % colors.length]}">
      <div class="dept-card-code" style="color:${colors[i % colors.length]}">${d.code}</div>
      <div class="dept-card-name">${d.name}</div>
      <div class="dept-card-stats">
        <div class="dept-card-stat"><div class="val">${d.student_count}</div><div class="lbl">Students</div></div>
        <div class="dept-card-stat"><div class="val">${d.lab_avg}</div><div class="lbl">Lab Avg</div></div>
        <div class="dept-card-stat"><div class="val">${d.theory_avg}</div><div class="lbl">Theory Avg</div></div>
      </div>
      <div class="dept-card-bar">
        <div class="dept-card-bar-fill" style="width:${Math.min(d.overall * 2, 100)}%;background:${colors[i % colors.length]}"></div>
      </div>
    </div>
  `).join('');
  document.getElementById('deptCardsGrid').innerHTML = cardsHtml || '<p style="color:#94a3b8;padding:20px">No departments found</p>';

  const labels = (data.dept_performance || []).map(d => d.code);
  const labData = (data.dept_performance || []).map(d => d.lab_avg);
  const thData = (data.dept_performance || []).map(d => d.theory_avg);

  if (charts.deptBar) charts.deptBar.destroy();
  const ctx = document.getElementById('deptBarChart');
  if (ctx) {
    charts.deptBar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Lab Average', data: labData, backgroundColor: 'rgba(26,86,219,0.7)', borderRadius: 6 },
          { label: 'Theory Average', data: thData, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 6 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { max: 30, beginAtZero: true } } }
    });
  }

  const weakHtml = (data.dept_performance || [])
    .filter(d => d.overall < 15 && d.student_count > 0)
    .map(d => `
      <div class="weak-item">
        <div><div class="name">${d.name} (${d.code})</div><div class="score">Overall: ${d.overall}</div></div>
        <span class="weak-badge">Weak</span>
      </div>
    `).join('');
  document.getElementById('weakStudentList').innerHTML = weakHtml || '<p style="color:#10b981;font-weight:600;padding:12px">✓ All departments are performing well</p>';
}

/* ─── DEPT ACCORDION ─────────────────────────────── */
async function loadDeptAccordion() {
  await loadDepartments();
  let html = '';
  for (const d of departments) {
    const sems = await api(`/departments/${d.id}/semesters`);
    const semHtml = Array.isArray(sems) ? sems.map(s => `
      <div class="sem-badge" onclick="gotoSemStudents(${d.id},${s.id})">
        <i class="fas fa-layer-group"></i> Semester ${s.number}
      </div>`).join('') : '';
    html += `
      <div class="dept-item">
        <div class="dept-item-header" onclick="toggleAccordion(this)">
          <span><i class="fas fa-building" style="margin-right:10px"></i>${d.code} — ${d.name}</span>
          <div>
            <button class="btn-icon delete" onclick="event.stopPropagation(); deleteDepartment(${d.id})" title="Delete"> <i class="fas fa-trash"></i> </button>
            <i class="fas fa-chevron-down"></i>
          </div>
        </div>
        <div class="dept-item-body">
          <div class="sem-badges">${semHtml}</div>
        </div>
      </div>`;
  }
  document.getElementById('deptAccordion').innerHTML = html || '<p> No departments found</p>';
}

function toggleAccordion(header) {
  const body = header.nextElementSibling;
  const icon = header.querySelector('.fa-chevron-down, .fa-chevron-up');
  body.classList.toggle('open');
  if (icon) icon.className = body.classList.contains('open') ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
}

function gotoSemStudents(deptId, semId) {
  navigate('students');
  setTimeout(() => {
    const dEl = document.getElementById('filterDept');
    if (dEl) {
      dEl.value = deptId;
      loadStudentSemesters(() => {
        const sEl = document.getElementById('filterSem');
        if (sEl) { sEl.value = semId; loadStudents(); }
      });
    }
  }, 200);
}

function showAddDeptModal() {
  document.getElementById('modalTitle').textContent = 'Add New Department';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group"><label>Department Name</label><input type="text" id="newDeptName" placeholder="e.g., Computer Science"></div>
    <div class="form-group"><label>Short Code</label><input type="text" id="newDeptCode" placeholder="e.g., CSE"></div>
    <button class="btn-primary" onclick="addDepartment()"><i class="fas fa-save"></i> Add Department (8 semesters will be created automatically)</button>
  `;
  openModal();
}

async function addDepartment() {
  const name = document.getElementById('newDeptName').value.trim();
  const code = document.getElementById('newDeptCode').value.trim().toUpperCase();
  if (!name || !code) { showToast('Please fill in all fields', 'error'); return; }
  const res = await api('/departments', 'POST', { name, code });
  if (res.message) {
    showToast(res.message, 'success');
    closeModal();
    await loadDepartments();
    loadDeptAccordion();
  } else {
    showToast(res.error || 'Error', 'error');
  }
}

async function deleteDepartment(id) {
  if (!confirm('Are you sure you want to delete this department? All sub-data will be lost.')) return;
  const res = await api(`/departments/${id}`, 'DELETE');
  if (res.message) {
    showToast('Department deleted successfully.', 'success');
    await loadDepartments();
    loadDeptAccordion();
  } else {
    showToast(res.error || 'Error deleting department', 'error');
  }
}

/* ─── STUDENTS ───────────────────────────────────── */
async function loadStudentSemesters(cb) {
  const deptId = document.getElementById('filterDept')?.value;
  const semEl = document.getElementById('filterSem');
  if (!semEl) return;
  semEl.innerHTML = '<option value="">All Semesters</option>';
  if (deptId) {
    let data = null;
    if (TOKEN) {
      data = await api(`/departments/${deptId}/semesters`);
    }
    if (!Array.isArray(data) || data.error) {
      try {
        const res = await fetch(API + `/public/departments/${deptId}/semesters`);
        data = res.ok ? await res.json() : [];
      } catch (e) {
        console.error('Public semesters fetch failed', e);
        data = [];
      }
    }
    if (Array.isArray(data)) data.forEach(s => { semEl.innerHTML += `<option value="${s.id}">Semester ${s.number}</option>`; });
  }
  if (cb) cb();
  else loadStudents();
}

async function loadStudents() {
  const dept = document.getElementById('filterDept')?.value;
  const sem = document.getElementById('filterSem')?.value;
  const batch = document.getElementById('filterBatch')?.value;
  const search = document.getElementById('searchStudent')?.value;
  let url = '/students?';
  if (dept) url += `department_id=${dept}&`;
  if (sem) url += `semester_id=${sem}&`;
  if (batch) url += `batch=${encodeURIComponent(batch)}&`;
  if (search) url += `search=${encodeURIComponent(search)}&`;
  const data = await api(url);
  const tbody = document.getElementById('studentsBody');
  if (!tbody) return;
  if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8">No students found.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.student_id}</strong></td>
      <td>${s.name}</td>
      <td><span style="background:#e8eefb;color:#1a56db;padding:3px 8px;border-radius:12px;font-size:12px;font-weight:600">${s.batch}</span></td>
      <td>${s.dept_code || s.dept_name}</td>
      <td>Semester ${s.sem_number}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon edit" onclick="editStudentModal(${s.id})" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-icon delete" onclick="deleteStudent(${s.id})" title="Delete"><i class="fas fa-trash"></i></button>
          <button class="btn-icon print" onclick="printStudentPDF(${s.id})" title="PDF"><i class="fas fa-file-pdf"></i></button>
        </div>
      </td>
    </tr>`).join('');

  const dEl = document.getElementById('filterDept');
  if (dEl && dEl.options.length <= 1) {
    departments.forEach(d => { dEl.innerHTML += `<option value="${d.id}">${d.code} - ${d.name}</option>`; });
  }
}

async function addStudent() {
  const data = {
    student_id: document.getElementById('addStudentId').value.trim(),
    name: document.getElementById('addStudentName').value.trim(),
    batch: document.getElementById('addBatch').value,
    department_id: parseInt(document.getElementById('addDept').value),
    semester_id: parseInt(document.getElementById('addSem').value),
    email: document.getElementById('addStudentEmail').value.trim(),
    phone: document.getElementById('addStudentPhone').value.trim()
  };
  if (!TOKEN || !USER) {
    showToast('Please login first before adding a student.', 'error');
    showLogin();
    return;
  }
  if (!data.student_id || !data.name || !data.department_id || !data.semester_id) {
    showToast('Please fill in all required fields', 'error'); return;
  }
  const res = await api('/students', 'POST', data);
  if (res.message) {
    showToast('Student added successfully!', 'success');
    ['addStudentId', 'addStudentName', 'addStudentEmail', 'addStudentPhone'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    loadStudents();
    navigate('students');
  } else if (res.status === 401 || /unauthorized/i.test(res.error || '')) {
    showToast('Please login first before adding a student.', 'error');
    doLogout();
  } else {
    showToast(res.error || 'Error occurred while adding student', 'error');
  }
}

async function loadAddSemesters() {
  const deptId = document.getElementById('addDept').value;
  const semEl = document.getElementById('addSem');
  semEl.innerHTML = '<option value="">Loading...</option>';
  if (!deptId) { semEl.innerHTML = '<option value="">Please select a department first</option>'; return; }
  let data = null;
  if (TOKEN) {
    data = await api(`/departments/${deptId}/semesters`);
  }
  if (!Array.isArray(data) || data.error) {
    try {
      const res = await fetch(API + `/public/departments/${deptId}/semesters`);
      data = res.ok ? await res.json() : [];
    } catch (e) {
      console.error('Public semesters fetch failed', e);
      data = [];
    }
  }
  semEl.innerHTML = '<option value="">Select Semester</option>';
  if (Array.isArray(data)) data.forEach(s => { semEl.innerHTML += `<option value="${s.id}">Semester ${s.number}</option>`; });
}

async function editStudentModal(id) {
  const s = await api(`/students/${id}`);
  document.getElementById('modalTitle').textContent = 'Edit Student';
  const deptOpts = departments.map(d => `<option value="${d.id}" ${d.id == s.department_id ? 'selected' : ''}>${d.code} - ${d.name}</option>`).join('');
  const semsData = await api(`/departments/${s.department_id}/semesters`);
  const semOpts = (Array.isArray(semsData) ? semsData : []).map(sm => `<option value="${sm.id}" ${sm.id == s.semester_id ? 'selected' : ''}>Semester ${sm.number}</option>`).join('');
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group"><label>Batch</label>
      <select id="editBatch">
        <option value="Day Batch" ${s.batch == 'Day Batch' ? 'selected' : ''}>Day Batch</option>
        <option value="Diploma Batch" ${s.batch == 'Diploma Batch' ? 'selected' : ''}>Diploma Batch</option>
      </select>
    </div>
    <div class="form-group"><label>Department</label><select id="editDept">${deptOpts}</select></div>
    <div class="form-group"><label>Semester</label><select id="editSem">${semOpts}</select></div>
    <div class="form-group"><label>Student ID</label><input id="editSid" value="${s.student_id}" disabled></div>
    <div class="form-group"><label>Name</label><input id="editName" value="${s.name}"></div>
    <div class="form-group"><label>Email</label><input id="editEmail" value="${s.email || ''}"></div>
    <div class="form-group"><label>Phone</label><input id="editPhone" value="${s.phone || ''}"></div>
    <button class="btn-primary" onclick="saveEditStudent(${id})"><i class="fas fa-save"></i> Update</button>
  `;
  openModal();
}

async function saveEditStudent(id) {
  const data = {
    name: document.getElementById('editName').value.trim(),
    batch: document.getElementById('editBatch').value,
    department_id: parseInt(document.getElementById('editDept').value),
    semester_id: parseInt(document.getElementById('editSem').value),
    email: document.getElementById('editEmail').value.trim(),
    phone: document.getElementById('editPhone').value.trim()
  };
  const res = await api(`/students/${id}`, 'PUT', data);
  if (res.message) { showToast('Student updated successfully!', 'success'); closeModal(); loadStudents(); }
  else showToast(res.error || 'Error', 'error');
}

async function deleteStudent(id) {
  if (!confirm('Are you sure you want to delete this student? All data will be lost.')) return;
  const res = await api(`/students/${id}`, 'DELETE');
  if (res.message) { showToast('Student deleted successfully!', 'success'); loadStudents(); }
  else showToast(res.error || 'Error', 'error');
}

/* ─── MARKS ENTRY ────────────────────────────────── */
async function loadMeSemesters() {
  const deptId = document.getElementById('meDept').value;
  const semEl = document.getElementById('meSem');
  semEl.innerHTML = '<option value="">Select Semester</option>';
  if (!deptId) return;
  const data = await api(`/departments/${deptId}/semesters`);
  if (Array.isArray(data)) data.forEach(s => { semEl.innerHTML += `<option value="${s.id}">Semester ${s.number}</option>`; });
  semEl.onchange = loadMeStudents;
}

async function loadMeStudents() {
  const dept = document.getElementById('meDept').value;
  const sem = document.getElementById('meSem').value;
  const batch = document.getElementById('meBatch').value;
  const el = document.getElementById('meStudent');
  el.innerHTML = '<option value="">Select Student</option>';
  if (!dept || !sem) return;
  let url = `/students?department_id=${dept}&semester_id=${sem}`;
  if (batch) url += `&batch=${encodeURIComponent(batch)}`;
  const data = await api(url);
  if (Array.isArray(data)) data.forEach(s => { el.innerHTML += `<option value="${s.student_id}">${s.student_id} - ${s.name}</option>`; });
}

// Store selected components globally
let selectedTheoryComponents = ['attendance', 'assignment', 'classTest', 'quiz', 'presentation'];
let selectedLabComponents = ['attendance', 'labReport', 'viva', 'practical'];

function showComponentSelector() {
  const type = document.getElementById('meType').value;
  const selector = document.getElementById('componentSelector');
  const checkboxesContainer = document.getElementById('componentCheckboxes');
  
  if (!type) {
    selector.style.display = 'none';
    return;
  }

  selector.style.display = 'block';
  let checkboxesHtml = '';

  if (type === 'theory') {
    const components = [
      { id: 'attendance', label: 'Attendance', icon: 'fas fa-calendar-check' },
      { id: 'assignment', label: 'Assignment', icon: 'fas fa-clipboard-list' },
      { id: 'classTest', label: 'Class Test', icon: 'fas fa-pen' },
      { id: 'quiz', label: 'Quiz', icon: 'fas fa-question-circle' },
      { id: 'presentation', label: 'Presentation', icon: 'fas fa-presentation' }
    ];

    components.forEach(comp => {
      const checked = selectedTheoryComponents.includes(comp.id) ? 'checked' : '';
      checkboxesHtml += `
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="comp_${comp.id}" value="${comp.id}" ${checked} onchange="updateTheoryComponents()">
          <label for="comp_${comp.id}" style="margin: 0; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            <i class="${comp.icon}"></i> ${comp.label}
          </label>
        </div>
      `;
    });
  } else if (type === 'lab') {
    const components = [
      { id: 'attendance', label: 'Attendance', icon: 'fas fa-calendar-check' },
      { id: 'labReport', label: 'Lab Report', icon: 'fas fa-file-alt' },
      { id: 'viva', label: 'Viva', icon: 'fas fa-microphone' },
      { id: 'practical', label: 'Practical', icon: 'fas fa-flask' }
    ];

    components.forEach(comp => {
      const checked = selectedLabComponents.includes(comp.id) ? 'checked' : '';
      checkboxesHtml += `
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="comp_${comp.id}" value="${comp.id}" ${checked} onchange="updateLabComponents()">
          <label for="comp_${comp.id}" style="margin: 0; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            <i class="${comp.icon}"></i> ${comp.label}
          </label>
        </div>
      `;
    });
  }

  checkboxesContainer.innerHTML = checkboxesHtml;
}

function updateTheoryComponents() {
  selectedTheoryComponents = [];
  document.querySelectorAll('#componentCheckboxes input[type="checkbox"]:checked').forEach(cb => {
    selectedTheoryComponents.push(cb.value);
  });
  renderMarksForm();
}

function updateLabComponents() {
  selectedLabComponents = [];
  document.querySelectorAll('#componentCheckboxes input[type="checkbox"]:checked').forEach(cb => {
    selectedLabComponents.push(cb.value);
  });
  renderMarksForm();
}

function renderMarksForm() {
  const type = document.getElementById('meType').value;
  const container = document.getElementById('dynamicMarksForm');
  container.innerHTML = '';
  if (!type) return;

  showComponentSelector();

  // Add section title for Lab/Theory
  const sectionTitle = type === 'lab' 
    ? `<h2 style="color: #2c3e50; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 3px solid #e74c3c;">
        <i class="fas fa-flask"></i> Lab Marks Entry
       </h2>`
    : `<h2 style="color: #2c3e50; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 3px solid #3498db;">
        <i class="fas fa-book"></i> Theory Marks entry
       </h2>`;

  let htmlContent = sectionTitle;

  if (type === 'lab') {
    htmlContent += buildLabForm();
  } else if (type === 'theory') {
    htmlContent += buildTheoryForm();
  }

  container.innerHTML = htmlContent;

  // Update credit value based on type
  const creditSelect = document.getElementById('meSubjectCredit');
  if (creditSelect) {
    creditSelect.value = (type === 'lab') ? '1.5' : '3';
  }
}

function buildLabForm() {
  let formHtml = `
    <div class="marks-module-box" style="border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px;">
      <h3 style="color: #2c3e50;"><i class="fas fa-flask"></i> Lab Module (Total: 100)</h3>
      <hr>
      <h4 style="margin-top: 10px; color: #16a085;">Continuous Assessment (Total: 50)</h4>
      <div class="form-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
  `;

  if (selectedLabComponents.includes('attendance')) {
    formHtml += `<div class="form-group"><label>Attendance (Max 10)</label><input type="number" id="labAttendance" min="0" max="10" class="form-control" placeholder="0-10"></div>`;
  }
  if (selectedLabComponents.includes('labReport')) {
    formHtml += `<div class="form-group"><label>Lab Report (Max 20)</label><input type="number" id="labReport" min="0" max="20" class="form-control" placeholder="0-20"></div>`;
  }
  if (selectedLabComponents.includes('viva')) {
    formHtml += `<div class="form-group"><label>Viva (Max 10)</label><input type="number" id="labViva" min="0" max="10" class="form-control" placeholder="0-10"></div>`;
  }
  if (selectedLabComponents.includes('practical')) {
    formHtml += `<div class="form-group"><label>Practical (Max 10)</label><input type="number" id="labPractical" min="0" max="10" class="form-control" placeholder="0-10"></div>`;
  }

  formHtml += `
      </div>
      <h4 style="margin-top: 20px; color: #2980b9;">Test (Total: 50)</h4>
      <div class="form-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
        <div class="form-group"><label>Mid Exam (Max 20)</label><input type="number" id="labMid" min="0" max="20" class="form-control" placeholder="0-20"></div>
        <div class="form-group"><label>Final Exam (Max 30)</label><input type="number" id="labFinal" min="0" max="30" class="form-control" placeholder="0-30"></div>
      </div>
    </div>
  `;
  return formHtml;
}

function buildTheoryForm() {
  let formHtml = `
    <div class="marks-module-box" style="border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px;">
      <h3 style="color: #2c3e50;"><i class="fas fa-book"></i> Theory Module (Total: 100)</h3>
      <hr>
      <h4 style="margin-top: 10px; color: #16a085;">Continuous Assessment (Total: 50)</h4>
      <div class="form-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">
  `;

  if (selectedTheoryComponents.includes('attendance')) {
    formHtml += `<div class="form-group"><label>Attendance (10)</label><input type="number" id="theoryAttendance" min="0" max="10" class="form-control" placeholder="0-10"></div>`;
  }
  if (selectedTheoryComponents.includes('assignment')) {
    formHtml += `<div class="form-group"><label>Assignment (10)</label><input type="number" id="theoryAssignment" min="0" max="10" class="form-control" placeholder="0-10"></div>`;
  }
  if (selectedTheoryComponents.includes('classTest')) {
    formHtml += `<div class="form-group"><label>Class Test (10)</label><input type="number" id="theoryClassTest" min="0" max="10" class="form-control" placeholder="0-10"></div>`;
  }
  if (selectedTheoryComponents.includes('quiz')) {
    formHtml += `<div class="form-group"><label>Quiz (10)</label><input type="number" id="theoryQuiz" min="0" max="10" class="form-control" placeholder="0-10"></div>`;
  }
  if (selectedTheoryComponents.includes('presentation')) {
    formHtml += `<div class="form-group"><label>Presentation (10)</label><input type="number" id="theoryPresentation" min="0" max="10" class="form-control" placeholder="0-10"></div>`;
  }

  formHtml += `
      </div>
      <h4 style="margin-top: 20px; color: #2980b9;">Test (Total: 50)</h4>
      <div class="form-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
        <div class="form-group"><label>Mid Exam (Max 20)</label><input type="number" id="theoryMid" min="0" max="20" class="form-control" placeholder="0-20"></div>
        <div class="form-group"><label>Final Exam (Max 30)</label><input type="number" id="theoryFinal" min="0" max="30" class="form-control" placeholder="0-30"></div>
      </div>
    </div>
  `;
  return formHtml;
}

/* ─── BANGLADESH UGC GRADING ENGINE ──────────────── */
function calculateUgcGrade(totalMarks) {
  if (totalMarks >= 80) return { grade: "A+", point: 4.00 };
  if (totalMarks >= 75) return { grade: "A", point: 3.75 };
  if (totalMarks >= 70) return { grade: "A-", point: 3.50 };
  if (totalMarks >= 65) return { grade: "B+", point: 3.25 };
  if (totalMarks >= 60) return { grade: "B", point: 3.00 };
  if (totalMarks >= 55) return { grade: "B-", point: 2.75 };
  if (totalMarks >= 50) return { grade: "C+", point: 2.50 };
  if (totalMarks >= 45) return { grade: "C", point: 2.25 };
  if (totalMarks >= 40) return { grade: "D", point: 2.00 };
  return { grade: "F", point: 0.00 };
}

/* ─── SAVE MARKS (async ঠিক করা হয়েছে) ────────── */
async function saveMarks() {
  const batch = document.getElementById('meBatch').value;
  const dept = document.getElementById('meDept').value;
  const sem = document.getElementById('meSem').value;
  const subjectType = document.getElementById('meType').value;
  const subjectCode = document.getElementById('meSubjectCode').value;
  const subjectName = document.getElementById('meSubjectName').value;
  const teacherName = document.getElementById('meTeacherName').value;
  const studentId = document.getElementById('meStudent').value;
  const creditHour = parseFloat(document.getElementById('meSubjectCredit')?.value || 3.0);

  if (!batch || !dept || !sem || !subjectType || !subjectCode || !studentId) {
    showToast('Please fill in all required information!', 'error');
    return;
  }

  let marksData = {
    batch,
    department_id: parseInt(dept),
    semester_id: parseInt(sem),
    subjectType,
    subjectCode,
    subjectName,
    teacherName,
    student_id: studentId,
    credit: creditHour,
    marks: {},
    totalMarks: 0
  };

  if (subjectType === 'lab') {
    let marksObj = {};
    let total = 0;

    if (selectedLabComponents.includes('attendance')) {
      const att = parseFloat(document.getElementById('labAttendance')?.value || 0);
      if (att > 10) { showToast('Attendance maximum 10 marks!', 'error'); return; }
      marksObj.attendance = att;
      total += att;
    }
    
    if (selectedLabComponents.includes('labReport')) {
      const rep = parseFloat(document.getElementById('labReport')?.value || 0);
      if (rep > 20) { showToast('Lab Report maximum 20 marks!', 'error'); return; }
      marksObj.report = rep;
      total += rep;
    }
    
    if (selectedLabComponents.includes('viva')) {
      const viv = parseFloat(document.getElementById('labViva')?.value || 0);
      if (viv > 10) { showToast('Viva maximum 10 marks!', 'error'); return; }
      marksObj.viva = viv;
      total += viv;
    }
    
    if (selectedLabComponents.includes('practical')) {
      const prac = parseFloat(document.getElementById('labPractical')?.value || 0);
      if (prac > 10) { showToast('Practical Maximum 10 marks!', 'error'); return; }
      marksObj.practical = prac;
      total += prac;
    }

    const mid = parseFloat(document.getElementById('labMid')?.value || 0);
    const fin = parseFloat(document.getElementById('labFinal')?.value || 0);
    
    if (mid > 20 || fin > 30) {
      showToast('Test marks exceed the limit!', 'error');
      return;
    }

    marksObj.midExam = mid;
    marksObj.finalExam = fin;
    total += mid + fin;

    marksData.marks = marksObj;
    marksData.totalMarks = total;

  } else if (subjectType === 'theory') {
    let marksObj = {};
    let total = 0;

    if (selectedTheoryComponents.includes('attendance')) {
      const att = parseFloat(document.getElementById('theoryAttendance')?.value || 0);
      if (att > 10) { showToast('Attendance maximum 10 marks!', 'error'); return; }
      marksObj.attendance = att;
      total += att;
    }

    if (selectedTheoryComponents.includes('assignment')) {
      const ass = parseFloat(document.getElementById('theoryAssignment')?.value || 0);
      if (ass > 10) { showToast('Assignment maximum 10 marks!', 'error'); return; }
      marksObj.assignment = ass;
      total += ass;
    }

    if (selectedTheoryComponents.includes('classTest')) {
      const ct = parseFloat(document.getElementById('theoryClassTest')?.value || 0);
      if (ct > 10) { showToast('Class Test maximum 10 marks!', 'error'); return; }
      marksObj.classTest = ct;
      total += ct;
    }

    if (selectedTheoryComponents.includes('quiz')) {
      const qz = parseFloat(document.getElementById('theoryQuiz')?.value || 0);
      if (qz > 10) { showToast('Quiz maximum 10 marks!', 'error'); return; }
      marksObj.quiz = qz;
      total += qz;
    }

    if (selectedTheoryComponents.includes('presentation')) {
      const pres = parseFloat(document.getElementById('theoryPresentation')?.value || 0);
      if (pres > 10) { showToast('Presentation maximum 10 marks!', 'error'); return; }
      marksObj.presentation = pres;
      total += pres;
    }

    const mid = parseFloat(document.getElementById('theoryMid')?.value || 0);
    const fin = parseFloat(document.getElementById('theoryFinal')?.value || 0);
    
    if (mid > 20 || fin > 30) {
      showToast('Test marks exceed the limit!', 'error');
      return;
    }

    marksObj.midExam = mid;
    marksObj.finalExam = fin;
    total += mid + fin;

    marksData.marks = marksObj;
    marksData.totalMarks = total;
  }

  const gradeResult = calculateUgcGrade(marksData.totalMarks);
  marksData.letterGrade = gradeResult.grade;
  marksData.gradePoint = gradeResult.point;
  marksData.qualityPoint = gradeResult.point * creditHour;

  let endpoint = '/marks/submit';
  let payload = marksData;

  if (subjectType === 'lab') {
    endpoint = '/lab-marks';
    payload = {
      student_id: studentId,
      batch,
      department_id: parseInt(dept),
      semester_id: parseInt(sem),
      subject_code: subjectCode,
      subject_name: subjectName,
      teacher_name: teacherName,
      subject_credit: creditHour,
      attendance: selectedLabComponents.includes('attendance') ? parseFloat(document.getElementById('labAttendance')?.value || 0) : 0,
      lab_report: selectedLabComponents.includes('labReport') ? parseFloat(document.getElementById('labReport')?.value || 0) : 0,
      viva: selectedLabComponents.includes('viva') ? parseFloat(document.getElementById('labViva')?.value || 0) : 0,
      practical: selectedLabComponents.includes('practical') ? parseFloat(document.getElementById('labPractical')?.value || 0) : 0,
      mid_exam: parseFloat(document.getElementById('labMid')?.value || 0),
      final_exam: parseFloat(document.getElementById('labFinal')?.value || 0)
    };
  } else {
    endpoint = '/theory-marks';
    payload = {
      student_id: studentId,
      batch,
      department_id: parseInt(dept),
      semester_id: parseInt(sem),
      subject_code: subjectCode,
      subject_name: subjectName,
      teacher_name: teacherName,
      subject_credit: creditHour,
      attendance: selectedTheoryComponents.includes('attendance') ? parseFloat(document.getElementById('theoryAttendance')?.value || 0) : 0,
      assignment: selectedTheoryComponents.includes('assignment') ? parseFloat(document.getElementById('theoryAssignment')?.value || 0) : 0,
      class_test: selectedTheoryComponents.includes('classTest') ? parseFloat(document.getElementById('theoryClassTest')?.value || 0) : 0,
      quiz: selectedTheoryComponents.includes('quiz') ? parseFloat(document.getElementById('theoryQuiz')?.value || 0) : 0,
      presentation: selectedTheoryComponents.includes('presentation') ? parseFloat(document.getElementById('theoryPresentation')?.value || 0) : 0,
      mid_exam: parseFloat(document.getElementById('theoryMid')?.value || 0),
      final_exam: parseFloat(document.getElementById('theoryFinal')?.value || 0)
    };
  }

  showToast('Data is being saved...', 'info');
  const res = await api(endpoint, 'POST', payload);

  if (res.message) {
    showPopup('Success!', `Marks for student ${studentId} in subject ${subjectCode} have been saved. Grade: ${marksData.letterGrade} (${marksData.gradePoint})`);
    document.getElementById('meStudent').value = '';
    if (subjectType === 'lab') {
      ['labAttendance', 'labReport', 'labViva', 'labPractical', 'labMid', 'labFinal'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = 0;
      });
    } else {
      ['theoryAttendance', 'theoryAssignment', 'theoryClassTest', 'theoryQuiz', 'theoryPresentation', 'theoryMid', 'theoryFinal'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = 0;
      });
    }
  } else {
    showToast(res.error || 'Failure to save marks', 'error');
  }
}

async function deleteMark(type, id) {
  if (!id) return;
  if (!confirm('Are you sure you want to delete this marks record?')) return;
  const res = await api(`/${type}-marks/${id}`, 'DELETE');
  if (res.message) {
    showToast('Marks record deleted.', 'success');
    loadMvMarks();
  } else {
    showToast(res.error || 'Failed to delete marks record.', 'error');
  }
}

async function editMarkModal(type, id) {
  if (!id) return;
  const url = type === 'lab' ? '/lab-marks' : '/theory-marks';
  const data = await api(`${url}`);
  if (!Array.isArray(data)) {
    showToast('Record failed to load.', 'error');
    return;
  }
  const mark = data.find(m => parseInt(m.id, 10) === parseInt(id, 10));
  if (!mark) {
    showToast('Marks record not found.', 'error');
    return;
  }

  navigate('marks-entry');

  // fill filters and load students
  document.getElementById('meBatch').value = mark.batch || '';
  document.getElementById('meDept').value = mark.department_id || '';
  await loadMeSemesters();
  document.getElementById('meSem').value = mark.semester_id || '';
  await loadMeStudents();

  document.getElementById('meType').value = type;
  renderMarksForm();

  document.getElementById('meStudent').value = mark.student_id || mark.roll || '';
  document.getElementById('meSubjectCode').value = mark.subject_code || '';
  document.getElementById('meSubjectName').value = mark.subject_name || '';
  document.getElementById('meTeacherName').value = mark.teacher_name || '';
  document.getElementById('meSubjectCredit').value = mark.subject_credit ?? '3';

  if (type === 'lab') {
    document.getElementById('labAttendance').value = mark.attendance || 0;
    const labReport = document.getElementById('labReport');
    if (labReport) labReport.value = mark.lab_report || 0;
    const labViva = document.getElementById('labViva');
    if (labViva) labViva.value = mark.viva || 0;
    const labPractical = document.getElementById('labPractical');
    if (labPractical) labPractical.value = mark.practical || 0;
    const labMid = document.getElementById('labMid');
    if (labMid) labMid.value = mark.mid_exam || 0;
    const labFinal = document.getElementById('labFinal');
    if (labFinal) labFinal.value = mark.final_exam || 0;
  } else {
    const theoryAttendance = document.getElementById('theoryAttendance');
    if (theoryAttendance) theoryAttendance.value = mark.attendance || 0;
    const theoryAssignment = document.getElementById('theoryAssignment');
    if (theoryAssignment) theoryAssignment.value = mark.assignment || 0;
    const theoryClassTest = document.getElementById('theoryClassTest');
    if (theoryClassTest) theoryClassTest.value = mark.class_test || 0;
    const theoryQuiz = document.getElementById('theoryQuiz');
    if (theoryQuiz) theoryQuiz.value = mark.quiz || 0;
    const theoryPresentation = document.getElementById('theoryPresentation');
    if (theoryPresentation) theoryPresentation.value = mark.presentation || 0;
    const theoryMid = document.getElementById('theoryMid');
    if (theoryMid) theoryMid.value = mark.mid_exam || 0;
    const theoryFinal = document.getElementById('theoryFinal');
    if (theoryFinal) theoryFinal.value = mark.final_exam || 0;
  }

  showToast('Marks form loaded.', 'success');
}

/* ─── MARKS VIEW (FULLY DYNAMIC VERSION) ─────────── */

// ১. ডিপার্টমেন্ট সিলেক্ট করলে সেমিস্টার লোড হবে এবং টেবিল অটো-আপডেট হবে
async function loadMvSemesters() {
  // এখানে ?.value ব্যবহার করা হলো যেন এলিমেন্ট না থাকলেও কোড ক্র্যাশ না করে
  const deptId = document.getElementById('mvDept')?.value;
  const semEl = document.getElementById('mvSem');
  if (!semEl) return;
  
  semEl.innerHTML = '<option value="">Semester</option>';
  if (!deptId) {
    loadMvMarks(); 
    return;
  }
  
  const data = await api(`/departments/${deptId}/semesters`);
  if (Array.isArray(data)) {
    semEl.innerHTML = '<option value="">Semester</option>'; // রিসেট অপশন
    data.forEach(s => { 
      semEl.innerHTML += `<option value="${s.id}">Semester ${s.number}</option>`; 
    });
  }
  loadMvMarks(); 
}

// ২. ব্যাচ বা ফিল্টার চেঞ্জ হলে টেবিল রিলোড করার জন্য
function loadMvStudents() {
  loadMvMarks();
}

function attachMvActionListeners(container, type) {
  if (!container) return;
  container.querySelectorAll('.btn-icon.edit').forEach(btn => {
    btn.onclick = () => editMarkModal(type, btn.dataset.markId);
  });
  container.querySelectorAll('.btn-icon.delete').forEach(btn => {
    btn.onclick = () => deleteMark(type, btn.dataset.markId);
  });
}

async function loadMvMarks() {
  const dept = document.getElementById('mvDept')?.value || '';
  const sem = document.getElementById('mvSem')?.value || '';
  const batch = document.getElementById('mvBatch')?.value || '';
  const type = document.getElementById('mvType')?.value || ''; // থিওরি নাকি ল্যাব
  const search = document.getElementById('mvSearch')?.value || '';
  const container = document.getElementById('mvTableContainer');
  
  if (!container) return;

  // ═══════════════════════════════════════════════
  // ১. প্রাথমিক ভ্যালিডেশন চেক (ইউজার যেন আগে ফিল্টার সিলেক্ট করে)
  // ═══════════════════════════════════════════════
  if (!type || !dept || !sem) {
    
    container.innerHTML = `
      <div style="text-align:center; padding:40px; color:#64748b; background:#f8fafc; border: 2px dashed #e2e8f0; border-radius:8px;">
        <i class="fas fa-filter" style="font-size:24px; color:#94a3b8; margin-bottom:12px;"></i>
        <p style="font-weight:500; margin:0;">Select type (Theory/Lab), department, and semester to view marks.</p>
      </div>
    `;
    return;
  }

  // লোডার দেখানো
  container.innerHTML = `
    <div style="text-align:center; padding:32px; color:#64748b;">
      <i class="fas fa-spinner fa-spin fa-2x" style="margin-bottom:10px; color:#1a56db;"></i>
      <p>মার্কস ডেটা লোড হচ্ছে...</p>
    </div>
  `;

  // URLSearchParams ব্যবহার করে নিখুঁত URL তৈরি (কোনো অতিরিক্ত & থাকবে না)
  const params = new URLSearchParams();
  if (dept) params.append('department_id', dept);
  if (sem) params.append('semester_id', sem);
  if (batch) params.append('batch', batch);
  if (search) params.append('search', search.trim());

  // type-টিকে lowercase করে নেওয়া holo যেন রাউটে ভুল না হয়
  const url = `/${type.toLowerCase()}-marks?${params.toString()}`;
  const data = await api(url);

  // ═══════════════════════════════════════════════
  // ২. যদি সত্যিই সব সিলেক্ট করার পরও কোনো ডেটা না থাকে
  // ═══════════════════════════════════════════════
  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px; color:#94a3b8;">
        <i class="fas fa-folder-open" style="font-size:32px; margin-bottom:12px; color:#cbd5e1;"></i>
        <p style="font-weight:500; margin:0;">Sorry, no marks records were found for this semester.</p>
      </div>
    `;
    return;
  }

  // ═══════════════════════════════════════════════
  // ৩. স্থির কলাম ও লে-আউট ব্যবহার করে টেবিল তৈরি
  // ═══════════════════════════════════════════════
  const headers = type === 'lab' ? `
    <tr>
      <th>Serial</th>
      <th>Created At</th>
      <th>Student ID</th>
      <th>Name</th>
      <th>Subject Name</th>
      <th>Subject Code</th>
      <th>Subject Credit</th>
      <th>Teacher Name</th>
      <th>Attendance</th>
      <th>Lab Report</th>
      <th>Viva</th>
      <th>Practical</th>
      <th>Mid Exam</th>
      <th>Final Exam</th>
      <th>Total</th>
      <th>Grade Point</th>
      <th>Grade Letter</th>
      <th>Actions</th>
    </tr>
  ` : `
    <tr>
      <th>Serial</th>
      <th>Created At</th>
      <th>Student ID</th>
      <th>Name</th>
      <th>Subject Name</th>
      <th>Subject Code</th>
      <th>Subject Credit</th>
      <th>Teacher Name</th>
      <th>Assignment</th>
      <th>Attendance</th>
      <th>Class Test</th>
      <th>Quiz</th>
      <th>Presentation</th>
      <th>Mid Exam</th>
      <th>Final Exam</th>
      <th>Total</th>
      <th>Grade Point</th>
      <th>Grade Letter</th>
      <th>Actions</th>
    </tr>
  `;

  const rows = data.map((m, i) => {
    const grade = calculateUgcGrade(parseFloat(m.total || 0));
    const gradePoint = grade.point.toFixed(2);
    const gradeLetter = grade.grade;

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${m.created_at || '-'}</td>
        <td><strong>${m.roll || m.student_id || '-'}</strong></td>
        <td>${m.student_name || '-'}</td>
        <td>${m.subject_name || '-'}</td>
        <td>${m.subject_code || '-'}</td>
        <td>${m.subject_credit ?? '-'}</td>
        <td>${m.teacher_name || '-'}</td>
        ${type === 'lab' ? `
          <td>${m.attendance ?? '-'}</td>
          <td>${m.lab_report ?? '-'}</td>
          <td>${m.viva ?? '-'}</td>
          <td>${m.practical ?? '-'}</td>
        ` : `
          <td>${m.assignment ?? '-'}</td>
          <td>${m.attendance ?? '-'}</td>
          <td>${m.class_test ?? '-'}</td>
          <td>${m.quiz ?? '-'}</td>
          <td>${m.presentation ?? '-'}</td>
        `}
        <td>${m.mid_exam ?? '-'}</td>
        <td>${m.final_exam ?? '-'}</td>
        <td>${m.total ?? '-'}</td>
        <td>${gradePoint}</td>
        <td>${gradeLetter}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon edit" data-mark-type="${type}" data-mark-id="${m.id}" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn-icon delete" data-mark-type="${type}" data-mark-id="${m.id}" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // স্ক্রিনে টেবিলটি পুশ করা
  container.innerHTML = `
    <div style="overflow-x:auto; background:#fff; border-radius:8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <table class="data-table">
        <thead>${headers}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  attachMvActionListeners(container, type);
}



 




/* ─── GRAPH ──────────────────────────────────────── */
async function populateGraphFilters() {
  const dEl = document.getElementById('graphDept');
  const batchEl = document.getElementById('graphBatch');
  if (dEl && dEl.options.length <= 1) {
    departments.forEach(d => { dEl.innerHTML += `<option value="${d.id}">${d.code} - ${d.name}</option>`; });
  }
  const semEl = document.getElementById('graphSem');
  if (dEl) {
    dEl.onchange = async () => {
      if (!semEl) return;
      semEl.innerHTML = '<option value="">All Semesters</option>';
      if (dEl.value) {
        const sems = await api(`/departments/${dEl.value}/semesters`);
        if (Array.isArray(sems)) sems.forEach(s => { semEl.innerHTML += `<option value="${s.id}">Semester ${s.number}</option>`; });
      }
      loadGraphData();
    };
  }
  if (semEl) semEl.onchange = loadGraphData;
  if (batchEl) batchEl.onchange = loadGraphData;
}

async function loadGraphData() {
  const deptId = document.getElementById('graphDept')?.value || '';
  const semId = document.getElementById('graphSem')?.value || '';
  const batch = document.getElementById('graphBatch')?.value || '';
  const params = new URLSearchParams();
  if (deptId) params.append('department_id', deptId);
  if (semId) params.append('semester_id', semId);
  if (batch) params.append('batch', batch);
  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await api(`/stats/dashboard${query}`);
  if (data.error) return;

  const labels = (data.dept_performance || []).map(d => d.code);
  const labVals = (data.dept_performance || []).map(d => d.lab_avg);
  const thVals = (data.dept_performance || []).map(d => d.theory_avg);
  const overall = (data.dept_performance || []).map(d => d.overall);

  if (charts.semGraph) charts.semGraph.destroy();
  const c1 = document.getElementById('semGraph');
  if (c1) charts.semGraph = new Chart(c1, {
    type: 'line',
    data: {
      labels, datasets: [
        { label: 'Lab Avg', data: labVals, borderColor: '#1a56db', backgroundColor: 'rgba(26,86,219,0.1)', fill: true, tension: 0.4 },
        { label: 'Theory Avg', data: thVals, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4 },
        { label: 'Overall', data: overall, borderColor: '#f59e0b', borderWidth: 2, tension: 0.4 }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'top' } } }
  });

  if (charts.labTheory) charts.labTheory.destroy();
  const c2 = document.getElementById('labTheoryChart');
  if (c2) charts.labTheory = new Chart(c2, {
    type: 'radar',
    data: {
      labels, datasets: [
        { label: 'Lab', data: labVals, backgroundColor: 'rgba(26,86,219,0.2)', borderColor: '#1a56db' },
        { label: 'Theory', data: thVals, backgroundColor: 'rgba(16,185,129,0.2)', borderColor: '#10b981' }
      ]
    },
    options: { responsive: true }
  });

  if (charts.allDept) charts.allDept.destroy();
  const c3 = document.getElementById('allDeptChart');
  const colors = ['#1a56db', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6'];
  if (c3) charts.allDept = new Chart(c3, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: (data.dept_performance || []).map(d => d.student_count || 1), backgroundColor: colors }] },
    options: { responsive: true, plugins: { legend: { position: 'right' } } }
  });
}

/* ─── PROFILE ────────────────────────────────────── */
async function loadProfile() {
  const data = await api('/auth/profile');
  if (data.id) {
    document.getElementById('profileName').value = data.name;
    document.getElementById('profileEmail').value = data.email;
    const avatar = data.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=1a56db&color=fff&size=120`;
    document.getElementById('profileImg').src = avatar;
  }
}

async function updateProfile() {
  const data = { name: document.getElementById('profileName').value.trim() };
  const pw = document.getElementById('profilePassword').value;
  if (pw) data.password = pw;
  const res = await api('/auth/profile', 'PUT', data);
  if (res.message) {
    showToast('Profile updated successfully!', 'success');
    USER.name = data.name;
    localStorage.setItem('user', JSON.stringify(USER));
    document.getElementById('topbarAvatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=1a56db&color=fff`;
  } else showToast(res.error || 'Error', 'error');
}

async function uploadAvatar() {
  const file = document.getElementById('avatarInput').files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('avatar', file);
  showToast('Profile image is uploading...', 'info');
  const res = await fetch(API + '/auth/profile/avatar', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`
    },
    body: formData
  });
  const data = await res.json();
  if (data.profile_image) {
    document.getElementById('profileImg').src = data.profile_image;
    document.getElementById('topbarAvatar').src = data.profile_image;
    USER.profile_image = data.profile_image;
    localStorage.setItem('user', JSON.stringify(USER));
    showToast('Profile image updated successfully!', 'success');
  } else {
    showToast(data.error || 'Failed to upload profile image.', 'error');
  }
}

async function printStudentPDF(id) {
  const win = window.open('', '_blank');
  if (!win) {
    showToast('Popup is blocked, please enable popups and try again.', 'error');
    return;
  }

  win.focus();
  win.document.open();
  win.document.write(`<!DOCTYPE html><html><head><title>Loading PDF...</title><style>
    body{font-family:Arial,sans-serif;background:#f1f5f9;color:#111;margin:0;padding:48px;display:flex;align-items:center;justify-content:center;height:100vh;}
    .loader-card{max-width:520px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 16px 40px rgba(15,23,42,.08);padding:32px;text-align:center;}
    .loader-circle{width:56px;height:56px;margin:0 auto 24px;border:6px solid #cbd5e1;border-top-color:#2563eb;border-radius:50%;animation:spin 1s linear infinite;}
    .loader-title{font-size:20px;font-weight:700;margin-bottom:12px;color:#1f2937;}
    .loader-text{font-size:15px;color:#475569;line-height:1.6;}
    @keyframes spin{100%{transform:rotate(360deg);}}
  </style></head><body><div class="loader-card"><div class="loader-circle"></div><div class="loader-title">Loading Student PDF...</div><div class="loader-text">Please wait a moment while the report is generated.</div></div></body></html>`);
  win.document.close();

  try {
    const s = await api(`/students/${id}`);
    if (!s || s.error) {
      win.document.open();
      win.document.write(`<html><head><title>Error</title></head><body style="font-family:sans-serif;padding:36px;color:#1f2937"><h2>Failed to load information</h2><p>${s?.error || 'Student information not found.'}</p></body></html>`);
      win.document.close();
      return;
    }

    const studentId = s?.student_id || id;
    const labResponse = await api(`/lab-marks?student_id=${studentId}`);
    const theoryResponse = await api(`/theory-marks?student_id=${studentId}`);
    const labRecords = Array.isArray(labResponse) ? labResponse : [];
    const theoryRecords = Array.isArray(theoryResponse) ? theoryResponse : [];

    const labTotal = labRecords.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);
    const theoryTotal = theoryRecords.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);
    const labCount = labRecords.length;
    const theoryCount = theoryRecords.length;
    const labAvg = labCount ? labTotal / labCount : 0;
    const theoryAvg = theoryCount ? theoryTotal / theoryCount : 0;
    const totalCount = labCount + theoryCount;
    const overallAverage = totalCount ? (labTotal + theoryTotal) / totalCount : 0;

    // Map GPA back to a grade letter using point thresholds
    const mapPointToGrade = (pt) => {
      if (pt >= 3.75) return { grade: 'A', point: pt };
      if (pt >= 3.50) return { grade: 'A-', point: pt };
      if (pt >= 3.25) return { grade: 'B+', point: pt };
      if (pt >= 3.00) return { grade: 'B', point: pt };
      if (pt >= 2.75) return { grade: 'B-', point: pt };
      if (pt >= 2.50) return { grade: 'C+', point: pt };
      if (pt >= 2.25) return { grade: 'C', point: pt };
      if (pt >= 2.00) return { grade: 'D', point: pt };
      return { grade: 'F', point: pt };
    };

    // Compute lab GPA from each lab subject's grade point weighted by credit
    const labCredits = labRecords.reduce((sum, s) => sum + (parseFloat(s.subject_credit || s.subjectCredit || 3) || 0), 0);
    const labQuality = labRecords.reduce((sum, s) => {
      const marks = parseFloat(s.total || 0);
      const credit = parseFloat(s.subject_credit || s.subjectCredit || 3) || 0;
      const gp = calculateUgcGrade(marks).point || 0;
      return sum + gp * credit;
    }, 0);
    const labGPA = labCredits ? labQuality / labCredits : 0;
    const labGrade = mapPointToGrade(labGPA);

    // Compute theory GPA from each theory subject's grade point weighted by credit
    const theoryCredits = theoryRecords.reduce((sum, s) => sum + (parseFloat(s.subject_credit || s.subjectCredit || 3) || 0), 0);
    const theoryQuality = theoryRecords.reduce((sum, s) => {
      const marks = parseFloat(s.total || 0);
      const credit = parseFloat(s.subject_credit || s.subjectCredit || 3) || 0;
      const gp = calculateUgcGrade(marks).point || 0;
      return sum + gp * credit;
    }, 0);
    const theoryGPA = theoryCredits ? theoryQuality / theoryCredits : 0;
    const theoryGrade = mapPointToGrade(theoryGPA);

    // Compute overall GPA from all subjects (lab + theory) weighted by credit
    const allSubjects = [...labRecords, ...theoryRecords];
    const totalCredits = allSubjects.reduce((sum, s) => sum + (parseFloat(s.subject_credit || s.subjectCredit || 3) || 0), 0);
    const totalQuality = allSubjects.reduce((sum, s) => {
      const marks = parseFloat(s.total || 0);
      const credit = parseFloat(s.subject_credit || s.subjectCredit || 3) || 0;
      const gp = calculateUgcGrade(marks).point || 0;
      return sum + gp * credit;
    }, 0);
    const overallGPA = totalCredits ? totalQuality / totalCredits : 0;
    const overallGrade = mapPointToGrade(overallGPA);
    const overallPassMark = overallGrade.point > 0 ? '✓' : '✗';

    // Dynamic denominators for display (subjects * 100 each)
    const labDenom = labCount ? labCount * 100 : 100;
    const theoryDenom = theoryCount ? theoryCount * 100 : 100;
    const combinedDenom = (labCount + theoryCount) ? (labCount + theoryCount) * 100 : 100;

    const renderRecords = (records, type) => {
      if (!records.length) {
        return `<tr><td colspan="${type === 'lab' ? 9 : 10}" style="text-align:center;color:#555;padding:16px">কোনো ${type === 'lab' ? 'ল্যাব' : 'থিওরি'} রেকর্ড পাওয়া যায়নি</td></tr>`;
      }
      return records.map((row, index) => {
        if (type === 'lab') {
          return `<tr><td>${index + 1}</td><td>${row.subject_code || '-'}</td><td>${row.attendance || 0}</td><td>${row.lab_report || 0}</td><td>${row.viva || 0}</td><td>${row.practical || 0}</td><td>${row.mid_exam || 0}</td><td>${row.final_exam || 0}</td><td>${row.total || 0}</td></tr>`;
        }
        return `<tr><td>${index + 1}</td><td>${row.subject_code || '-'}</td><td>${row.attendance || 0}</td><td>${row.assignment || 0}</td><td>${row.class_test || 0}</td><td>${row.quiz || 0}</td><td>${row.presentation || 0}</td><td>${row.mid_exam || 0}</td><td>${row.final_exam || 0}</td><td>${row.total || 0}</td></tr>`;
      }).join('');
    };

    win.document.open();
    win.document.write(`<html><head><title>Result - ${s.name || ''}</title><style>body{font-family:sans-serif;padding:24px;max-width:900px;margin:0 auto;color:#1f2937}.hdr{text-align:center;border-bottom:3px solid #1a56db;padding-bottom:14px;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-bottom:24px}th,td{padding:10px;border:1px solid #d1d5db;text-align:center;font-size:13px}th{background:#1a56db;color:#fff}.summary-box{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}.summary-card{flex:1 1 220px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:14px;text-align:center}.summary-card h3{margin:0 0 8px;font-size:15px;color:#0f172a}.summary-card p{margin:0;font-size:22px;font-weight:700;color:#1a56db}.grade-table th{background:#0f172a}.small-text{font-size:12px;color:#475569}@media print{body{margin:0;padding:0;min-width:0;line-height:1.2;font-size:11px}html,body{width:auto!important;max-width:100%!important}body{padding:8mm}table{font-size:11px}th,td{padding:8px}h2{font-size:18px}p, .summary-card h3, .summary-card p{font-size:12px} .summary-box{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px}.summary-card{padding:12px}.hdr{margin-bottom:18px}.grade-table th{background:#0f172a}button{display:none}}@page{size:A4 portrait;margin:8mm}</style></head><body><div class="hdr"><h2>Student Performance Report</h2><p>${s.name || ''} | ${s.student_id || ''} | ${s.dept_name || ''} | Semester ${s.sem_number || ''}</p></div><div class="summary-box"><div class="summary-card"><h3>Lab Total</h3><p>${labTotal.toFixed(1)} / ${labDenom}</p><div class="small-text">Grade: ${labGrade.grade} | GP: ${labGrade.point.toFixed(2)}</div></div><div class="summary-card"><h3>Theory Total</h3><p>${theoryTotal.toFixed(1)} / ${theoryDenom}</p><div class="small-text">Grade: ${theoryGrade.grade} | GP: ${theoryGrade.point.toFixed(2)}</div></div><div class="summary-card"><h3>Combined Total</h3><p>${(labTotal + theoryTotal).toFixed(1)} / ${combinedDenom}</p><div class="small-text">Average: ${overallAverage.toFixed(1)} / 100</div></div><div class="summary-card"><h3>Overall Grade</h3><p>${overallGrade.grade} ${overallPassMark}</p><div class="small-text">Grade Point: ${overallGrade.point.toFixed(2)}</div></div></div><h3 style="margin-bottom:10px;color:#1a56db">Lab Marks (100)</h3><table><thead><tr><th>SL</th><th>Subject Code</th><th>Attendance</th><th>Lab Report</th><th>Viva</th><th>Practical</th><th>Mid Exam</th><th>Final Exam</th><th>Total</th></tr></thead><tbody>${renderRecords(labRecords, 'lab')}</tbody></table><h3 style="margin-bottom:10px;color:#1a56db">Theory Marks (100)</h3><table><thead><tr><th>SL</th><th>Subject Code</th><th>Attendance</th><th>Assignment</th><th>Class Test</th><th>Quiz</th><th>Presentation</th><th>Mid Exam</th><th>Final Exam</th><th>Total</th></tr></thead><tbody>${renderRecords(theoryRecords, 'theory')}</tbody></table><h3 style="margin-bottom:10px;color:#1a56db">Grade Point & Grade Letter Table</h3><table class="grade-table"><thead><tr><th>Marks Range</th><th>Grade</th><th>Grade Point</th></tr></thead><tbody><tr><td>80-100</td><td>A+</td><td>4.00</td></tr><tr><td>75-79</td><td>A</td><td>3.75</td></tr><tr><td>70-74</td><td>A-</td><td>3.50</td></tr><tr><td>65-69</td><td>B+</td><td>3.25</td></tr><tr><td>60-64</td><td>B</td><td>3.00</td></tr><tr><td>55-59</td><td>B-</td><td>2.75</td></tr><tr><td>50-54</td><td>C+</td><td>2.50</td></tr><tr><td>45-49</td><td>C</td><td>2.25</td></tr><tr><td>40-44</td><td>D</td><td>2.00</td></tr><tr><td>0-39</td><td>F</td><td>0.00</td></tr></tbody></table><button onclick="window.print()" style="padding:10px 20px;background:#1a56db;color:white;border:none;border-radius:6px;cursor:pointer">Print</button></body></html>`);
    win.document.close();
  } catch (error) {
    win.document.open();
    win.document.write(`<html><head><title>Error</title></head><body style="font-family:sans-serif;padding:36px;color:#1f2937"><h2>ত্রুটি ঘটেছে</h2><p>${error?.message || 'PDF তৈরি করার সময় সমস্যা হয়েছে।'}</p></body></html>`);
    win.document.close();
    console.error(error);
  }
}

function printGraph() {
  const title = 'Graph Print - Lab & Theory Performance Evaluation System';
  const dept = document.getElementById('graphDept')?.selectedOptions[0]?.text || 'All Departments';
  const sem = document.getElementById('graphSem')?.selectedOptions[0]?.text || 'All Semesters';
  const batch = document.getElementById('graphBatch')?.selectedOptions[0]?.text || 'All Batches';
  const chartsToPrint = [
    { id: 'semGraph', title: 'Semester-wise Performance' },
    { id: 'labTheoryChart', title: 'Lab vs Theory Comparison' },
    { id: 'allDeptChart', title: 'All Departments Comparison' }
  ];

  const images = chartsToPrint.map(chart => {
    const canvas = document.getElementById(chart.id);
    if (!canvas) return null;
    return { title: chart.title, src: canvas.toDataURL('image/png') };
  }).filter(Boolean);

  const win = window.open('', '_blank');
  if (!win) {
    if (typeof showToast === 'function') showToast('Popup It is closed, please turn on the pop-up.', 'error');
    return;
  }
  win.document.open();

  let html = `<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;margin:0;padding:20px;background:#f8fafc;color:#111}
    .header{padding:12px 0;border-bottom:2px solid #1a56db;margin-bottom:18px}
    .header h1{margin:0;font-size:24px;color:#1a56db}
    .meta{margin-top:8px;font-size:14px;color:#334155}
    .chart-block{margin-bottom:26px;page-break-inside:avoid}
    .chart-block h2{margin:0 0 10px;font-size:18px;color:#0f172a}
    .chart-block img{width:100%;height:auto;border:1px solid #cbd5e1;border-radius:8px}
    @media print{body{margin:0;padding:8mm;min-width:0;line-height:1.2;font-size:11px}html,body{width:auto!important;max-width:100%!important}.header{border:none}.chart-block{page-break-inside:avoid;break-inside:avoid-column}button{display:none}}@page{size:A4 portrait;margin:8mm}
  </style></head><body>
    <div class="header">
      <h1>Graph Print</h1>
      <div class="meta">Department: ${dept} | Semester: ${sem} | Batch: ${batch}</div>
    </div>`;

  images.forEach(img => {
    html += `<div class="chart-block"><h2>${img.title}</h2><img src="${img.src}" alt="${img.title}"></div>`;
  });

  html += '<button onclick="window.print()" style="padding:10px 20px;background:#1a56db;color:white;border:none;border-radius:6px;cursor:pointer">প্রিন্ট করুন</button>';
  html += '</body></html>';

  win.document.write(html);
  win.document.close();
  win.focus();
}

/* ─── MODAL ──────────────────────────────────────── */
function openModal() {
  document.getElementById('modal').classList.add('show');
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modal').classList.remove('show');
  document.getElementById('modalOverlay').classList.remove('show');
}

/* ─── POPUP ──────────────────────────────────────── */
function showPopup(title, msg) {
  document.getElementById('popupTitle').textContent = title;
  document.getElementById('popupMsg').textContent = msg;
  document.getElementById('successPopup').classList.add('show');
}
function closePopup() { document.getElementById('successPopup').classList.remove('show'); }

/* ─── TOAST ──────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => { t.classList.remove('show'); }, 3000);
}

/* ════════════════════════════════════════════════════
   PDF Card-Based Dashboard Functions
════════════════════════════════════════════════════ */

/**
 * Toggle PDF card open/close state
 * Opens selected card, closes all others, and toggles content visibility
 */
function toggleCard(cardElement, contentId, event) {
  event?.stopPropagation?.();
  
  const contentPanel = document.getElementById(contentId);
  if (!contentPanel) return;

  const isActive = cardElement.classList.contains('active');
  document.querySelectorAll('.pdf-card').forEach(card => card.classList.remove('active'));
  document.querySelectorAll('.pdf-card-content').forEach(panel => {
    panel.classList.remove('active');
    panel.style.display = 'none';
  });

  if (!isActive) {
    cardElement.classList.add('active');
    contentPanel.classList.add('active');
    contentPanel.style.display = 'block';
  }
}

/**
 * Initialize PDF dashboard - populate departments in all cards
 */
async function initPdfDashboard() {
  // Populate department dropdowns for all PDF cards
  populateDeptDropdowns('examDept', 'examSem');
  populateDeptDropdowns('studentDept', 'studentSem');
  populateDeptDropdowns('batchDept', 'batchSem');
}

/**
 * Load semesters for selected department in PDF card
 */
async function loadExamSemesters(deptSelectId, semSelectId) {
  loadSemestersFor(semSelectId, deptSelectId);
}

/**
 * Generate Exam PDF
 */
// Store the current PDF URL for downloading
let currentExamPdfUrl = null;

async function generateExamPDF() {
  const examType = document.getElementById('examType')?.value;
  const batch = document.getElementById('examBatch')?.value;
  const deptId = document.getElementById('examDept')?.value;
  const semId = document.getElementById('examSem')?.value;
  const orientation = document.getElementById('examOrientation')?.value || 'portrait';
  
  if (!examType || !deptId || !semId) {
    showToast('Fill All Fields', 'error');
    return;
  }
  
  try {
    // First, fetch student marks data
    showToast('Loading Student Information...', 'info');
    
    const marksResponse = await api('/student-marks', 'POST', {
      exam_type: examType,
      batch: batch || '',
      department_id: deptId,
      semester_id: semId
    });
    
    if (!marksResponse || !Array.isArray(marksResponse)) {
      showToast('Failed to load student information', 'error');
      return;
    }
    
    // Display marks in table
    displayExamMarksTable(marksResponse, examType);
    
    // Export to Excel instead of PDF
    showToast('Generating Excel File...', 'info');
    
    const table = document.getElementById('examMarksTable');
    if (table) {
      try {
        const ws = XLSX.utils.table_to_sheet(table);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Exam Marks');
        const filename = `exam_${examType}_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, filename);
        
        // Show success message in preview container
        const previewContainer = document.getElementById('examPdfPreview');
        if (previewContainer) {
          previewContainer.innerHTML = `
            <div style="text-align:center;padding:30px;background:#f0fdf4;border-radius:8px;border:2px solid #16a34a">
              <i class="fas fa-file-excel" style="font-size:48px;color:#16a34a;margin-bottom:12px;display:block"></i>
              <h3 style="margin:12px 0;color:#16a34a;font-size:18px">✓ Excel File Generated Successfully</h3>
              <p style="margin:8px 0;color:#666;font-size:14px">File download started: ${filename}</p>
              <button onclick="generateExamPDF()" class="pdf-btn pdf-btn-primary" style="margin-top:12px;"><i class="fas fa-redo"></i> Export Again</button>
            </div>
          `;
        }
        
        showToast('Excel File Generated Successfully', 'success');
      } catch (e) {
        console.error('Excel export error:', e);
        showToast('Excel Export Failed', 'error');
      }
    } else {
      showToast('Table not found', 'error');
    }
  } catch (err) {
    showToast('Error: ' + (err.message || 'Unknown error'), 'error');
  }
}

function displayExamMarksTable(marksData, examType) {
  const container = document.getElementById('examMarksContainer');
  const tableHead = document.getElementById('examMarksTableHead');
  const tableBody = document.getElementById('examMarksTableBody');
  
  if (!marksData || marksData.length === 0) {
    showToast('No students found', 'warning');
    if (container) container.style.display = 'none';
    return;
  }
  
  // Determine column headers based on exam type
  let headers = ['#', 'Student ID', 'Name', 'Batch', 'Subject Code', 'Subject Name'];
  
  if (examType === 'lab') {
    headers.push('Attendance', 'Lab Report', 'Viva', 'Practical', 'Mid Exam', 'Final Exam', 'Total');
  } else {
    headers.push('Attendance', 'Assignment', 'Class Test', 'Quiz', 'Presentation', 'Mid Exam', 'Final Exam', 'Total');
  }
  
  // Clear existing headers
  tableHead.innerHTML = '';
  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '8px';
    th.style.border = '1px solid #ddd';
    th.style.backgroundColor = '#f3f4f6';
    th.style.fontWeight = 'bold';
    tableHead.appendChild(th);
  });
  
  // Clear existing rows
  tableBody.innerHTML = '';
  
  // Group by student
  const studentMap = {};
  marksData.forEach(row => {
    if (!studentMap[row.student_id]) {
      studentMap[row.student_id] = {
        student_id: row.student_id,
        name: row.name,
        batch: row.batch,
        subjects: []
      };
    }
    studentMap[row.student_id].subjects.push(row);
  });
  
  let rowIndex = 1;
  Object.values(studentMap).forEach(student => {
    student.subjects.forEach((subject, idx) => {
      const tr = document.createElement('tr');
      
      const cells = [
        rowIndex.toString(),
        student.student_id,
        student.name,
        student.batch || '-',
        subject.subject_code || '-',
        subject.subject_name || '-'
      ];
      
      if (examType === 'lab') {
        cells.push(
          (subject.attendance || 0).toFixed(1),
          (subject.lab_report || 0).toFixed(1),
          (subject.viva || 0).toFixed(1),
          (subject.practical || 0).toFixed(1),
          (subject.mid_exam || 0).toFixed(1),
          (subject.final_exam || 0).toFixed(1),
          (subject.total || 0).toFixed(1)
        );
      } else {
        cells.push(
          (subject.attendance || 0).toFixed(1),
          (subject.assignment || 0).toFixed(1),
          (subject.class_test || 0).toFixed(1),
          (subject.quiz || 0).toFixed(1),
          (subject.presentation || 0).toFixed(1),
          (subject.mid_exam || 0).toFixed(1),
          (subject.final_exam || 0).toFixed(1),
          (subject.total || 0).toFixed(1)
        );
      }
      
      cells.forEach(cellText => {
        const td = document.createElement('td');
        td.textContent = cellText;
        td.style.padding = '8px';
        td.style.border = '1px solid #ddd';
        tr.appendChild(td);
      });
      
      tableBody.appendChild(tr);
      rowIndex++;
    });
  });
  
  // Show the container
  if (container) {
    container.style.display = 'block';
  }
}

function downloadExamPDF() {
  if (!currentExamPdfUrl) {
    showToast('First generate the PDF', 'error');
    return;
  }
  
  const examType = document.getElementById('examType')?.value || 'exam';
  const link = document.createElement('a');
  link.href = currentExamPdfUrl;
  link.download = `exam_${examType}_${Date.now()}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('PDF ডাউনলোড শুরু হয়েছে', 'success');
}

// If PDF hasn't been generated, allow downloading the visible marks table as CSV
function exportExamMarksTableAsCSV() {
  const table = document.getElementById('examMarksTable');
  if (!table) {
    showToast('Marks table Not found', 'error');
    return;
  }

  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) {
    showToast('Table is empty', 'error');
    return;
  }

  const csvLines = rows.map(row => {
    const cells = Array.from(row.querySelectorAll('th,td'));
    return cells.map(cell => {
      let text = (cell.textContent || '').trim();
      // Escape double quotes
      if (text.indexOf('"') !== -1) text = text.replace(/"/g, '""');
      // Wrap fields containing comma, quote or newline in double quotes
      if (/[",\n]/.test(text)) text = `"${text}"`;
      return text;
    }).join(',');
  }).join('\n');

  const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `exam_marks_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV Download started', 'success');
}

// Enhance existing download handler: if PDF exists download it, otherwise export CSV
function downloadExamPDFEnhanced() {
  try {
    if (typeof currentExamPdfUrl !== 'undefined' && currentExamPdfUrl) {
      downloadExamPDF();
      return;
    }
  } catch (e) {
    // ignore
  }
  exportExamMarksTableAsCSV();
}

/**
 * Generate Student CGPA Grade Sheet PDF
 */
async function generateStudentCGPA() {
  const studentId = document.getElementById('studentId')?.value;
  const deptId = document.getElementById('studentDept')?.value;
  const semId = document.getElementById('studentSem')?.value;
  const orientation = document.getElementById('studentOrientation')?.value || 'portrait';
  
  if (!studentId || !deptId || !semId) {
    showToast('Please fill all fields', 'error');
    return;
  }
  
  const previewContainer = document.getElementById('studentPdfPreview');
  if (previewContainer) {
    previewContainer.innerHTML = '<div style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:#1a56db"></i><p>PDF তৈরি করছি...</p></div>';
  }
  
  try {
    const response = await api('/pdf/student-cgpa', 'POST', {
      student_id: studentId,
      department_id: deptId,
      semester_id: semId,
      orientation: orientation
    });
    
    if (response && response.url) {
        if (previewContainer) {
        previewContainer.innerHTML = `
          <iframe src="${response.url}" style="width:100%;height:80vh;border:none;border-radius:8px"></iframe>
          <div style="margin-top:12px;display:flex;gap:12px;justify-content:center">
            <a href="${response.url}" download="student_cgpa_${studentId}.pdf" class="pdf-btn pdf-btn-primary" style="text-decoration:none">
              <i class="fas fa-download"></i> Download
            </a>
            <a href="${response.url}" target="_blank" class="pdf-btn pdf-btn-secondary" style="text-decoration:none">
              <i class="fas fa-external-link-alt"></i> Open in New Tab
            </a>
            <button class="pdf-btn pdf-btn-primary" style="text-decoration:none" onclick="exportStudentCGPAAsXLSX()"><i class="fas fa-file-excel"></i> Export Excel</button>
          </div>
        `;
      }
      showToast('PDF generated successfully', 'success');
    } else {
      showToast('Failed to generate PDF', 'error');
    }
  } catch (err) {
    showToast('PDF generation error: ' + (err.message || 'Unknown error'), 'error');
    if (previewContainer) {
      previewContainer.innerHTML = '<div style="text-align:center;padding:40px;color:#dc2626"><i class="fas fa-exclamation-circle" style="font-size:32px;margin-bottom:12px"></i><p>PDF generation error</p></div>';
    }
  }
}

/**
 * Generate Batch Final CGPA Report PDF
 */
async function generateBatchCGPA() {
  const batch = document.getElementById('batchName')?.value;
  const deptId = document.getElementById('batchDept')?.value;
  const semId = document.getElementById('batchSem')?.value;
  const orientation = document.getElementById('batchOrientation')?.value || 'portrait';
  
  if (!batch || !deptId || !semId) {
    showToast('Please fill all fields', 'error');
    return;
  }
  
  const previewContainer = document.getElementById('batchPdfPreview');
  if (previewContainer) {
    previewContainer.innerHTML = '<div style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:#1a56db"></i><p>PDF generating...</p></div>';
  }
  
  try {
    const response = await api('/pdf/batch-cgpa', 'POST', {
      batch: batch,
      department_id: deptId,
      semester_id: semId,
      orientation: orientation
    });
    
    if (response && response.url) {
        if (previewContainer) {
        previewContainer.innerHTML = `
          <iframe src="${response.url}" style="width:100%;height:80vh;border:none;border-radius:8px"></iframe>
          <div style="margin-top:12px;display:flex;gap:12px;justify-content:center">
            <a href="${response.url}" download="batch_cgpa_${batch}.pdf" class="pdf-btn pdf-btn-primary" style="text-decoration:none">
              <i class="fas fa-download"></i> Download
            </a>
            <a href="${response.url}" target="_blank" class="pdf-btn pdf-btn-secondary" style="text-decoration:none">
              <i class="fas fa-external-link-alt"></i> Open in New Tab
            </a>
            <button class="pdf-btn pdf-btn-primary" style="text-decoration:none" onclick="exportBatchCGPAAsXLSX()"><i class="fas fa-file-excel"></i> Export Excel</button>
          </div>
        `;
      }
      showToast('PDF generated successfully', 'success');
    } else {
      showToast('Failed to generate PDF', 'error');
    }
  } catch (err) {
    showToast('PDF generation error: ' + (err.message || 'Unknown error'), 'error');
    if (previewContainer) {
      previewContainer.innerHTML = '<div style="text-align:center;padding:40px;color:#dc2626"><i class="fas fa-exclamation-circle" style="font-size:32px;margin-bottom:12px"></i><p>PDF generation error</p></div>';
    }
  }
}

// Export visible exam marks table to XLSX using SheetJS
function exportExamMarksAsXLSX() {
  const table = document.getElementById('examMarksTable');
  if (!table) { showToast('Marks table not found', 'error'); return; }
  try {
    const wb = XLSX.utils.table_to_book(table, { sheet: 'Marks' });
    XLSX.writeFile(wb, `exam_marks_${Date.now()}.xlsx`);
    showToast('Excel download started', 'success');
  } catch (e) { console.error(e); showToast('Excel export failed', 'error'); }
}

// Attempt to fetch structured student CGPA data from backend and export as XLSX
async function exportStudentCGPAAsXLSX() {
  const studentId = document.getElementById('studentId')?.value;
  const deptId = document.getElementById('studentDept')?.value;
  const semId = document.getElementById('studentSem')?.value;
  if (!studentId || !deptId || !semId) { showToast('Please fill all fields', 'error'); return; }
  showToast('Loading data...', 'info');
  try {
    const res = await api('/student-cgpa-data', 'POST', { student_id: studentId, department_id: deptId, semester_id: semId });
    if (!res || res.error) { showToast('Backend is not providing the data', 'error'); return; }
    // Expecting array of objects or an object with records
    const data = Array.isArray(res) ? res : (res.records || []);
    if (!Array.isArray(data) || data.length === 0) { showToast('No data available for export', 'error'); return; }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CGPA');
    XLSX.writeFile(wb, `student_cgpa_${studentId}_${Date.now()}.xlsx`);
    showToast('Excel download started', 'success');
  } catch (e) { console.error(e); showToast('Excel export failed', 'error'); }
}

// Attempt to fetch structured batch CGPA data from backend and export as XLSX
async function exportBatchCGPAAsXLSX() {
  const batch = document.getElementById('batchName')?.value;
  const deptId = document.getElementById('batchDept')?.value;
  const semId = document.getElementById('batchSem')?.value;
  if (!batch || !deptId || !semId) { showToast('Please fill all fields', 'error'); return; }
  showToast('Loading data...', 'info');
  try {
    const res = await api('/batch-cgpa-data', 'POST', { batch: batch, department_id: deptId, semester_id: semId });
    if (!res || res.error) { showToast('Backend is not providing the data', 'error'); return; }
    const data = Array.isArray(res) ? res : (res.records || []);
    if (!Array.isArray(data) || data.length === 0) { showToast('No data available for export', 'error'); return; }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Batch CGPA');
    XLSX.writeFile(wb, `batch_cgpa_${batch}_${Date.now()}.xlsx`);
    showToast('Excel download started', 'success');
  } catch (e) { console.error(e); showToast('Excel export failed', 'error'); }
}