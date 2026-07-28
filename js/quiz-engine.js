/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         EDUQUIZ IC3 — QUIZ ENGINE UPGRADE MODULE               ║
 * ║  Vanilla JS · Tương thích với cấu trúc index.html hiện có      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * HƯỚNG DẪN TÍCH HỢP:
 * 1. Xóa khối <script> hiện tại trong index.html
 * 2. Thay bằng: <script src="quiz-engine-upgrade.js"></script>
 *    HOẶC: Copy toàn bộ nội dung file này vào trong thẻ <script> của index.html
 *
 * CÁC CẢI TIẾN SO VỚI VERSION CŨ:
 * ─────────────────────────────────────────────────────────────────
 * ✅ Task 1: fetch() quiz_data.json → window.quizRepository (toàn cục)
 * ✅ Task 2: Render danh mục + cấp độ + minitest từ JSON
 * ✅ Task 3: Xử lý đầy đủ 4 loại câu hỏi (single/multi/truefalse/matching)
 *           - Hiển thị image_file từ thư mục img/
 *           - Nút CÓ/KHÔNG hoặc ĐÚNG/SAI động theo label_true/label_false
 *           - Multi: kiểm tra đúng theo mảng correct (thứ tự không quan trọng)
 * ✅ Task 4: Giữ nguyên anti-cheat (tabSwitch, clicks, qTime)
 *           Chấm điểm chính xác theo cấu trúc JSON
 * ✅ BONUS:  window.quizRepository — truy xuất toàn cục từ console/devtools
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/* ============================================================
   § 0 — GLOBAL QUIZ REPOSITORY (Task 1)
   Sau khi fetch, dữ liệu có thể truy xuất qua window.quizRepository
   ============================================================ */
window.quizRepository = null;

/* ============================================================
   § 0b — LAZY DATA LOADING (data/ic3/meta.json + data/ic3/<file>.json)
   ────────────────────────────────────────────────────────────
   Thay vì tải toàn bộ quiz_data.json (~1MB) ngay khi mở trang, ta:
     1. Tải data/ic3/meta.json (vài KB) → đủ để đổ 3 dropdown lobby
        và hiển thị số câu/loại câu hỏi (không cần câu hỏi thật).
     2. Chỉ khi học sinh bấm "Bắt đầu thi", mới tải file câu hỏi đầy
        đủ của ĐÚNG khối đang chọn (data/ic3/<cat>__<level>.json).
     3. Cache lại theo levelKey để đổi qua đổi lại minitest cùng khối
        không phải tải lại.
   Nếu vì lý do nào đó không tìm thấy meta.json (vd. dự án cũ chưa
   chạy scripts/split-quiz-data.py), tự động rơi về cách cũ: tải
   nguyên quiz_data.json — đảm bảo không phá vỡ trang đang chạy.
   ============================================================ */
const _levelCache   = new Map(); // "CAT__LV" → { minitests: {...} }   (bộ nhớ RAM, mất khi reload)
const _levelPending  = new Map(); // "CAT__LV" → Promise                (chống fetch trùng khi bấm nhanh)
const LS_PREFIX      = 'eduquiz_lv_'; // tiền tố key trong localStorage (cache bền, còn sau khi reload)

function _levelKey(catId, levelId) {
  return `${catId}__${levelId}`;
}

/**
 * Đọc cache bền (localStorage), có kiểm tra "version" từ meta.json.
 * Khi nội dung đề thi cập nhật, chỉ cần đổi State.quizData.version
 * (field mới trong meta.json) là toàn bộ cache cũ tự động hết hạn —
 * không cần học sinh phải xoá cache tay hay Ctrl+F5.
 */
function _readPersistentCache(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const currentVersion = State.quizData?.version || 'v1';
    if (parsed.v !== currentVersion) return null; // dữ liệu cũ → bỏ qua
    return parsed.data;
  } catch {
    return null; // localStorage bị chặn (private mode…) → im lặng bỏ qua, không phá trang
  }
}

function _writePersistentCache(key, data) {
  try {
    const currentVersion = State.quizData?.version || 'v1';
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ v: currentVersion, data }));
  } catch {
    // Hết dung lượng hoặc bị chặn → bỏ qua, cache RAM (_levelCache) vẫn hoạt động bình thường
  }
}

/**
 * Tải đầy đủ câu hỏi của 1 level, trả về { minitests }.
 * Thứ tự ưu tiên (mỗi bước chỉ tải đúng 1 lần, không tải thừa):
 *   1. _levelCache      — đã có sẵn trong RAM của lần thi trước đó cùng phiên
 *   2. localStorage      — đã tải ở lần ghé trang trước (còn hợp lệ theo version)
 *   3. fetch data/ic3/<file>.json — file gọn theo từng khối (lazy-load thật sự)
 *   4. quizFullData / quiz_data.json — chỉ dùng khi dự án chưa split dữ liệu
 * _levelPending đảm bảo nếu học sinh đổi qua đổi lại dropdown thật nhanh,
 * cùng 1 khối không bị gọi fetch() song song nhiều lần.
 */
async function _fetchLevelData(catId, levelId) {
  const key = _levelKey(catId, levelId);
  if (_levelCache.has(key)) return _levelCache.get(key);
  if (_levelPending.has(key)) return _levelPending.get(key); // đang tải rồi → chờ chung 1 promise

  const promise = (async () => {
    // ── Bước 2: cache bền trong localStorage (khỏi tải lại qua session) ──
    const cached = _readPersistentCache(key);
    if (cached) return cached;

    // ── Bước 3: lazy-load file gọn theo khối (dự án đã chạy split-quiz-data.py) ──
    const metaLevel = _findMetaLevel(catId, levelId);
    if (metaLevel?.file) {
      try {
        const res = await fetch(`data/ic3/${metaLevel.file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const full = await res.json();
        _writePersistentCache(key, full);
        return full;
      } catch (err) {
        console.warn(`[EduQuiz] Không tải được data/ic3/${metaLevel.file}, thử fallback quiz_data.json`, err.message);
      }
    }

    // ── Bước 4a: đã có sẵn toàn bộ dữ liệu trong quizFullData ───────
    if (window.quizFullData) {
      const cat = window.quizFullData.categories?.find(c => c.id === catId);
      const lv  = cat?.levels?.find(l => l.id === levelId);
      if (lv) return lv;
    }

    // ── Bước 4b: tải nguyên quiz_data.json 1 lần rồi tự cache ──
    if (!window.quizFullData) {
      try {
        const res = await fetch('quiz_data.json');
        if (res.ok) window.quizFullData = await res.json();
      } catch (err) {
        console.warn('[EduQuiz] Không tải được quiz_data.json (fallback cuối):', err.message);
      }
    }
    const cat = window.quizFullData?.categories?.find(c => c.id === catId);
    const lv  = cat?.levels?.find(l => l.id === levelId);
    return lv || { minitests: {} };
  })();

  _levelPending.set(key, promise);
  const result = await promise;
  _levelCache.set(key, result);
  _levelPending.delete(key);
  return result;
}

/**
 * Tải trước (prefetch) dữ liệu của 1 khối ngay khi học sinh vừa chọn xong
 * category/level trong lobby — tận dụng thời gian họ gõ tên/lớp/trường để
 * tải ngầm, giúp lúc bấm "Bắt đầu thi" gần như tức thì (0 chờ đợi).
 * Không throw lỗi ra ngoài vì đây chỉ là tối ưu UX, không phải luồng chính.
 */
function _prefetchLevelData(catId, levelId) {
  if (!catId || !levelId) return;
  _fetchLevelData(catId, levelId).catch(() => {});
}

function _findMetaLevel(catId, levelId) {
  const cat = State.quizData?.categories?.find(c => c.id === catId);
  return cat?.levels?.find(l => l.id === levelId);
}

/**
 * State.quizData.minitests[name] có thể là:
 *  - mảng câu hỏi đầy đủ  → [{ type, question, ... }, ...]   (chế độ fallback/quiz_data.json)
 *  - object thống kê gọn  → { count: 45, types: { single: 11, ... } } (chế độ meta.json lazy-load)
 * 2 hàm dưới giúp phần render lobby dùng chung 1 code cho cả 2 dạng.
 */
function _mtCount(mt) {
  if (!mt) return 0;
  return Array.isArray(mt) ? mt.length : (mt.count || 0);
}
function _mtTypeCounts(mt) {
  if (!mt) return {};
  if (Array.isArray(mt)) {
    const counts = {};
    mt.forEach(q => { counts[q.type] = (counts[q.type] || 0) + 1; });
    return counts;
  }
  return mt.types || {};
}

/* ============================================================
   § 1 — STATE
   Giữ nguyên cấu trúc State để không phá vỡ anti-cheat
   ============================================================ */
const State = {
  quizData:  null,   // alias → window.quizRepository
  questions: [],
  answers:   {},     // qi → value (string | string[] | {j: 'true'|'false'})
  flags:     new Set(),
  current:   0,
  timer:     null,
  timeLeft:  1200,
  matching:  {},     // qi → { left: right }
  matchSel:  {},
  hotspot:   {},     // qi → Set<areaId> đã bấm chọn
  session:   {}
};

/* ============================================================
   § 2 — ANTI-CHEAT: VISIBILITY & CLICK TRACKING  (Task 4)
   Giữ nguyên 100% logic chống gian lận
   ============================================================ */
document.addEventListener('visibilitychange', () => {
  if (!State.session.startTime) return;
  if (document.hidden) {
    State.session.tabSwitches++;
    flushQTime(State.current);
  } else {
    State.session.qStart[State.current] = Date.now();
  }
});

window.addEventListener('blur', () => {
  if (State.session.startTime) flushQTime(State.current);
});

function flushQTime(qi) {
  const t = State.session.qStart?.[qi];
  if (!t) return;
  State.session.qTimes[qi] = (State.session.qTimes[qi] || 0) + Math.round((Date.now() - t) / 1000);
  delete State.session.qStart[qi];
}

function beginQTime(qi) {
  flushQTime(State.current);
  State.session.qStart[qi] = Date.now();
}

/* ============================================================
   § 3 — LOAD DATA  (Task 1 — Fetch + window.quizRepository)
   ============================================================ */

/**
 * Nạp dữ liệu từ quiz_data.json vào window.quizRepository và State.quizData.
 * Nếu fetch thất bại → dùng DEMO_DATA dự phòng.
 */
async function loadData() {
  // Hiển thị trạng thái loading (nếu cần)
  _setLoadingState(true);

  try {
    // ── Ưu tiên: meta.json nhẹ (vài KB) để dựng lobby ─────────
    const res = await fetch('data/ic3/meta.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json();

    window.quizRepository = meta;
    State.quizData = meta;

    console.info(
      `%c[EduQuiz] ✅ meta.json nạp thành công (lazy-load câu hỏi theo khối)!`,
      'color:#00c9a0;font-weight:700'
    );
    _logRepositorySummary(meta);

  } catch (err) {
    // ── Fallback 1: dự án chưa chạy scripts/split-quiz-data.py
    //    → quay lại tải nguyên quiz_data.json như bản cũ ────────
    console.warn('[EduQuiz] ⚠ Không tải được data/ic3/meta.json, thử quiz_data.json...', err.message);
    try {
      const res2 = await fetch('quiz_data.json');
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      const data = await res2.json();
      window.quizFullData = data; // dùng làm nguồn cho _fetchLevelData()
      window.quizRepository = data;
      State.quizData = data;
      _logRepositorySummary(data);
    } catch (err2) {
      // ── Fallback 2: dùng dữ liệu demo để trang không trắng ────
      console.warn('[EduQuiz] ⚠ Không tải được quiz_data.json. Dùng DEMO_DATA.', err2.message);
      window.quizRepository = DEMO_DATA;
      State.quizData = DEMO_DATA;
    }
  }

  _setLoadingState(false);
  initLobby();
}

/** In tóm tắt cấu trúc dữ liệu ra console để debug dễ hơn */
function _logRepositorySummary(data) {
  let totalQ = 0;
  data.categories?.forEach(cat => {
    cat.levels?.forEach(lv => {
      Object.values(lv.minitests || {}).forEach(mt => { totalQ += _mtCount(mt); });
    });
  });
  const categories = data.categories?.map(c => c.name).join(', ');
  console.info(
    `%c[EduQuiz] 📦 ${data.categories?.length} danh mục · ${totalQ} câu hỏi\n` +
    `  Danh mục: ${categories}\n` +
    `  Truy xuất tại: window.quizRepository`,
    'color:#6c63ff'
  );
}

function _setLoadingState(isLoading) {
  const btn = document.getElementById('btnStart');
  if (!btn) return;
  if (isLoading) {
    btn.textContent = '⏳ Đang tải dữ liệu...';
    btn.disabled = true;
  }
  // Trạng thái enabled/disabled sau load sẽ do refreshMeta() quyết định
}

/* ============================================================
   § 4 — LOBBY: RENDER MENU  (Task 2)
   Tự động sinh danh sách Category → Level → Minitest từ JSON
   ============================================================ */

function initLobby() {
  const catSel = document.getElementById('categorySelect');
  const lvlSel = document.getElementById('levelSelect');
  const mtSel  = document.getElementById('minitestSelect');

  // ── Đổ danh mục (categories) ───────────────────────────────
  catSel.innerHTML = '';
  (State.quizData?.categories || []).forEach(cat => {
    const opt = new Option(cat.name, cat.id);
    // Màu theo category nếu có
    if (cat.color) opt.style.color = cat.color;
    catSel.appendChild(opt);
  });

  // ── Hàm cập nhật Level khi đổi Category ───────────────────
  const refreshLevels = () => {
    const cat = _findCategory(catSel.value);
    lvlSel.innerHTML = '';
    (cat?.levels || []).forEach(lv => {
      lvlSel.appendChild(new Option(lv.name, lv.id));
    });
    refreshMinitests();
    _prefetchLevelData(catSel.value, lvlSel.value); // tải ngầm trước khi bấm "Bắt đầu thi"
  };

  // ── Hàm cập nhật Minitest khi đổi Level ───────────────────
  const refreshMinitests = () => {
    const cat = _findCategory(catSel.value);
    const lv  = cat?.levels?.find(l => l.id === lvlSel.value);
    mtSel.innerHTML = '';

    const minitests = lv?.minitests || {};
    Object.keys(minitests).forEach(name => {
      const mt  = minitests[name];
      const opt = new Option(
        `${name} (${_mtCount(mt)} câu)`,
        name
      );
      mtSel.appendChild(opt);
    });

    refreshMeta();
  };

  // ── Cập nhật chip thống kê + nút Bắt đầu ──────────────────
  const refreshMeta = () => {
    const cat = _findCategory(catSel.value);
    const lv  = cat?.levels?.find(l => l.id === lvlSel.value);
    const mt  = lv?.minitests?.[mtSel.value];
    const count = _mtCount(mt);
    const el  = document.getElementById('minitestMeta');

    if (count) {
      const typeCounts = _mtTypeCounts(mt);
      const typeLabels = {
        single:    'Trắc nghiệm',
        multi:     'Nhiều đáp án',
        truefalse: 'Đúng/Sai',
        matching:  'Nối cột',
        hotspot:   'Bấm vào hình',
      };
      const breakdown = Object.entries(typeCounts)
        .map(([t, n]) => `${n} ${typeLabels[t] || t}`)
        .join(' · ');

      el.innerHTML = `
        <span class="chip green">📝 ${count} câu</span>
        <span class="meta-breakdown">${breakdown}</span>
      `;
    } else {
      el.innerHTML = '<span class="chip" style="color:var(--red)">⚠ Không có câu hỏi</span>';
    }

    // Kích hoạt nút Bắt đầu chỉ khi đủ thông tin
    const name   = document.getElementById('studentName')?.value.trim();
    const cls    = document.getElementById('studentClass')?.value.trim();
    const school = document.getElementById('studentSchool')?.value.trim();
    const btn    = document.getElementById('btnStart');
    if (btn) {
      btn.disabled = !(count && name && cls && school);
      btn.textContent = btn.disabled ? '▶ Bắt đầu thi' : '▶ Bắt đầu thi';
    }
  };

  // ── Gắn sự kiện ───────────────────────────────────────────
  catSel.addEventListener('change', refreshLevels);
  lvlSel.addEventListener('change', refreshMinitests);
  mtSel .addEventListener('change', refreshMeta);
  ['studentName', 'studentClass', 'studentSchool'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', refreshMeta);
  });

  // Khởi tạo lần đầu
  refreshLevels();
}

/** Tìm category theo id từ quizRepository */
function _findCategory(catId) {
  return State.quizData?.categories?.find(c => c.id === catId);
}

/* ============================================================
   § 5 — START EXAM  (Task 3 — nạp đúng minitest từ JSON)
   ============================================================ */

async function startExam() {
  const name   = document.getElementById('studentName')?.value.trim();
  const cls    = document.getElementById('studentClass')?.value.trim();
  const school = document.getElementById('studentSchool')?.value.trim();
  const catId  = document.getElementById('categorySelect')?.value;
  const lvlId  = document.getElementById('levelSelect')?.value;
  const mtName = document.getElementById('minitestSelect')?.value;

  if (!name || !cls || !school) {
    alert('⚠ Vui lòng điền đầy đủ thông tin học sinh!');
    return;
  }

  const cat = _findCategory(catId);
  const lv  = cat?.levels?.find(l => l.id === lvlId);

  // ── Tải câu hỏi đầy đủ của ĐÚNG khối này (lazy-load) ──────
  const btn = document.getElementById('btnStart');
  const btnPrevText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tải câu hỏi...'; }

  const fullLevel = await _fetchLevelData(catId, lvlId);
  const rawQs = fullLevel?.minitests?.[mtName];

  if (btn) { btn.disabled = false; btn.textContent = btnPrevText; }

  if (!rawQs || rawQs.length === 0) {
    alert('⚠ Không tìm thấy câu hỏi cho bài này. Vui lòng kiểm tra dữ liệu trong data/ic3/.');
    return;
  }

  // ── Deep clone + chuẩn bị (shuffle order & options) ───────
  State.questions = prepareQuestions(rawQs);
  State.answers   = {};
  State.flags     = new Set();
  State.current   = 0;
  State.matching  = {};
  State.matchSel  = {};
  State.hotspot   = {};
  State.timeLeft  = parseInt(document.getElementById('timeSelect')?.value || '1200', 10);

  // ── Khởi tạo session (dữ liệu anti-cheat) ─────────────────
  State.session = {
    studentName:   name,
    studentClass:  cls,
    studentSchool: school,
    category:      cat?.name  || catId,
    level:         lv?.name   || lvlId,
    minitest:      mtName,
    startTime:     Date.now(),
    totalTime:     State.timeLeft,
    tabSwitches:   0,
    clicks:        0,
    qTimes:        {},
    qStart:        { 0: Date.now() },
    timedOut:      false,
  };

  // ── Chuyển màn hình ────────────────────────────────────────
  document.getElementById('lobby').style.display  = 'none';
  document.getElementById('exam').style.display   = 'flex';
  document.getElementById('result').style.display = 'none';
  document.getElementById('adminEntryLink')?.style.setProperty('display', 'none');

  const info = document.getElementById('topbarInfo');
  if (info) info.textContent = `👤 ${name} · ${cls} · ${mtName}`;

  buildSidebar();
  renderQuestion(0);
  startTimer();
}

/* ============================================================
   § 6 — PREPARE QUESTIONS
   Shuffle thứ tự câu hỏi và options, giữ nguyên correct[]
   ============================================================ */

function prepareQuestions(rawQs) {
  const qs = shuffle(JSON.parse(JSON.stringify(rawQs)));

  qs.forEach(q => {
    // Xử lý imageUrl từ image_file nếu chưa có
    if (!q.imageUrl && q.image_file) {
      q.imageUrl = `img/${q.image_file}`;
    }

    // Shuffle options cho single và multi
    if ((q.type === 'single' || q.type === 'multi') && Array.isArray(q.options)) {
      q.options = shuffle(q.options);
      // correct[] tham chiếu theo nội dung text → vẫn đúng sau shuffle
    }

    // Shuffle statements cho truefalse
    if (q.type === 'truefalse' && Array.isArray(q.statements)) {
      q.statements = shuffle(q.statements);
    }

    // Chuẩn bị cột nối cho matching
    if (q.type === 'matching' && Array.isArray(q.pairs) && q.pairs.length > 0) {
      q._leftShuffled  = shuffle(q.pairs.map(p => p.left));
      q._rightShuffled = shuffle([...new Set(q.pairs.map(p => p.right))]);
    }
  });

  return qs;
}

/* ============================================================
   § 7 — TIMER
   ============================================================ */

function startTimer() {
  clearInterval(State.timer);
  updateTimerDisplay();
  State.timer = setInterval(() => {
    State.timeLeft--;
    updateTimerDisplay();
    if (State.timeLeft <= 0) { clearInterval(State.timer); autoSubmit(); }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timer-display');
  if (!el) return;
  const m = Math.floor(State.timeLeft / 60);
  const s = State.timeLeft % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.className = State.timeLeft <= 60 ? 'danger' : State.timeLeft <= 180 ? 'warning' : '';
}

/* ============================================================
   § 8 — SIDEBAR
   ============================================================ */

function buildSidebar() {
  const grid = document.getElementById('qGrid');
  if (!grid) return;
  grid.innerHTML = '';
  State.questions.forEach((_, i) => {
    const b = document.createElement('button');
    b.className   = 'q-btn';
    b.id          = `qbtn-${i}`;
    b.textContent = i + 1;
    b.onclick     = () => jumpTo(i);
    grid.appendChild(b);
  });
}

function updateSidebar() {
  State.questions.forEach((_, i) => {
    const b = document.getElementById(`qbtn-${i}`);
    if (!b) return;
    let cls = 'q-btn';
    if (i === State.current) cls += ' active';
    if (isAnswered(i))       cls += ' answered';
    if (State.flags.has(i))  cls += ' flagged';
    b.className = cls;
  });
  const done = State.questions.filter((_, i) => isAnswered(i)).length;
  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = `${(done / State.questions.length) * 100}%`;
}

/**
 * Kiểm tra xem câu qi đã được trả lời chưa (đủ điều kiện cho thanh tiến độ)
 */
function isAnswered(i) {
  const q = State.questions[i];
  if (!q) return false;

  switch (q.type) {
    case 'matching':
      if (!q.pairs || q.pairs.length === 0) return false;
      return Object.keys(State.matching[i] || {}).length > 0;

    case 'hotspot':
      return (State.hotspot[i]?.size || 0) > 0;

    case 'truefalse':
      // Phải trả lời ĐỦ tất cả statements
      return Object.keys(State.answers[i] || {}).length === (q.statements?.length || 0);

    default: {
      const a = State.answers[i];
      return a !== undefined && a !== null && (Array.isArray(a) ? a.length > 0 : true);
    }
  }
}

/* ============================================================
   § 9 — NAVIGATION
   ============================================================ */

function jumpTo(i) {
  beginQTime(i);
  State.current = i;
  renderQuestion(i);
}

function prevQ() { if (State.current > 0) jumpTo(State.current - 1); }
function nextQ() { if (State.current < State.questions.length - 1) jumpTo(State.current + 1); }

/* ============================================================
   § 10 — RENDER QUESTION  (Task 3 — xử lý linh hoạt theo type)
   ============================================================ */

/**
 * Hàm chính render câu hỏi — phân phối xuống render con theo type.
 * Xử lý:
 *   - Hiển thị imageUrl / image_file (img/) nếu có
 *   - Điều phối renderSingle / renderMulti / renderTrueFalse / renderMatching
 */
function renderQuestion(idx) {
  State.current = idx;
  const q = State.questions[idx];
  if (!q) return;

  const panel = document.getElementById('qPanel');
  if (!panel) return;

  const TYPE_META = {
    single:    { icon: '◎', label: 'Một lựa chọn' },
    multi:     { icon: '☑', label: 'Nhiều lựa chọn' },
    truefalse: { icon: '⇄', label: 'Đúng / Sai' },
    matching:  { icon: '↔', label: 'Nối cột' },
    hotspot:   { icon: '🎯', label: 'Bấm vào hình' },
  };
  const { icon, label } = TYPE_META[q.type] || { icon: '?', label: q.type };

  // Nav buttons
  const navPrev = `<button class="btn-nav" onclick="prevQ()" ${idx === 0 ? 'disabled' : ''}>← Câu trước</button>`;
  const navNext = idx < State.questions.length - 1
    ? `<button class="btn-nav btn-next-primary" onclick="nextQ()">Câu tiếp →</button>`
    : `<button class="btn-nav" style="background:rgba(6,214,160,.15);border-color:var(--accent5);color:var(--accent5);" onclick="confirmSubmit()">Nộp bài ✓</button>`;
  const navFlag = `<button class="btn-nav btn-flag ${State.flags.has(idx) ? 'flagged' : ''}" onclick="toggleFlag(${idx})">
    ${State.flags.has(idx) ? '⚑ Bỏ đánh dấu' : '⚐ Đánh dấu'}
  </button>`;

  // Hình ảnh — ưu tiên imageUrl (từ image_file), sau đó SVG minh họa
  // (câu hotspot tự vẽ ảnh + vùng bấm bên trong renderHotspot() → không dùng block chung)
  const imgBlock = q.type === 'hotspot' ? '' : _buildImageBlock(q);

  panel.innerHTML = `
    <div class="q-card">
      <div class="q-header">
        <div class="q-badge">${idx + 1}</div>
        <div class="q-meta">
          <div class="q-type-badge">${icon} ${label}</div>
          <div class="q-text">${q.question}</div>
        </div>
      </div>
      ${imgBlock}
      <div id="q-body"></div>
    </div>
    <div class="q-nav">${navPrev}${navNext}${navFlag}</div>`;

  // Gọi render theo type
  const renderers = {
    single:    renderSingle,
    multi:     renderMulti,
    truefalse: renderTrueFalse,
    matching:  renderMatching,
    hotspot:   renderHotspot,
  };
  (renderers[q.type] || (() => {}))(q, idx);

  updateSidebar();
  panel.scrollTop = 0;
}

/**
 * Xây dựng khối hình ảnh cho câu hỏi.
 * Task 3: ưu tiên img/ từ image_file, sau đó SVG tự động.
 */
function _buildImageBlock(q) {
  // Ưu tiên 1: imageUrl đã set sẵn trong JSON (ví dụ: "img/Picture56.png")
  if (q.imageUrl) {
    return `
      <div class="img-illus-custom" style="margin:.5rem 0 1rem;text-align:center;">
        <img src="${q.imageUrl}"
             alt="Hình minh họa câu hỏi ${q.id || ''}"
             loading="lazy"
             style="max-width:100%;max-height:320px;border-radius:12px;
                    border:2px solid var(--border);box-shadow:var(--shadow);"
             onerror="this.parentElement.style.display='none'"/>
      </div>`;
  }

  // Ưu tiên 2: image_file có nhưng chưa có imageUrl
  if (q.image_file) {
    const url = `img/${q.image_file}`;
    return `
      <div class="img-illus-custom" style="margin:.5rem 0 1rem;text-align:center;">
        <img src="${url}"
             alt="Hình minh họa"
             loading="lazy"
             style="max-width:100%;max-height:320px;border-radius:12px;
                    border:2px solid var(--border);box-shadow:var(--shadow);"
             onerror="this.parentElement.style.display='none'"/>
      </div>`;
  }

  // Ưu tiên 3: SVG minh họa tự động (gọi getImageIllustration nếu tồn tại)
  if (q.image) {
    if (typeof getImageIllustration === 'function') {
      return getImageIllustration(q);
    }
  }

  return '';
}

/* ============================================================
   § 11 — RENDER SINGLE  (type = "single")
   Chỉ cho chọn 1 đáp án, so khớp với correct[0]
   ============================================================ */

function _hasImage(q) {
  return !!(q?.imageUrl || q?.image_file);
}

function renderSingle(q, qi) {
  const current = State.answers[qi];
  const ALPHA   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const noMarker = _hasImage(q); // câu có ảnh minh hoạ → ẩn nhãn A/B/C/D, chỉ còn nội dung để click

  document.getElementById('q-body').innerHTML = `
    <div class="options-list">
      ${(q.options || []).map((opt, j) => `
        <button class="option-btn ${noMarker ? 'no-marker' : ''} ${current === opt ? 'selected' : ''}"
                data-qi="${qi}"
                data-val="${encodeURIComponent(opt)}"
                onclick="selectSingle(this)">
          ${noMarker ? '' : `<div class="option-marker">${ALPHA[j] ?? (j + 1)}</div>`}
          <span>${opt}</span>
        </button>`).join('')}
    </div>`;
}

function selectSingle(el) {
  const qi  = parseInt(el.dataset.qi);
  const val = decodeURIComponent(el.dataset.val);
  State.answers[qi] = val;
  State.session.clicks++;
  document.querySelectorAll('#q-body .option-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  animatePick(el);
  updateSidebar();
}

/* ============================================================
   § 12 — RENDER MULTI  (type = "multi")
   Cho chọn nhiều đáp án — so khớp toàn bộ mảng correct[]
   ============================================================ */

function renderMulti(q, qi) {
  const current = State.answers[qi] || [];
  const ALPHA   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const COLORS  = ['c0','c1','c2','c3','c4','c5'];
  const noMarker = _hasImage(q);

  // Gợi ý số lượng cần chọn
  const hint = q.correct?.length
    ? `Hãy chọn đúng <strong>${q.correct.length}</strong> đáp án`
    : 'Chọn tất cả đáp án đúng';

  document.getElementById('q-body').innerHTML = `
    <div class="multi-hint" style="
        background:var(--purple-lt);border:1.5px solid rgba(79,107,255,.25);
        border-radius:10px;padding:.55rem 1rem;margin-bottom:.8rem;
        font-size:.85rem;font-weight:700;color:var(--purple);">
      ☑ ${hint}
      <span style="color:var(--muted);font-weight:600;margin-left:.5rem;">
        (Đã chọn: <span id="multi-count-${qi}">${current.length}</span>/${q.correct?.length || '?'})
      </span>
    </div>
    <div class="options-list">
      ${(q.options || []).map((opt, j) => {
        const cc  = COLORS[j % COLORS.length];
        const sel = current.includes(opt) ? `selected ${cc}` : '';
        return `<button class="option-btn multi-style ${noMarker ? 'no-marker' : ''} ${sel}"
                        data-qi="${qi}"
                        data-val="${encodeURIComponent(opt)}"
                        data-cc="${cc}"
                        onclick="selectMulti(this)">
          ${noMarker ? '' : `<div class="option-marker">${ALPHA[j] ?? (j + 1)}</div>`}
          <span>${opt}</span>
        </button>`;
      }).join('')}
    </div>`;
}

function selectMulti(el) {
  const qi  = parseInt(el.dataset.qi);
  const val = decodeURIComponent(el.dataset.val);
  const cc  = el.dataset.cc;

  if (!State.answers[qi]) State.answers[qi] = [];
  const arr = State.answers[qi];
  const idx = arr.indexOf(val);

  if (idx >= 0) {
    arr.splice(idx, 1);
    el.classList.remove('selected', 'c0','c1','c2','c3','c4','c5');
  } else {
    arr.push(val);
    el.classList.add('selected', cc);
    animatePick(el);
  }

  State.session.clicks++;

  // Cập nhật bộ đếm đã chọn
  const counter = document.getElementById(`multi-count-${qi}`);
  if (counter) counter.textContent = arr.length;

  updateSidebar();
}

/* ============================================================
   § 13 — RENDER TRUEFALSE  (type = "truefalse")
   Hiển thị bảng statements — nút label_true / label_false động
   ============================================================ */

function renderTrueFalse(q, qi) {
  const current = State.answers[qi] || {};

  // Label động: lấy từ JSON, mặc định ĐÚNG/SAI
  const lT = q.label_true  || 'ĐÚNG';
  const lF = q.label_false || 'SAI';

  let stmts = q.statements || [];

  // Fallback: nếu statements rỗng hoặc placeholder, parse từ question text
  const PLACEHOLDER_RE = /có \/ không cho từng|đúng \/ sai cho từng|đúng\/sai cho từng/i;
  if (stmts.length === 1 && PLACEHOLDER_RE.test(stmts[0]?.text || '')) {
    const lines = q.question.split(/\n/).map(l => l.trim()).filter(l => /^[-•\d]/.test(l));
    if (lines.length > 0) {
      stmts = lines.map(l => ({
        text:   l.replace(/^[-•\d]+[.)\s]*/, '').trim(),
        answer: stmts[0].answer || 'true'
      }));
    }
  }

  // Đếm đã trả lời bao nhiêu / tổng
  const answeredCount = Object.keys(current).length;

  document.getElementById('q-body').innerHTML = `
    <div style="font-size:.82rem;font-weight:700;color:var(--muted);margin-bottom:.75rem;">
      📋 Trả lời từng câu (${answeredCount}/${stmts.length} đã chọn)
    </div>
    <table class="tf-table" style="width:100%;border-collapse:separate;border-spacing:0 .4rem;">
      <thead>
        <tr>
          <th style="text-align:left;padding:.4rem .6rem;color:var(--muted);font-size:.8rem;">
            Phát biểu
          </th>
          <th style="width:80px;text-align:center;color:var(--teal);font-size:.8rem;">${lT}</th>
          <th style="width:80px;text-align:center;color:var(--red);font-size:.8rem;">${lF}</th>
        </tr>
      </thead>
      <tbody>
        ${stmts.map((st, j) => `
          <tr class="tf-row" id="tf-row-${qi}-${j}"
              style="background:${
                current[j] === 'true'  ? 'rgba(0,201,160,.08)' :
                current[j] === 'false' ? 'rgba(255,82,82,.06)' :
                'var(--card2)'
              };border-radius:10px;transition:background .2s;">
            <td style="padding:.55rem .75rem;border-radius:10px 0 0 10px;font-size:.9rem;">
              <span style="font-weight:700;color:var(--muted);margin-right:.4rem;">${j + 1}.</span>
              ${st.text}
            </td>
            <td class="tf-btn-cell" style="text-align:center;border-radius:0;">
              <button class="tf-btn ${current[j] === 'true' ? 'selected-true' : ''}"
                      data-qi="${qi}" data-j="${j}" data-v="true"
                      onclick="selectTF(this)"
                      style="min-width:60px;">${lT}</button>
            </td>
            <td class="tf-btn-cell" style="text-align:center;border-radius:0 10px 10px 0;">
              <button class="tf-btn ${current[j] === 'false' ? 'selected-false' : ''}"
                      data-qi="${qi}" data-j="${j}" data-v="false"
                      onclick="selectTF(this)"
                      style="min-width:60px;">${lF}</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function selectTF(el) {
  const qi = parseInt(el.dataset.qi);
  const j  = parseInt(el.dataset.j);
  const v  = el.dataset.v;

  if (!State.answers[qi]) State.answers[qi] = {};
  State.answers[qi][j] = v;
  State.session.clicks++;

  // Cập nhật UI row
  const row = el.closest('tr');
  if (row) {
    row.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected-true','selected-false'));
    el.classList.add(v === 'true' ? 'selected-true' : 'selected-false');
    row.style.background = v === 'true'
      ? 'rgba(0,201,160,.08)'
      : 'rgba(255,82,82,.06)';
  }

  updateSidebar();
}

/* ============================================================
   § 14 — RENDER MATCHING  (type = "matching")
   Drag & drop (desktop) + tap-to-place (mobile)
   Pool chip hỗ trợ nhiều right value giống nhau (ví dụ Google×2)
   ============================================================ */

function renderMatching(q, qi) {
  const body = document.getElementById('q-body');
  if (!body) return;

  if (!q.pairs || q.pairs.length === 0) {
    body.innerHTML = `<div class="q-img-notice">🖼️ Câu nối cột này dùng hình ảnh — vui lòng xem đề thi in.</div>`;
    return;
  }

  if (!State.matching[qi]) State.matching[qi] = {};
  const matched = State.matching[qi];

  const leftItems = q._leftShuffled || q.pairs.map(p => p.left);

  // Đếm số lần mỗi right value CẦN dùng
  const rightCount = {};
  q.pairs.forEach(p => { rightCount[p.right] = (rightCount[p.right] || 0) + 1; });

  // Đếm số lần đã đặt
  const placedCount = {};
  Object.values(matched).forEach(r => { placedCount[r] = (placedCount[r] || 0) + 1; });

  const uniqueRights = q._rightShuffled || [...new Set(q.pairs.map(p => p.right))];

  // Tạo pool chips: mỗi right còn lại (chưa đặt)
  const poolChips = [];
  uniqueRights.forEach(r => {
    const remain = Math.max(0, (rightCount[r] || 0) - (placedCount[r] || 0));
    for (let i = 0; i < remain; i++) {
      poolChips.push({ r, id: `chip-${qi}-${encodeURIComponent(r)}-${i}` });
    }
  });

  const answeredPairs = Object.keys(matched).length;

  body.innerHTML = `
    <div class="match-hint" style="
        font-size:.82rem;font-weight:700;color:var(--muted);margin-bottom:.75rem;
        background:var(--yellow-lt);border:1.5px solid rgba(255,179,0,.25);
        border-radius:10px;padding:.5rem .9rem;">
      🖱️ Kéo thả hoặc <strong>nhấn chip → nhấn ô</strong> để nối cột
      <span style="margin-left:.75rem;color:var(--teal);">${answeredPairs}/${leftItems.length} đã nối</span>
    </div>

    <div style="font-size:.75rem;font-weight:800;color:var(--muted);text-transform:uppercase;
                letter-spacing:.6px;margin-bottom:.4rem;">
      📦 Đáp án — kéo/nhấn vào ô bên phải:
    </div>
    <div class="drag-pool" id="dragPool-${qi}">
      ${poolChips.length > 0
        ? poolChips.map(({ r, id }) => `
            <div class="drag-chip"
                 draggable="true"
                 data-right="${encodeURIComponent(r)}"
                 data-qi="${qi}"
                 id="${id}">⠿ ${r}</div>`).join('')
        : `<span style="color:var(--teal);font-size:.82rem;font-style:italic;padding:.25rem .5rem;">
             ✅ Đã điền hết — nhấn ✕ để thay đổi
           </span>`}
    </div>

    <div class="matching-container">
      <div class="matching-col">
        <div class="matching-col-title">Cột trái</div>
        ${_hasRegions(q)
          ? _buildRegionPicker(q, qi, matched)
          : leftItems.map(left => `
          <div class="match-left-item ${matched[left] ? 'matched' : ''}">
            <div class="match-dot"></div>
            <span>${left}</span>
          </div>`).join('')}
      </div>
      <div class="match-arrow">→</div>
      <div class="match-right-col">
        <div class="matching-col-title">Kéo đáp án vào đây</div>
        ${leftItems.map((left, idx) => `
          <div class="match-drop-slot ${matched[left] ? 'filled' : 'empty-hint'}"
               data-qi="${qi}"
               data-left="${encodeURIComponent(left)}"
               id="slot-${qi}-${idx}">
            <span class="slot-label">${left.length > 22 ? left.slice(0,22)+'…' : left} →</span>
            ${matched[left]
              ? `<span class="slot-content">${matched[left]}</span>
                 <button class="slot-remove"
                         data-qi="${qi}" data-left="${encodeURIComponent(left)}"
                         onclick="removeMatchDrop(this)">✕</button>`
              : ''}
          </div>`).join('')}
      </div>
    </div>`;

  // Gắn drag & drop events
  body.querySelectorAll('.drag-chip').forEach(chip => {
    chip.addEventListener('dragstart', onDragStart);
    chip.addEventListener('dragend',   onDragEnd);
    chip.addEventListener('click',     onChipTap);
  });
  body.querySelectorAll('.match-drop-slot').forEach(slot => {
    slot.addEventListener('dragover',  onDragOver);
    slot.addEventListener('dragleave', onDragLeave);
    slot.addEventListener('drop',      onDrop);
    slot.addEventListener('click',     onSlotTap);
  });
  body.querySelectorAll('.match-region-hotspot').forEach(hotspot => {
    hotspot.addEventListener('click',    onRegionTap);
    hotspot.addEventListener('dragover', onDragOver);
    hotspot.addEventListener('dragleave',onDragLeave);
    hotspot.addEventListener('drop',     onRegionDrop);
  });
}

/**
 * Câu nối cột có ảnh + toạ độ vùng bấm (q.regions) → cho phép học sinh
 * bấm trực tiếp lên đúng vị trí trên ảnh thay vì đọc danh sách chữ.
 * Định dạng: q.regions = [{ value, x, y, w, h }] — x/y/w/h là % so với
 * kích thước ảnh gốc (0-100), value phải khớp CHÍNH XÁC 1 chuỗi trong
 * q.pairs[].left. Item nào không có vùng tương ứng vẫn hiện ở dạng chữ
 * bên dưới ảnh để không mất đáp án.
 */
function _hasRegions(q) {
  return Array.isArray(q.regions) && q.regions.length > 0 && (q.imageUrl || q.image_file);
}

function _buildRegionPicker(q, qi, matched) {
  const src = q.imageUrl || `img/${q.image_file}`;
  const leftItems = q._leftShuffled || q.pairs.map(p => p.left);
  const regionValues = new Set(q.regions.map(r => r.value));
  const unmapped = leftItems.filter(l => !regionValues.has(l));

  const hotspots = q.regions.map((r, i) => {
    const isMatched = !!matched[r.value];
    return `<button type="button"
              class="match-region-hotspot ${isMatched ? 'matched' : ''}"
              style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;"
              data-qi="${qi}"
              data-left="${encodeURIComponent(r.value)}"
              title="${r.value}"
              aria-label="${r.value}"></button>`;
  }).join('');

  const unmappedList = unmapped.length
    ? `<div class="match-region-extra-hint">Đáp án khác (không có trên ảnh):</div>
       ${unmapped.map(left => `
        <div class="match-left-item ${matched[left] ? 'matched' : ''}">
          <div class="match-dot"></div><span>${left}</span>
        </div>`).join('')}`
    : '';

  return `
    <div class="match-region-wrap">
      <img src="${src}" alt="Bấm trực tiếp vào hình để chọn đáp án" loading="lazy"
           onerror="this.parentElement.style.display='none'">
      ${hotspots}
    </div>
    <div class="match-region-tip">👆 Bấm trực tiếp vào đúng vị trí trên hình</div>
    ${unmappedList}
  `;
}

function onRegionTap(e) {
  if (!_tapChip || !_dragRight) return;
  const hotspot = e.currentTarget;
  const qi = parseInt(hotspot.dataset.qi);
  if (qi !== _dragQi) return;
  const left = decodeURIComponent(hotspot.dataset.left);
  if (!State.matching[qi]) State.matching[qi] = {};
  State.matching[qi][left] = _dragRight;
  State.session.clicks++;
  document.querySelectorAll('.drag-chip.tap-selected').forEach(c => c.classList.remove('tap-selected'));
  _tapChip = null; _dragRight = null; _dragQi = null;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

function onRegionDrop(e) {
  e.preventDefault();
  const hotspot = e.currentTarget;
  hotspot.classList.remove('drag-over');
  const qi   = parseInt(hotspot.dataset.qi);
  const left = decodeURIComponent(hotspot.dataset.left);
  const right = _dragRight;
  if (!right || qi !== _dragQi) return;
  if (!State.matching[qi]) State.matching[qi] = {};
  State.matching[qi][left] = right;
  State.session.clicks++;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

// ── Drag state ──────────────────────────────────────────────
let _dragRight  = null;
let _dragQi     = null;
let _dragChipEl = null;

function onDragStart(e) {
  _dragRight  = decodeURIComponent(e.currentTarget.dataset.right);
  _dragQi     = parseInt(e.currentTarget.dataset.qi);
  _dragChipEl = e.currentTarget;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _dragRight);
}

function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); }

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const qi    = parseInt(e.currentTarget.dataset.qi);
  const left  = decodeURIComponent(e.currentTarget.dataset.left);
  const right = _dragRight;
  if (!right || qi !== _dragQi) return;
  if (!State.matching[qi]) State.matching[qi] = {};
  State.matching[qi][left] = right;
  State.session.clicks++;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

function removeMatchDrop(el) {
  const qi   = parseInt(el.dataset.qi);
  const left = decodeURIComponent(el.dataset.left);
  if (State.matching[qi]) delete State.matching[qi][left];
  State.session.clicks++;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

// ── Tap-to-place (mobile) ─────────────────────────────────
let _tapChip = null;

function onChipTap(e) {
  const chip = e.currentTarget;
  const qi   = parseInt(chip.dataset.qi);
  document.querySelectorAll('.drag-chip.tap-selected').forEach(c => c.classList.remove('tap-selected'));
  if (_tapChip === chip) { _tapChip = null; _dragRight = null; _dragQi = null; return; }
  _tapChip   = chip;
  _dragRight = decodeURIComponent(chip.dataset.right);
  _dragQi    = qi;
  chip.classList.add('tap-selected');
}

function onSlotTap(e) {
  if (!_tapChip || !_dragRight) return;
  const slot = e.currentTarget;
  const qi   = parseInt(slot.dataset.qi);
  if (qi !== _dragQi) return;
  const left = decodeURIComponent(slot.dataset.left);
  if (!State.matching[qi]) State.matching[qi] = {};
  State.matching[qi][left] = _dragRight;
  State.session.clicks++;
  document.querySelectorAll('.drag-chip.tap-selected').forEach(c => c.classList.remove('tap-selected'));
  _tapChip = null; _dragRight = null; _dragQi = null;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

// Stubs giữ tương thích
function selectMatchLeft()  {}
function selectMatchRight() {}
function removeMatch(el)    { removeMatchDrop(el); }

/* ============================================================
   § 14b — RENDER HOTSPOT  (type = "hotspot")
   Bấm trực tiếp lên đúng (các) vị trí trên hình. Dữ liệu q.areas
   là danh sách vùng (x/y/w/h tính theo % kích thước ảnh gốc, góc
   trên-trái) — mỗi vùng có cờ correct true/false. Học sinh cần
   bấm chọn đúng toàn bộ vùng correct:true (không thừa, không thiếu)
   thì câu mới được tính là đúng — giống hệt cách chấm của "multi".
   ============================================================ */

function renderHotspot(q, qi) {
  const body = document.getElementById('q-body');
  if (!body) return;

  if (!State.hotspot[qi]) State.hotspot[qi] = new Set();
  const sel = State.hotspot[qi];
  const src = q.imageUrl || (q.image_file ? `img/${q.image_file}` : '');
  const areas = q.areas || [];
  const totalCorrect = areas.filter(a => a.correct).length || areas.length;

  if (!src || areas.length === 0) {
    body.innerHTML = `<div class="q-img-notice">🖼️ Câu hỏi này thiếu dữ liệu hình ảnh — vui lòng báo cho giáo viên/quản trị viên.</div>`;
    return;
  }

  const areasHtml = areas.map(a => {
    const isSel = sel.has(a.id);
    const shapeCls = a.shape === 'oval' ? 'hotspot-oval' : 'hotspot-rect';
    return `<button type="button"
              class="hotspot-area ${shapeCls} ${isSel ? 'selected' : ''}"
              style="left:${a.x}%;top:${a.y}%;width:${a.w}%;height:${a.h}%;"
              data-qi="${qi}" data-id="${a.id}"
              onclick="toggleHotspot(this)"
              aria-label="Khu vực ${a.id}"></button>`;
  }).join('');

  body.innerHTML = `
    <div class="match-hint" style="
        font-size:.82rem;font-weight:700;color:var(--muted);margin-bottom:.75rem;
        background:var(--yellow-lt);border:1.5px solid rgba(255,179,0,.25);
        border-radius:10px;padding:.5rem .9rem;">
      🎯 Bấm vào đúng <strong>${totalCorrect}</strong> vị trí trên hình
      <span style="margin-left:.75rem;color:var(--teal);">
        Đã chọn: <span id="hotspot-count-${qi}">${sel.size}</span>/${totalCorrect}
      </span>
    </div>
    <div class="hotspot-wrap">
      <img src="${src}" alt="Bấm trực tiếp vào hình để chọn đáp án" loading="lazy"
           onerror="this.parentElement.innerHTML='<div class=&quot;q-img-notice&quot;>🖼️ Không tải được hình ảnh.</div>'">
      ${areasHtml}
    </div>
    <div class="match-region-tip">👆 Bấm trực tiếp vào vị trí đúng trên hình. Bấm lại để bỏ chọn.</div>`;
}

function toggleHotspot(el) {
  const qi = parseInt(el.dataset.qi);
  const id = el.dataset.id;
  if (!State.hotspot[qi]) State.hotspot[qi] = new Set();
  const sel = State.hotspot[qi];

  if (sel.has(id)) sel.delete(id);
  else sel.add(id);

  State.session.clicks++;
  el.classList.toggle('selected');
  const counter = document.getElementById(`hotspot-count-${qi}`);
  if (counter) counter.textContent = sel.size;
  animatePick(el);
  updateSidebar();
}

/* ============================================================
   § 15 — FLAG
   ============================================================ */

function toggleFlag(i) {
  if (State.flags.has(i)) State.flags.delete(i);
  else                    State.flags.add(i);
  renderQuestion(i);
}

/* ============================================================
   § 16 — SUBMIT & GRADING  (Task 4)
   Chấm điểm chính xác theo từng type câu hỏi
   ============================================================ */

function confirmSubmit() {
  const unans = State.questions.filter((_, i) => !isAnswered(i)).length;
  const msg   = unans > 0
    ? `Bạn còn ${unans} câu chưa trả lời.\nBạn có chắc muốn nộp bài không?`
    : 'Bạn có chắc muốn nộp bài không?';
  if (confirm(msg)) submitExam();
}

function autoSubmit() {
  State.session.timedOut = true;
  alert('⏰ Hết giờ! Bài thi được nộp tự động.');
  submitExam();
}

function submitExam() {
  clearInterval(State.timer);
  flushQTime(State.current);
  const elapsed   = Math.round((Date.now() - State.session.startTime) / 1000);
  const result    = gradeExam();
  const integrity = computeIntegrity(result, elapsed);
  const gameResult = saveRecord(result, elapsed, integrity);
  showResult(result, integrity);

  // ── Thông báo huy hiệu mới (nếu có) ────────────────────────
  if (gameResult?.newBadges?.length) {
    gameResult.newBadges.forEach((badge, i) => {
      setTimeout(() => showNotification(`Huy hiệu mới: ${badge.label}`, 'success'), 600 * (i + 1));
    });
  }

  // Gửi lên Google Sheet (chạy nền, chỉ để đối chiếu/dự phòng)
  if (typeof submitToGoogleSheet === 'function') {
    submitToGoogleSheet(result, elapsed, integrity);
  }

  // Lưu vào Firestore (nguồn dữ liệu CHÍNH cho trang Báo cáo trực quan
  // ic3-dashboard.html — điều phối đào tạo / giáo viên / admin xem)
  if (typeof saveResultToFirestore === 'function') {
    const s   = State.session;
    const pct = Math.round((result.correct / result.total) * 100);
    saveResultToFirestore({
      studentName:   s.studentName,
      studentClass:  s.studentClass  || '',
      studentSchool: s.studentSchool || '',
      category:      s.category,
      level:         s.level,
      minitest:      s.minitest,
      score:         pct,
      correct:       result.correct,
      incorrect:     result.incorrect,
      skipped:       result.skipped,
      total:         result.total,
      elapsedSec:    elapsed,
      tabSwitches:   integrity.tabSwitches,
      clicks:        integrity.clicks,
      integrityOk:   integrity.valid,
      flags:         integrity.flags,
      timedOut:      s.timedOut,
    });
  }
}

/**
 * Chấm điểm chính xác theo từng type (Task 4):
 *
 * single:    correct[0] so với State.answers[i] (string)
 * multi:     so sánh mảng đã sort (thứ tự không quan trọng)
 * truefalse: every statement phải đúng answer
 * matching:  every pair phải đúng
 */
function gradeExam() {
  let correct = 0, incorrect = 0, skipped = 0;
  const details = [];

  State.questions.forEach((q, i) => {
    const ua = State.answers[i];   // user answer
    const ma = State.matching[i];  // user matching
    let status = 'skipped';

    switch (q.type) {
      case 'single':
        if (!ua) {
          skipped++;
        } else if ((q.correct || []).includes(ua)) {
          correct++; status = 'correct';
        } else {
          incorrect++; status = 'incorrect';
        }
        break;

      case 'multi': {
        // Sắp xếp cả 2 mảng rồi so sánh để không phụ thuộc thứ tự
        const userArr = [...(ua || [])].sort();
        const corrArr = [...(q.correct || [])].sort();
        if (userArr.length === 0) {
          skipped++;
        } else if (JSON.stringify(userArr) === JSON.stringify(corrArr)) {
          correct++; status = 'correct';
        } else {
          incorrect++; status = 'incorrect';
        }
        break;
      }

      case 'truefalse': {
        const ans = ua || {};
        if (Object.keys(ans).length === 0) {
          skipped++;
        } else {
          // Kiểm tra TẤT CẢ statements phải đúng
          const allCorrect = (q.statements || []).every((st, j) => ans[j] === st.answer);
          if (allCorrect) { correct++; status = 'correct'; }
          else            { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      case 'matching': {
        if (!q.pairs || q.pairs.length === 0) {
          skipped++;
        } else if (!ma || Object.keys(ma).length === 0) {
          skipped++;
        } else {
          const ok = q.pairs.every(p => ma[p.left] === p.right);
          if (ok) { correct++; status = 'correct'; }
          else    { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      case 'hotspot': {
        const selSet = State.hotspot[i];
        const correctIds = (q.areas || []).filter(a => a.correct).map(a => a.id).sort();
        if (!selSet || selSet.size === 0) {
          skipped++;
        } else {
          const selArr = [...selSet].sort();
          const ok = JSON.stringify(selArr) === JSON.stringify(correctIds);
          if (ok) { correct++; status = 'correct'; }
          else    { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      default:
        skipped++;
    }

    details.push({
      num:    i + 1,
      qId:    q.id,
      uid:    q.uid || '',
      type:   q.type,
      text:   q.question.slice(0, 60) + (q.question.length > 60 ? '…' : ''),
      status,
    });
  });

  return { correct, incorrect, skipped, total: State.questions.length, details };
}

/* ============================================================
   § 17 — ANTI-CHEAT: INTEGRITY CHECK  (Task 4 — giữ nguyên)
   ============================================================ */

function computeIntegrity(result, elapsedSec) {
  const flags = [];
  const s     = State.session;
  const answered = result.correct + result.incorrect;

  // 1. Tốc độ làm bài
  const avgSec = answered > 0 ? elapsedSec / answered : 0;
  if (answered > 3 && avgSec < 3) {
    flags.push(`Tốc độ làm bài quá nhanh (TB ${avgSec.toFixed(1)}s/câu)`);
  }

  // 2. Chuyển tab
  if (s.tabSwitches >= 3) {
    flags.push(`Rời khỏi tab ${s.tabSwitches} lần`);
  }

  // 3. Không có click nhưng có đáp án
  if (s.clicks === 0 && answered > 0) {
    flags.push('Không có thao tác bấm nhưng có đáp án — dữ liệu bất thường');
  }

  // 4. Trả lời dưới 1 giây
  const ultraFast = Object.entries(s.qTimes || {}).filter(([qi, t]) => {
    return t < 1 && isAnswered(parseInt(qi));
  });
  if (ultraFast.length > Math.max(2, result.total * 0.25)) {
    flags.push(`${ultraFast.length} câu trả lời trong dưới 1 giây`);
  }

  return {
    flags,
    valid:       flags.length === 0,
    tabSwitches: s.tabSwitches,
    clicks:      s.clicks,
    elapsedSec,
    avgSecPerQ:  parseFloat(avgSec.toFixed(1)),
    timedOut:    s.timedOut,
  };
}

/* ============================================================
   § 18 — SAVE RECORD (localStorage)
   ============================================================ */

function saveRecord(result, elapsedSec, integrity) {
  const s   = State.session;
  const pct = Math.round((result.correct / result.total) * 100);
  const rec = {
    id:            Date.now(),
    studentName:   s.studentName,
    studentClass:  s.studentClass  || '',
    studentSchool: s.studentSchool || '',
    category:      s.category,
    level:         s.level,
    minitest:      s.minitest,
    date:          new Date().toLocaleString('vi-VN'),
    score:         pct,
    correct:       result.correct,
    incorrect:     result.incorrect,
    skipped:       result.skipped,
    total:         result.total,
    elapsedSec,
    tabSwitches:   s.tabSwitches,
    clicks:        s.clicks,
    avgSecPerQ:    integrity.avgSecPerQ,
    timedOut:      s.timedOut,
    integrityOk:   integrity.valid,
    flags:         integrity.flags,
    details:       result.details,
  };

  try {
    const all = JSON.parse(localStorage.getItem('eduquiz_records') || '[]');
    all.unshift(rec);
    if (all.length > 500) all.length = 500;
    localStorage.setItem('eduquiz_records', JSON.stringify(all));
  } catch (e) {
    console.warn('[EduQuiz] Lưu lịch sử thất bại:', e);
  }

  // ── Gamification: cập nhật XP / streak / huy hiệu (js/gamification.js) ──
  let gameResult = null;
  if (typeof window.EduGamification?.recordResult === 'function') {
    gameResult = window.EduGamification.recordResult(rec);
  }
  return gameResult;
}

/* ============================================================
   § 19 — SHOW RESULT
   ============================================================ */

function showResult(result, integrity) {
  const { correct, incorrect, skipped, total, details } = result;

  document.getElementById('exam').style.display   = 'none';
  document.getElementById('result').style.display = 'flex';

  const pct = Math.round((correct / total) * 100);

  document.getElementById('resultScore').textContent = `${pct}%`;
  document.getElementById('rCorrect').textContent    = correct;
  document.getElementById('rIncorrect').textContent  = incorrect;
  document.getElementById('rSkipped').textContent    = skipped;

  document.getElementById('resultEmoji').textContent =
    pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 50 ? '👍' : '📚';

  document.getElementById('resultLabel').textContent =
    (pct >= 90 ? 'Xuất sắc! Bạn đã làm rất tốt!' :
     pct >= 70 ? 'Tốt lắm! Cố gắng thêm nữa nhé!' :
     pct >= 50 ? 'Khá! Tiếp tục luyện tập!' :
                 'Cần ôn tập thêm. Đừng nản lòng!') +
    ` — ${correct}/${total} câu đúng`;

  const badge = document.getElementById('integrityBadge');
  if (integrity.valid) {
    badge.textContent = '🛡️ Bài làm hợp lệ';
    Object.assign(badge.style, {
      color: 'var(--accent5)',
      background: 'rgba(6,214,160,.08)',
      borderColor: 'rgba(6,214,160,.3)',
    });
  } else {
    badge.innerHTML = `⚠️ Cảnh báo: ${integrity.flags.map(f =>
      `<span style="display:block">${f}</span>`).join('')}`;
    Object.assign(badge.style, {
      color: 'var(--accent4)',
      background: 'rgba(255,209,102,.07)',
      borderColor: 'rgba(255,209,102,.3)',
      textAlign: 'left',
      borderRadius: '10px',
    });
  }

  document.getElementById('reviewList').innerHTML = details.map(d => `
    <div class="review-item ${d.status}">
      <span class="ri-num">${d.num}</span>
      <span class="ri-icon">${d.status === 'correct' ? '✓' : d.status === 'incorrect' ? '✗' : '–'}</span>
      <span class="ri-text">${d.text}</span>
    </div>`).join('');

  if (pct >= 70) launchConfetti();
}

/* ============================================================
   § 20 — RECORDS MODAL
   ============================================================ */

function showRecords() {
  document.getElementById('recordsModal').style.display = 'flex';
  renderRecords();
}

function closeRecords() {
  document.getElementById('recordsModal').style.display = 'none';
}

function closeModalBg(e) {
  if (e.target.id === 'recordsModal') closeRecords();
}

function renderRecords() {
  const el = document.getElementById('recordsContent');
  let records = [];
  try { records = JSON.parse(localStorage.getItem('eduquiz_records') || '[]'); } catch {}

  if (!records.length) {
    el.innerHTML = '<div class="no-records">📭 Chưa có bài làm nào được lưu.</div>';
    return;
  }

  el.innerHTML = `
    <table class="records-table">
      <thead><tr>
        <th>#</th><th>Học sinh</th><th>Lớp</th><th>Trường</th><th>Bài thi</th>
        <th>Điểm</th><th>Đúng/Tổng</th>
        <th>T.gian</th><th>Tab</th><th>Click</th>
        <th>Tính hợp lệ</th><th>Ngày làm</th>
      </tr></thead>
      <tbody>
        ${records.map((r, i) => `
          <tr>
            <td style="color:var(--muted)">${i + 1}</td>
            <td><strong>${r.studentName}</strong></td>
            <td style="font-size:.85rem">${r.studentClass || '–'}</td>
            <td style="font-size:.8rem">${r.studentSchool || '–'}</td>
            <td style="font-size:.8rem">${r.minitest}<br>
                <span style="color:var(--muted)">${r.level}</span></td>
            <td class="${r.score >= 70 ? 'pass' : 'fail'}">${r.score}%</td>
            <td>${r.correct}/${r.total}</td>
            <td style="font-family:'Space Mono',monospace;font-size:.8rem">${fmtTime(r.elapsedSec)}</td>
            <td class="${r.tabSwitches >= 3 ? 'warn' : ''}">${r.tabSwitches}</td>
            <td>${r.clicks ?? '–'}</td>
            <td class="${r.integrityOk ? 'pass' : 'warn'}">
              ${r.integrityOk ? '✓ Hợp lệ' : '⚠ ' + (r.flags?.[0] || 'Nghi vấn')}
            </td>
            <td style="font-size:.75rem;color:var(--muted)">${r.date}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function clearRecords() {
  if (!confirm('Xóa toàn bộ lịch sử? Hành động này không thể hoàn tác.')) return;
  localStorage.removeItem('eduquiz_records');
  renderRecords();
}

function exportCSV() {
  let records = [];
  try { records = JSON.parse(localStorage.getItem('eduquiz_records') || '[]'); } catch {}
  if (!records.length) { alert('Không có dữ liệu để xuất.'); return; }

  const h = ['STT','Học sinh','Lớp','Trường','Danh mục','Cấp độ','Bài thi','Ngày','Điểm%',
             'Đúng','Sai','Bỏ qua','Tổng','Thời gian(s)','Chuyển tab',
             'Số lần click','TB giây/câu','Hết giờ','Hợp lệ','Cờ cảnh báo'];
  const rows = records.map((r, i) => [
    i + 1, r.studentName, r.studentClass || '', r.studentSchool || '',
    r.category, r.level, r.minitest, r.date,
    r.score, r.correct, r.incorrect ?? r.total - r.correct - r.skipped,
    r.skipped, r.total, r.elapsedSec, r.tabSwitches, r.clicks ?? 0,
    (r.avgSecPerQ || 0).toFixed(1), r.timedOut ? 'Có' : 'Không',
    r.integrityOk ? 'Hợp lệ' : 'Nghi vấn', (r.flags || []).join('; ')
  ]);

  const csv  = [h, ...rows].map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')
  ).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: `EduQuiz_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmtTime(s) {
  const sec = s || 0;
  return `${String(Math.floor(sec / 60)).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}`;
}

/* ============================================================
   § 21 — BACK TO LOBBY
   ============================================================ */

function backToLobby() {
  clearInterval(State.timer);
  document.getElementById('result').style.display = 'none';
  document.getElementById('lobby').style.display  = 'flex';
  document.getElementById('adminEntryLink')?.style.setProperty('display', 'flex');
  if (window.EduGamification) EduGamification.renderInto('#lobbyGameStrip');
}

/* ============================================================
   § 22 — CONFETTI
   ============================================================ */

function launchConfetti() {
  const COLORS = ['#4f6bff','#17b3a3','#f6a723','#ff8a3d','#2e8cf0','#dd4fa6'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText =
        `left:${Math.random() * 100}vw;` +
        `width:${6 + Math.random() * 8}px;height:${10 + Math.random() * 14}px;` +
        `background:${COLORS[Math.floor(Math.random() * COLORS.length)]};` +
        `animation-duration:${1.5 + Math.random() * 2}s;` +
        `animation-delay:${Math.random() * 0.5}s;` +
        `transform:rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }, i * 30);
  }
}

/* ============================================================
   § 23 — UTILS
   ============================================================ */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function animatePick(el) {
  el.style.transform = 'scale(0.97) translateX(3px)';
  setTimeout(() => el.style.transform = '', 150);
}

/* ============================================================
   § 24 — DEMO DATA (dự phòng khi không tải được JSON)
   ============================================================ */

const DEMO_DATA = {
  categories: [{
    id: 'DEMO', name: 'Demo – IC3', color: '#6c63ff',
    levels: [{
      id: 'LV1', name: 'Level Demo', grade: 'K6',
      minitests: {
        'Demo Test': [
          {
            id: 1, type: 'single', image: false,
            question: 'Đâu là hệ điều hành phổ biến nhất trên máy tính để bàn?',
            options: ['Android', 'iOS', 'Windows', 'ChromeOS'],
            correct: ['Windows'],
            uid: 'demo__k6__mt1__q1'
          },
          {
            id: 2, type: 'multi', image: false,
            question: 'Chọn 2 trình duyệt web phổ biến: (Chọn 2)',
            options: ['Microsoft Word', 'Google Chrome', 'Firefox', 'Notepad'],
            correct: ['Google Chrome', 'Firefox'],
            uid: 'demo__k6__mt1__q2'
          },
          {
            id: 3, type: 'truefalse', image: false,
            question: 'Với mỗi phát biểu hãy chọn Đúng hoặc Sai:',
            statements: [
              { text: 'Email là viết tắt của Electronic Mail', answer: 'true' },
              { text: 'RAM là bộ nhớ không mất khi tắt máy',  answer: 'false' }
            ],
            label_true: 'ĐÚNG', label_false: 'SAI',
            uid: 'demo__k6__mt1__q3'
          },
          {
            id: 4, type: 'matching', image: false,
            question: 'Nối hệ điều hành với công ty phát triển:',
            pairs: [
              { left: 'Windows', right: 'Microsoft' },
              { left: 'iOS',     right: 'Apple'     },
              { left: 'Android', right: 'Google'    }
            ],
            uid: 'demo__k6__mt1__q4'
          }
        ]
      }
    }]
  }]
};

/* ============================================================
   § 25 — GOOGLE SHEET INTEGRATION
   Giữ nguyên cấu hình từ file index.html gốc
   (Phần này để trống — module gốc trong index.html vẫn hoạt động)
   ============================================================ */

// Stub nếu hàm chưa được định nghĩa ở nơi khác
if (typeof submitToGoogleSheet !== 'function') {
  window.submitToGoogleSheet = async function (result, elapsedSec, integrity) {
    console.log('[EduQuiz] submitToGoogleSheet: hàm chưa được cấu hình.');
  };
}

/* ============================================================
   § 26 — DARK / LIGHT MODE TOGGLE
   ============================================================ */

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const icon = next === 'dark' ? '☀️' : '🌙';
  ['themeToggle', 'themeToggleExam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });
  try { localStorage.setItem('eduquiz_theme', next); } catch {}
}

// Áp dụng theme đã lưu khi tải trang
(function applyTheme() {
  let saved = 'light';
  try { saved = localStorage.getItem('eduquiz_theme') || 'light'; } catch {}
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.addEventListener('DOMContentLoaded', () => {
      ['themeToggle', 'themeToggleExam'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '☀️';
      });
    });
  }
})();

/* ============================================================
   § 27 — NOTIFICATIONS (Toast UI)
   ============================================================ */

function showNotification(message, type = 'info') {
  let container = document.getElementById('gs-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'gs-toast-container';
    container.style.cssText =
      'position:fixed;top:20px;right:20px;z-index:9999;' +
      'display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const colors = {
    success: { bg: '#1b5e20', border: '#4caf50' },
    error:   { bg: '#7f0000', border: '#f44336' },
    warning: { bg: '#bf360c', border: '#ff9800' },
    info:    { bg: '#0d47a1', border: '#2196f3' },
  };
  const c = colors[type] || colors.info;
  const toast = document.createElement('div');
  toast.style.cssText =
    `background:${c.bg};border:1px solid ${c.border};border-left:4px solid ${c.border};` +
    'color:#fff;padding:12px 18px;border-radius:10px;' +
    "font-family:'Baloo 2',sans-serif;font-size:14px;font-weight:700;" +
    'max-width:360px;box-shadow:0 4px 20px rgba(0,0,0,.5);pointer-events:auto;' +
    'cursor:pointer;opacity:0;transform:translateX(40px);' +
    'transition:opacity .3s ease,transform .3s ease;line-height:1.5;';
  toast.textContent = message;
  toast.onclick = () => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)';
    setTimeout(() => toast.remove(), 300);
  };
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    toast.style.opacity = '1'; toast.style.transform = 'translateX(0)';
  }));
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

/* ============================================================
   ██ BOOT — Gọi loadData() sau khi DOM sẵn sàng
   ============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadData);
} else {
  loadData();
}
