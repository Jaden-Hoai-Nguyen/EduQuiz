/* ic3-dashboard.html — JS riêng cho trang Dashboard (tách từ inline <script>) */
/* ========================================
   DATA STORE
   ======================================== */
const QUIZ_SETS = [
  {
    id: 'class6',
    title: 'THCS – Khối 6',
    subtitle: 'IC3 GS5 – Trung học cơ sở',
    questions: 30,
    type: 'middle',
    icon: '🎒',
    coverGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    coverBg: '#667eea',
    link: 'https://wit.id.vn/20252026/THCS/Class6',
    students: 124
  },
  {
    id: 'class7',
    title: 'THCS – Khối 7',
    subtitle: 'IC3 GS5 – Trung học cơ sở',
    questions: 30,
    type: 'middle',
    icon: '💻',
    coverGradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    coverBg: '#f093fb',
    link: 'https://wit.id.vn/20252026/THCS/Class7',
    students: 98
  },
  {
    id: 'class8',
    title: 'THCS – Khối 8',
    subtitle: 'IC3 GS5 – Trung học cơ sở',
    questions: 30,
    type: 'middle',
    icon: '🌐',
    coverGradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    coverBg: '#4facfe',
    link: 'https://wit.id.vn/20252026/THCS/Class8',
    students: 111
  },
  {
    id: 'tiH3',
    title: 'Tiểu học – Khối 3',
    subtitle: 'IC3 GS5 – Tiểu học LV1',
    questions: 25,
    type: 'elementary',
    icon: '🌱',
    coverGradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    coverBg: '#43e97b',
    link: 'https://wit.id.vn/20252026/TiH/LV1_Class3',
    students: 87
  },
  {
    id: 'tiH4',
    title: 'Tiểu học – Khối 4',
    subtitle: 'IC3 GS5 – Tiểu học LV2',
    questions: 25,
    type: 'elementary',
    icon: '⭐',
    coverGradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    coverBg: '#fa709a',
    link: 'https://wit.id.vn/20252026/TiH/LV2_Class4',
    students: 95
  },
  {
    id: 'tiH5',
    title: 'Tiểu học – Khối 5',
    subtitle: 'IC3 GS5 – Tiểu học LV3',
    questions: 25,
    type: 'elementary',
    icon: '🚀',
    coverGradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    coverBg: '#a18cd1',
    link: 'https://wit.id.vn/20252026/TiH/LV3_Class5',
    students: 102
  }
];

/* Load custom sets from localStorage */
function loadSets() {
  const saved = localStorage.getItem('ic3_custom_sets');
  if (saved) {
    try {
      const extra = JSON.parse(saved);
      return [...QUIZ_SETS, ...extra];
    } catch(e) {}
  }
  return [...QUIZ_SETS];
}

let allSets = loadSets();
let currentFilter = 'all';
let currentSearch = '';

/* ========================================
   RENDER CARDS
   ======================================== */
function renderCards() {
  const grid = document.getElementById('cardsGrid');
  let sets = allSets;

  // Filter by type
  if (currentFilter !== 'all') {
    sets = sets.filter(s => s.type === currentFilter);
  }
  // Search
  if (currentSearch) {
    sets = sets.filter(s => s.title.toLowerCase().includes(currentSearch.toLowerCase()));
  }

  if (sets.length === 0) {
    grid.innerHTML = `<div class="no-results"><span class="emoji">🔍</span><p>Không tìm thấy bộ đề nào phù hợp.</p></div>`;
    return;
  }

  grid.innerHTML = sets.map(set => `
    <div class="quiz-card" data-id="${set.id}" data-type="${set.type}">
      <div class="card-cover" style="background:${set.coverGradient};">
        <div class="cover-pattern"></div>
        <div class="cover-icon">${set.icon}</div>
      </div>
      <div class="card-body">
        <div class="card-header">
          <div class="card-title">${set.title}</div>
          <span class="badge ${set.type === 'elementary' ? 'badge-elementary' : 'badge-middle'}">
            ${set.type === 'elementary' ? '🌱 Tiểu học' : '🎒 THCS'}
          </span>
        </div>
        <div class="card-stats">
          <div class="stat-item"><span>📝</span><span>${set.questions} câu hỏi</span></div>
          <div class="stat-item"><span>👥</span><span>${set.students} lượt</span></div>
        </div>
        <div class="card-actions">
          <button class="btn-play" onclick="startQuiz('${set.id}', event)">🚀 Bắt đầu làm bài</button>
          <button class="btn-manage" onclick="openManageModal('${set.id}', event)">⚙️</button>
        </div>
      </div>
    </div>
  `).join('');
}

/* ========================================
   FILTERS & SEARCH
   ======================================== */
function setFilter(btn, filter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = filter;
  renderCards();
}

function filterCards() {
  currentSearch = document.getElementById('searchInput').value;
  renderCards();
}

/* ========================================
   SESSION & QUIZ START (Anti-cheat)
   ======================================== */
function startQuiz(id, event) {
  event && event.stopPropagation();
  const set = allSets.find(s => s.id === id);
  if (!set) return;

  // Record session in localStorage
  const studentName = prompt('Nhập tên của bạn để ghi nhận phiên làm bài:', 'Học sinh');
  if (!studentName) return;

  const session = {
    id: 'sess_' + Date.now(),
    studentName: studentName.trim() || 'Học sinh',
    setId: id,
    setTitle: set.title,
    startTime: new Date().toLocaleString('vi-VN'),
    status: 'Đang làm',
    score: null,
    locked: true // can't be manually edited
  };

  saveSession(session);
  showToast(`📌 Ghi nhận: ${session.studentName} – ${set.title}`);

  // Open quiz link after short delay
  setTimeout(() => {
    window.open(set.link, '_blank', 'noopener,noreferrer');
    // Simulate score coming back (demo only)
    simulateScore(session.id, id);
  }, 800);

  updateReportTab();
}

function saveSession(session) {
  let sessions = getSessions();
  sessions.push(session);
  localStorage.setItem('ic3_sessions', JSON.stringify(sessions));
}

function getSessions() {
  try { return JSON.parse(localStorage.getItem('ic3_sessions') || '[]'); } catch { return []; }
}

function simulateScore(sessionId, setId) {
  // Demo: after 5s, mark session done with random score
  setTimeout(() => {
    let sessions = getSessions();
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx !== -1) {
      const set = allSets.find(s => s.id === setId);
      const total = set ? set.questions : 30;
      const correct = Math.floor(Math.random() * (total - Math.floor(total * 0.4))) + Math.floor(total * 0.4);
      const score = Math.round((correct / total) * 100);
      sessions[idx].score = score;
      sessions[idx].correct = correct;
      sessions[idx].total = total;
      sessions[idx].status = 'Hoàn thành';
      localStorage.setItem('ic3_sessions', JSON.stringify(sessions));
      updateReportTab();
    }
  }, 5000);
}

/* ========================================
   REPORT TAB — dữ liệu thật từ Firestore (collection "quiz_results")
   ======================================== */
let _reportRawDocs   = null;  // cache toàn bộ bản ghi tải từ Firestore (chưa lọc)
let _reportFiltered  = [];    // bản ghi sau khi áp bộ lọc (dùng để xuất CSV)
let _reportCharts    = {};    // instance Chart.js đang hiển thị (để destroy trước khi vẽ lại)
let _reportFiltersBuilt = false;

/** Tải dữ liệu (nếu chưa có cache) rồi áp bộ lọc + vẽ lại toàn bộ báo cáo. */
async function updateReportTab() {
  const body = document.getElementById('reportBody');

  if (!window.EduFirebase || !window.EduFirebase.db) {
    body.innerHTML = `<tr><td colspan="6" class="table-empty-cell">⚠️ Chưa kết nối được Firestore.</td></tr>`;
    return;
  }

  if (_reportRawDocs === null) {
    body.innerHTML = `<tr><td colspan="6" class="table-empty-cell">Đang tải dữ liệu...</td></tr>`;
    try {
      const snap = await window.EduFirebase.db.collection('quiz_results')
        .orderBy('submittedAt', 'desc')
        .limit(500)
        .get();
      _reportRawDocs = snap.docs.map(doc => {
        const d = doc.data();
        return Object.assign({ id: doc.id }, d, {
          submittedAtMs: d.submittedAt && d.submittedAt.toMillis ? d.submittedAt.toMillis() : Date.now(),
        });
      });
    } catch (err) {
      console.error('[EduQuiz] Lỗi tải báo cáo Firestore:', err);
      body.innerHTML = `<tr><td colspan="6" class="table-empty-cell">❌ Không tải được dữ liệu: ${err.message}</td></tr>`;
      return;
    }
  }

  buildReportFilterOptions(_reportRawDocs);
  applyReportFiltersAndRender();
}

/** Đổ dữ liệu lớp / bài thi vào 2 dropdown lọc (chỉ dựng 1 lần khi có dữ liệu mới). */
function buildReportFilterOptions(docs) {
  if (_reportFiltersBuilt) return;
  const classSel = document.getElementById('filterClass');
  const testSel  = document.getElementById('filterTest');

  const classes = [...new Set(docs.map(d => d.studentClass).filter(Boolean))].sort();
  const tests   = [...new Set(docs.map(d => d.testName).filter(Boolean))].sort();

  classes.forEach(c => classSel.insertAdjacentHTML('beforeend', `<option value="${escHtml(c)}">${escHtml(c)}</option>`));
  tests.forEach(t => testSel.insertAdjacentHTML('beforeend', `<option value="${escHtml(t)}">${escHtml(t)}</option>`));

  [classSel, testSel, document.getElementById('filterRange')].forEach(sel => {
    sel.addEventListener('change', applyReportFiltersAndRender);
  });
  _reportFiltersBuilt = true;
}

/** Áp bộ lọc hiện tại (lớp / bài thi / khoảng thời gian) lên _reportRawDocs rồi vẽ lại UI. */
function applyReportFiltersAndRender() {
  const classVal = document.getElementById('filterClass').value;
  const testVal  = document.getElementById('filterTest').value;
  const rangeVal = document.getElementById('filterRange').value;

  const now = Date.now();
  const rangeMs = { '7': 7, '30': 30, '90': 90 }[rangeVal];
  const cutoff = rangeMs ? now - rangeMs * 86400000 : null;

  _reportFiltered = (_reportRawDocs || []).filter(d =>
    (!classVal || d.studentClass === classVal) &&
    (!testVal || d.testName === testVal) &&
    (!cutoff || d.submittedAtMs >= cutoff)
  );

  renderReportStats(_reportFiltered);
  renderReportTable(_reportFiltered);
  renderReportCharts(_reportFiltered);
}

function renderReportStats(rows) {
  const scores = rows.map(r => r.score).filter(x => typeof x === 'number');
  const passed = scores.filter(s => s >= 70);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const topScore = scores.length ? Math.max(...scores) : null;
  const passRate = scores.length ? Math.round((passed.length / scores.length) * 100) : null;

  document.getElementById('totalSessions').textContent = rows.length;
  document.getElementById('totalDone').textContent = passRate !== null ? passRate + '%' : '—';
  document.getElementById('avgScore').textContent = avgScore !== null ? avgScore + '%' : '—';
  document.getElementById('topScore').textContent = topScore !== null ? topScore + '%' : '—';
}

function renderReportTable(rows) {
  const body = document.getElementById('reportBody');
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="table-empty-cell">Chưa có dữ liệu phù hợp bộ lọc. Học sinh bắt đầu làm bài để xem kết quả.</td></tr>`;
    return;
  }
  body.innerHTML = rows.slice(0, 200).map(r => {
    const dateStr = new Date(r.submittedAtMs).toLocaleString('vi-VN');
    const ok = r.integrityOk !== false;
    return `
    <tr>
      <td><strong>${escHtml(r.studentName || 'Ẩn danh')}</strong></td>
      <td>${escHtml(r.studentClass || '—')}</td>
      <td>${escHtml(r.testName || '—')}</td>
      <td style="color:var(--text-muted);font-size:12px;">${dateStr}</td>
      <td>
        <div class="score-bar-wrap">
          <div class="score-bar"><div class="score-bar-fill" style="width:${r.score}%"></div></div>
          <span class="score-label">${r.score}%</span>
        </div>
      </td>
      <td class="${ok ? 'status-done' : 'status-progress'}">${ok ? '✅ Hợp lệ' : '⚠️ Nghi vấn'}</td>
    </tr>`;
  }).join('');
}

function renderReportCharts(rows) {
  if (typeof Chart === 'undefined') return; // thư viện chưa tải xong / bị chặn mạng

  Object.values(_reportCharts).forEach(c => c && c.destroy());
  _reportCharts = {};

  const scores = rows.map(r => r.score).filter(x => typeof x === 'number');
  const passed = scores.filter(s => s >= 70).length;
  const failed = scores.length - passed;

  // 1) Đạt / Chưa đạt
  _reportCharts.passFail = new Chart(document.getElementById('chartPassFail'), {
    type: 'doughnut',
    data: {
      labels: ['Đạt (≥70%)', 'Chưa đạt (<70%)'],
      datasets: [{ data: [passed, failed], backgroundColor: ['#21b36b', '#f0483e'], borderWidth: 0 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  });

  // 2) Điểm trung bình theo lớp
  const byClass = {};
  rows.forEach(r => {
    const key = r.studentClass || 'Chưa rõ';
    if (!byClass[key]) byClass[key] = [];
    if (typeof r.score === 'number') byClass[key].push(r.score);
  });
  const classLabels = Object.keys(byClass).sort();
  const classAverages = classLabels.map(k => Math.round(byClass[k].reduce((a, b) => a + b, 0) / byClass[k].length));

  _reportCharts.byClass = new Chart(document.getElementById('chartByClass'), {
    type: 'bar',
    data: {
      labels: classLabels,
      datasets: [{ label: 'Điểm TB (%)', data: classAverages, backgroundColor: '#4f6bff', borderRadius: 6 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } },
    },
  });

  // 3) Xu hướng điểm trung bình theo ngày
  const byDay = {};
  rows.forEach(r => {
    const day = new Date(r.submittedAtMs).toLocaleDateString('vi-VN');
    if (!byDay[day]) byDay[day] = [];
    if (typeof r.score === 'number') byDay[day].push(r.score);
  });
  const dayEntries = Object.entries(byDay)
    .map(([day, arr]) => ({ day, avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) }))
    .sort((a, b) => new Date(a.day.split('/').reverse().join('-')) - new Date(b.day.split('/').reverse().join('-')));

  _reportCharts.trend = new Chart(document.getElementById('chartTrend'), {
    type: 'line',
    data: {
      labels: dayEntries.map(e => e.day),
      datasets: [{
        label: 'Điểm TB theo ngày (%)',
        data: dayEntries.map(e => e.avg),
        borderColor: '#17b3a3', backgroundColor: 'rgba(23,179,163,.15)',
        fill: true, tension: 0.3, pointRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } },
    },
  });
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ========================================
   MANAGE MODAL
   ======================================== */
function openManageModal(id, event) {
  event && event.stopPropagation();
  const set = allSets.find(s => s.id === id);
  if (!set) return;

  const sessions = getSessions().filter(s => s.setId === id);
  document.getElementById('modal-title').innerHTML = `⚙️ Quản lý – ${set.title}`;
  document.getElementById('modal-footer').innerHTML = `<button class="btn-cancel" onclick="closeModal()">Đóng</button>`;

  const items = sessions.length === 0
    ? `<div style="text-align:center;color:var(--text-muted);padding:24px 0;">Chưa có học sinh nào làm bài này.</div>`
    : sessions.map((s, i) => {
        const emojis = ['😊','🎯','🌟','🦊','🐼','🦋','🚀','🎲'];
        const colors = ['#f59e0b','#10b981','#6366f1','#ef4444','#ec4899','#14b8a6','#f97316','#8b5cf6'];
        return `<div class="progress-item">
          <div class="progress-avatar" style="background:${colors[i%colors.length]}22">${emojis[i%emojis.length]}</div>
          <div class="progress-info">
            <div class="progress-name">${s.studentName}</div>
            <div class="progress-meta">${s.startTime}</div>
          </div>
          <div class="progress-score" style="color:${s.score !== null ? '#6366f1' : 'var(--text-muted)'}">
            ${s.score !== null ? s.score + '%' : '...'}
          </div>
        </div>`;
      }).join('');

  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:4px;">
      <div style="background:var(--input-bg);border-radius:10px;padding:12px 18px;flex:1;text-align:center;">
        <div style="font-size:22px;font-weight:900;font-family:'Baloo 2',cursive;">${sessions.length}</div>
        <div style="font-size:11px;font-weight:700;color:var(--text-muted)">Lượt làm</div>
      </div>
      <div style="background:var(--input-bg);border-radius:10px;padding:12px 18px;flex:1;text-align:center;">
        <div style="font-size:22px;font-weight:900;font-family:'Baloo 2',cursive;">${sessions.filter(s=>s.status==='Hoàn thành').length}</div>
        <div style="font-size:11px;font-weight:700;color:var(--text-muted)">Hoàn thành</div>
      </div>
      <div style="background:var(--input-bg);border-radius:10px;padding:12px 18px;flex:1;text-align:center;">
        <div style="font-size:22px;font-weight:900;font-family:'Baloo 2',cursive;">${set.questions}</div>
        <div style="font-size:11px;font-weight:700;color:var(--text-muted)">Câu hỏi</div>
      </div>
    </div>
    <div style="font-weight:800;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">Danh sách học sinh</div>
    <div class="progress-student-list">${items}</div>
  `;

  openModalEl();
}

/* ========================================
   CREATE MODAL
   ======================================== */
function openModal(type) {
  document.getElementById('modal-title').innerHTML = '➕ Tạo bộ đề mới';
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn-cancel" onclick="closeModal()">Huỷ bỏ</button>
    <button class="btn-save" onclick="saveNewSet()">💾 Lưu bộ đề</button>
  `;
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Tên bộ đề *</label>
      <input id="newSetName" type="text" placeholder="VD: THCS – Khối 9">
    </div>
    <div class="form-group">
      <label>Cấp học *</label>
      <select id="newSetType">
        <option value="elementary">🌱 Tiểu học</option>
        <option value="middle">🎒 THCS</option>
      </select>
    </div>
    <div class="form-group">
      <label>Số câu hỏi</label>
      <input id="newSetQuestions" type="number" min="1" max="200" placeholder="30" value="30">
    </div>
    <div class="form-group">
      <label>Link ôn tập *</label>
      <input id="newSetLink" type="url" placeholder="https://wit.id.vn/...">
    </div>
    <div class="form-group">
      <label>Biểu tượng (emoji)</label>
      <input id="newSetIcon" type="text" placeholder="🎯" maxlength="2" value="🎯">
    </div>
  `;
  openModalEl();
}

function openModalEl() {
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}
function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function saveNewSet() {
  const name = document.getElementById('newSetName')?.value?.trim();
  const type = document.getElementById('newSetType')?.value;
  const link = document.getElementById('newSetLink')?.value?.trim();
  const questions = parseInt(document.getElementById('newSetQuestions')?.value || 30);
  const icon = document.getElementById('newSetIcon')?.value?.trim() || '🎯';

  if (!name || !link) {
    alert('Vui lòng nhập đầy đủ Tên bộ đề và Link ôn tập!');
    return;
  }

  const gradients = [
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  ];

  const newSet = {
    id: 'custom_' + Date.now(),
    title: name,
    subtitle: type === 'elementary' ? 'IC3 GS5 – Tiểu học' : 'IC3 GS5 – THCS',
    questions: questions || 30,
    type: type,
    icon: icon,
    coverGradient: gradients[Math.floor(Math.random() * gradients.length)],
    link: link,
    students: 0
  };

  // Save to localStorage
  const saved = JSON.parse(localStorage.getItem('ic3_custom_sets') || '[]');
  saved.push(newSet);
  localStorage.setItem('ic3_custom_sets', JSON.stringify(saved));

  allSets = loadSets();
  renderCards();
  closeModal();
  showToast('✅ Đã tạo bộ đề: ' + name);
}

/* ========================================
   TOAST NOTIFICATION
   ======================================== */
function showToast(msg) {
  const toast = document.getElementById('session-toast');
  document.getElementById('toast-text').textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ========================================
   NAVIGATION
   ======================================== */
const SECTION_TITLES = {
  'my-sets': '📚 Bộ đề của tôi',
  'reports': '📊 Báo cáo kết quả',
  'settings': '⚙️ Cài đặt hệ thống'
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const section = item.dataset.section;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    item.classList.add('active');
    document.getElementById('section-' + section).classList.add('active');
    document.getElementById('topbar-title').textContent = SECTION_TITLES[section];

    if (section === 'reports') updateReportTab();

    // Close sidebar on mobile
    if (window.innerWidth <= 900) closeSidebar();
  });
});

/* ========================================
   THEME TOGGLE
   ======================================== */
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('ic3_theme', isDark ? 'light' : 'dark');
  const sd = document.getElementById('settingsDark');
  if (sd) sd.classList.toggle('on', !isDark);
}

function toggleThemeFromSettings(btn) {
  btn.classList.toggle('on');
  const isDark = btn.classList.contains('on');
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('ic3_theme', isDark ? 'dark' : 'light');
}

// Restore theme
(function() {
  const saved = localStorage.getItem('ic3_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    const sd = document.getElementById('settingsDark');
    if (sd && saved === 'dark') sd.classList.add('on');
  }
})();

/* ========================================
   MOBILE SIDEBAR
   ======================================== */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

/* ========================================
   EXPORT REPORT — xuất CSV từ dữ liệu Firestore thật (đã áp bộ lọc hiện tại)
   ======================================== */
function exportReport() {
  const rows = _reportFiltered;
  if (!rows || rows.length === 0) { alert('Chưa có dữ liệu để xuất (theo bộ lọc hiện tại)!'); return; }
  const csv = ['Học sinh,Lớp,Trường,Bộ đề,Thời gian nộp,Điểm (%),Đúng/Tổng,Trạng thái',
    ...rows.map(r => {
      const dateStr = new Date(r.submittedAtMs).toLocaleString('vi-VN');
      const status = r.integrityOk !== false ? 'Hợp lệ' : 'Nghi vấn: ' + (r.flags || []).join('; ');
      return `"${r.studentName || ''}","${r.studentClass || ''}","${r.studentSchool || ''}","${r.testName || ''}","${dateStr}","${r.score ?? ''}","${r.correct ?? ''}/${r.total ?? ''}","${status}"`;
    })
  ].join('\n');
  const blob = new Blob(['\ufeff' + csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IC3_BaoCao_' + new Date().toLocaleDateString('vi-VN').replace(/\//g,'_') + '.csv';
  a.click();
  showToast('📥 Đã xuất báo cáo CSV!');
}

function clearAllData() {
  if (!confirm('Xoá TOÀN BỘ dữ liệu phiên? Hành động này không thể hoàn tác!')) return;
  localStorage.removeItem('ic3_sessions');
  localStorage.removeItem('ic3_custom_sets');
  allSets = loadSets();
  renderCards();
  updateReportTab();
  showToast('🗑️ Đã xoá toàn bộ dữ liệu!');
}

/* ========================================
   INIT
   ======================================== */
renderCards();
// Báo cáo (Firestore) chỉ được tải khi vào tab "Báo cáo kết quả" (xem
// listener .nav-item ở trên) — vừa tránh gọi Firestore trước khi đăng
// nhập hoàn tất, vừa đỡ tốn quota khi người dùng không xem tab này.
