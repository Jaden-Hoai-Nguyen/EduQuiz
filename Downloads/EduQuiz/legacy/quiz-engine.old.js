/* ============================================================
   STATE
   ============================================================ */
const State = {
  quizData:  null,
  questions: [],
  answers:   {},      // { qi: value }
  flags:     new Set(),
  current:   0,
  timer:     null,
  timeLeft:  1200,
  matching:  {},      // { qi: { left: right } }
  matchSel:  {},      // { qi: selectedLeft | null }
  session:   {}
};

/* ============================================================
   ANTI-CHEAT: VISIBILITY TRACKING
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
  const t = State.session.qStart[qi];
  if (!t) return;
  State.session.qTimes[qi] = (State.session.qTimes[qi] || 0) + Math.round((Date.now() - t) / 1000);
  delete State.session.qStart[qi];
}

function beginQTime(qi) {
  // flush previous
  flushQTime(State.current);
  State.session.qStart[qi] = Date.now();
}

/* ============================================================
   LOAD DATA
   ============================================================ */
async function loadData() {
  try {
    const res = await fetch('quiz_data.json');
    if (!res.ok) throw 0;
    State.quizData = await res.json();
  } catch {
    State.quizData = DEMO_DATA;
  }
  initLobby();
}

/* ============================================================
   LOBBY
   ============================================================ */
function initLobby() {
  const catSel = document.getElementById('categorySelect');
  const lvlSel = document.getElementById('levelSelect');
  const mtSel  = document.getElementById('minitestSelect');

  catSel.innerHTML = '';
  State.quizData.categories.forEach(c => catSel.appendChild(new Option(c.name, c.id)));

  const refreshLevels = () => {
    const cat = State.quizData.categories.find(c => c.id === catSel.value);
    lvlSel.innerHTML = '';
    (cat?.levels || []).forEach(lv => lvlSel.appendChild(new Option(lv.name, lv.id)));
    refreshMinitests();
  };

  const refreshMinitests = () => {
    const cat = State.quizData.categories.find(c => c.id === catSel.value);
    const lv  = cat?.levels.find(l => l.id === lvlSel.value);
    mtSel.innerHTML = '';
    Object.keys(lv?.minitests || {}).forEach(n => mtSel.appendChild(new Option(n, n)));
    refreshMeta();
  };

  const refreshMeta = () => {
    const cat = State.quizData.categories.find(c => c.id === catSel.value);
    const lv  = cat?.levels.find(l => l.id === lvlSel.value);
    const qs  = lv?.minitests?.[mtSel.value] || [];
    const el  = document.getElementById('minitestMeta');
    if (qs.length) {
      const types = [...new Set(qs.map(q => q.type))];
      el.innerHTML = `<span class="chip green">📝 ${qs.length} câu</span>
                      <span class="chip purple">🎯 ${types.join(' · ')}</span>`;
    } else {
      el.innerHTML = '';
    }
    document.getElementById('btnStart').disabled =
      !qs.length || !document.getElementById('studentName').value.trim()
      || !document.getElementById('studentClass').value.trim()
      || !document.getElementById('studentSchool').value.trim();
  };

  catSel.addEventListener('change', refreshLevels);
  lvlSel.addEventListener('change', refreshMinitests);
  mtSel.addEventListener('change', refreshMeta);
  document.getElementById('studentName').addEventListener('input', refreshMeta);
  document.getElementById('studentClass').addEventListener('input', refreshMeta);
  document.getElementById('studentSchool').addEventListener('input', refreshMeta);
  refreshLevels();
}

/* ============================================================
   START EXAM
   ============================================================ */
function startExam() {
  const name   = document.getElementById('studentName').value.trim();
  const cls    = document.getElementById('studentClass').value.trim();
  const school = document.getElementById('studentSchool').value.trim();
  const catId  = document.getElementById('categorySelect').value;
  const lvlId  = document.getElementById('levelSelect').value;
  const mtName = document.getElementById('minitestSelect').value;
  if (!name || !cls || !school) return;

  const cat = State.quizData.categories.find(c => c.id === catId);
  const lv  = cat?.levels.find(l => l.id === lvlId);
  const qs  = lv?.minitests?.[mtName] || [];
  if (!qs.length) return;

  // Deep-clone and prepare (shuffle questions + options, keep answers)
  State.questions = prepareQuestions(qs);
  State.answers   = {};
  State.flags     = new Set();
  State.current   = 0;
  State.matching  = {};
  State.matchSel  = {};
  State.timeLeft  = parseInt(document.getElementById('timeSelect').value, 10);

  State.session = {
    studentName:  name,
    studentClass: cls,
    studentSchool: school,
    category:     cat?.name || catId,
    level:        lv?.name  || lvlId,
    minitest:     mtName,
    startTime:    Date.now(),
    totalTime:    State.timeLeft,
    tabSwitches:  0,
    clicks:       0,
    qTimes:       {},
    qStart:       { 0: Date.now() },
    timedOut:     false,
  };

  document.getElementById('lobby').style.display  = 'none';
  document.getElementById('exam').style.display   = 'flex';
  document.getElementById('result').style.display = 'none';
  document.getElementById('topbarInfo').textContent = `👤 ${name} · ${cls} · ${mtName}`;

  buildSidebar();
  renderQuestion(0);
  startTimer();
}

/* ============================================================
   PREPARE: shuffle questions AND options, keep correct[] correct
   ============================================================ */
function prepareQuestions(rawQs) {
  // Shuffle question ORDER
  const qs = shuffle(JSON.parse(JSON.stringify(rawQs)));

  qs.forEach(q => {
    if ((q.type === 'single' || q.type === 'multi') && Array.isArray(q.options)) {
      // Shuffle options — correct[] references text content, so still matches
      q.options = shuffle(q.options);
    }
    if (q.type === 'truefalse' && Array.isArray(q.statements)) {
      // Shuffle statement rows — answer is inside each statement object
      q.statements = shuffle(q.statements);
    }
    if (q.type === 'matching' && Array.isArray(q.pairs) && q.pairs.length > 0) {
      // Produce shuffled display columns; pairs[] kept for grading
      q._leftShuffled  = shuffle(q.pairs.map(p => p.left));
      q._rightShuffled = shuffle([...new Set(q.pairs.map(p => p.right))]);  // unique list for display order
    }
  });

  return qs;
}

/* ============================================================
   TIMER
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
  const m  = Math.floor(State.timeLeft / 60);
  const s  = State.timeLeft % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.className   = State.timeLeft <= 60 ? 'danger' : State.timeLeft <= 180 ? 'warning' : '';
}

/* ============================================================
   SIDEBAR
   ============================================================ */
function buildSidebar() {
  const grid = document.getElementById('qGrid');
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
  document.getElementById('progressFill').style.width =
    `${(done / State.questions.length) * 100}%`;
}

function isAnswered(i) {
  const q = State.questions[i];
  if (!q) return false;
  if (q.type === 'matching') {
    if (!q.pairs || q.pairs.length === 0) return false; // image-only questions
    return Object.keys(State.matching[i] || {}).length > 0;
  }
  if (q.type === 'truefalse') {
    return Object.keys(State.answers[i] || {}).length === (q.statements?.length || 0);
  }
  const a = State.answers[i];
  return a !== undefined && a !== null && (Array.isArray(a) ? a.length > 0 : true);
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function jumpTo(i) {
  beginQTime(i);
  State.current = i;
  renderQuestion(i);
}

function prevQ() { if (State.current > 0) jumpTo(State.current - 1); }
function nextQ() { if (State.current < State.questions.length - 1) jumpTo(State.current + 1); }

/* ============================================================
   RENDER QUESTION
   ============================================================ */
function renderQuestion(idx) {
  State.current = idx;
  const q = State.questions[idx];
  const panel = document.getElementById('qPanel');

  const TYPE = {
    single:    ['◎','Một lựa chọn'],
    multi:     ['☑','Nhiều lựa chọn'],
    truefalse: ['⇄','Đúng / Sai'],
    matching:  ['↔','Nối cột'],
  };
  const [icon, lbl] = TYPE[q.type] || ['?', q.type];

  const navPrev = `<button class="btn-nav" onclick="prevQ()" ${idx===0?'disabled':''}>← Câu trước</button>`;
  const navNext = idx < State.questions.length - 1
    ? `<button class="btn-nav btn-next-primary" onclick="nextQ()">Câu tiếp →</button>`
    : `<button class="btn-nav" style="background:rgba(6,214,160,.15);border-color:var(--accent5);color:var(--accent5);" onclick="confirmSubmit()">Nộp bài ✓</button>`;
  const navFlag = `<button class="btn-nav btn-flag ${State.flags.has(idx)?'flagged':''}" onclick="toggleFlag(${idx})">
    ${State.flags.has(idx) ? '⚑ Bỏ đánh dấu' : '⚐ Đánh dấu'}
  </button>`;

  const imgNotice = q.image ? getImageIllustration(q) : '';

  panel.innerHTML = `
    <div class="q-card">
      <div class="q-header">
        <div class="q-badge">${idx+1}</div>
        <div class="q-meta">
          <div class="q-type-badge">${icon} ${lbl}</div>
          <div class="q-text">${q.question}</div>
        </div>
      </div>
      ${imgNotice}
      <div id="q-body"></div>
    </div>
    <div class="q-nav">${navPrev}${navNext}${navFlag}</div>`;

  const renders = { single: renderSingle, multi: renderMulti, truefalse: renderTrueFalse, matching: renderMatching };
  (renders[q.type] || (() => {}))(q, idx);

  updateSidebar();
  panel.scrollTop = 0;
}

/* ── IMAGE ILLUSTRATION ──────────────────────────────────────
   Tạo SVG minh họa phù hợp với nội dung câu hỏi.
   Dựa vào keywords trong question để chọn hình phù hợp.
   ──────────────────────────────────────────────────────────── */
function getImageIllustration(q) {
  // ── Ưu tiên 1: dùng ảnh file đã có sẵn ─────────────────
  if (q.imageUrl) {
    return `<div class="img-illus-custom">
      <img src="${q.imageUrl}" alt="Hình minh họa câu hỏi" loading="lazy"/>
    </div>`;
  }
  // ── Ưu tiên 2: dùng SVG đã nhúng trong data JSON ────────
  if (q.image_svg) {
    return `<div class="img-illus" style="background:transparent;border:none;padding:.2rem 0 .8rem;">
      ${q.image_svg}
    </div>`;
  }
  // Không tự đoán hình minh họa theo từ khóa nữa — dễ gây hình sai/không phù hợp.
  // Chỉ hiển thị hình khi câu hỏi có ảnh thật (imageUrl) hoặc SVG đã được kiểm duyệt (image_svg) ở trên.
  // Dùng công cụ quản lý hình (image-manager.html) để gắn ảnh phù hợp cho từng câu.
  return '';
}

/* ── SINGLE ── */
function renderSingle(q, qi) {
  const current = State.answers[qi];
  const ALPHA   = 'ABCDEFGHIJ';
  document.getElementById('q-body').innerHTML = `<div class="options-list">${
    (q.options || []).map((opt, j) => `
      <button class="option-btn ${current===opt?'selected':''}"
              data-qi="${qi}" data-val="${encodeURIComponent(opt)}"
              onclick="selectSingle(this)">
        <div class="option-marker">${ALPHA[j] ?? j+1}</div>
        <span>${opt}</span>
      </button>`).join('')
  }</div>`;
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

/* ── MULTI ── */
function renderMulti(q, qi) {
  const current = State.answers[qi] || [];
  const ALPHA   = 'ABCDEFGHIJ';
  const COLORS  = ['c0','c1','c2','c3','c4','c5'];
  const hint    = q.correct?.length ? `Chọn ${q.correct.length} đáp án đúng` : 'Chọn tất cả đáp án đúng';
  document.getElementById('q-body').innerHTML = `
    <div style="font-size:.8rem;color:var(--muted);margin-bottom:.8rem;">💡 ${hint}</div>
    <div class="options-list">${
      (q.options || []).map((opt, j) => {
        const cc  = COLORS[j % COLORS.length];
        const sel = current.includes(opt) ? `selected ${cc}` : '';
        return `<button class="option-btn multi-style ${sel}"
                        data-qi="${qi}" data-val="${encodeURIComponent(opt)}" data-cc="${cc}"
                        onclick="selectMulti(this)">
          <div class="option-marker">${ALPHA[j] ?? j+1}</div>
          <span>${opt}</span>
        </button>`;
      }).join('')
    }</div>`;
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
    el.classList.remove('selected','c0','c1','c2','c3','c4','c5');
  } else {
    arr.push(val);
    el.classList.add('selected', cc);
    animatePick(el);
  }
  State.session.clicks++;
  updateSidebar();
}

/* ── TRUE/FALSE ── */
function renderTrueFalse(q, qi) {
  const current = State.answers[qi] || {};
  const lT = q.label_true  || 'ĐÚNG';
  const lF = q.label_false || 'SAI';

  // Defensive: nếu statements là placeholder (1 phần tử generic),
  // thử parse từ question text (các dòng bắt đầu bằng "- " hoặc "\n")
  const PLACEHOLDER_RE = /có \/ không cho từng|đúng \/ sai cho từng|đúng\/sai cho từng/i;
  let stmts = q.statements || [];
  if (stmts.length === 1 && PLACEHOLDER_RE.test(stmts[0].text || '')) {
    // Parse từ question: tách theo \n- hoặc \n• hoặc số thứ tự
    const lines = q.question.split(/\n/).map(l => l.trim()).filter(l => /^[-•\d]/.test(l));
    if (lines.length > 0) {
      stmts = lines.map(l => ({
        text:   l.replace(/^[-•\d]+[.)\s]*/, '').trim(),
        answer: stmts[0].answer || 'true'   // giữ answer gốc nếu có
      }));
    }
  }

  document.getElementById('q-body').innerHTML = `
    <table class="tf-table">
      <thead><tr>
        <th style="text-align:left">Phát biểu</th>
        <th>${lT}</th><th>${lF}</th>
      </tr></thead>
      <tbody>${stmts.map((st, j) => `
        <tr class="tf-row">
          <td>${st.text}</td>
          <td class="tf-btn-cell">
            <button class="tf-btn ${current[j]==='true'?'selected-true':''}"
                    data-qi="${qi}" data-j="${j}" data-v="true"
                    onclick="selectTF(this)">${lT}</button>
          </td>
          <td class="tf-btn-cell">
            <button class="tf-btn ${current[j]==='false'?'selected-false':''}"
                    data-qi="${qi}" data-j="${j}" data-v="false"
                    onclick="selectTF(this)">${lF}</button>
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
  const row = el.closest('tr');
  row.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected-true','selected-false'));
  el.classList.add(v === 'true' ? 'selected-true' : 'selected-false');
  updateSidebar();
}

/* ── MATCHING – DRAG & DROP ────────────────────────────────────
   Pool hiển thị ĐỦ số chip theo số lần mỗi right xuất hiện.
   Ví dụ: 5 OS → 3 công ty → pool có 5 chip (Google×2, Apple×2, MS×1).
   Kéo chip vào slot → chip bị trừ khỏi pool (re-render).
   Nhấn ✕ → chip trả lại pool.
   Hỗ trợ cả drag-and-drop (desktop) và tap-to-place (mobile).
   ──────────────────────────────────────────────────────────── */
function renderMatching(q, qi) {
  const body = document.getElementById('q-body');

  if (!q.pairs || q.pairs.length === 0) {
    body.innerHTML = `<div class="q-img-notice">🖼️ Câu nối cột này dùng hình ảnh — vui lòng xem đề thi in.</div>`;
    return;
  }

  if (!State.matching[qi]) State.matching[qi] = {};
  const matched = State.matching[qi];

  // Thứ tự cột trái (đã shuffle trong prepareQuestions)
  const leftItems = q._leftShuffled || q.pairs.map(p => p.left);

  // Đếm số lần mỗi right value CẦN dùng (theo pairs gốc)
  const rightCount = {};
  q.pairs.forEach(p => { rightCount[p.right] = (rightCount[p.right] || 0) + 1; });

  // Đếm số lần mỗi right value ĐÃ đặt vào slot
  const placedCount = {};
  Object.values(matched).forEach(r => { placedCount[r] = (placedCount[r] || 0) + 1; });

  // Thứ tự unique rights để hiển thị trong pool (đã shuffle trong prepareQuestions)
  const uniqueRights = q._rightShuffled || [...new Set(q.pairs.map(p => p.right))];

  // Tạo pool: mỗi right xuất hiện (tổng - đã đặt) lần, tối thiểu 0
  const poolChips = [];
  uniqueRights.forEach(r => {
    const remain = Math.max(0, (rightCount[r] || 0) - (placedCount[r] || 0));
    for (let i = 0; i < remain; i++) {
      poolChips.push({ r, id: `chip-${qi}-${encodeURIComponent(r)}-${i}` });
    }
  });

  body.innerHTML = `
    <div class="match-hint">🖱️ Kéo thả (hoặc nhấn chọn rồi nhấn ô) đáp án vào vị trí tương ứng</div>

    <div style="font-size:.75rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:.4rem">📦 Đáp án — kéo vào ô bên phải:</div>
    <div class="drag-pool" id="dragPool-${qi}">
      ${poolChips.length > 0
        ? poolChips.map(({r, id}) => `
            <div class="drag-chip"
                 draggable="true"
                 data-right="${encodeURIComponent(r)}"
                 data-qi="${qi}"
                 id="${id}">⠿ ${r}</div>`).join('')
        : `<span style="color:var(--muted);font-size:.82rem;font-style:italic;padding:.25rem .5rem">
             ✅ Đã điền hết — nhấn ✕ để thay đổi
           </span>`
      }
    </div>

    <div class="matching-container">
      <div class="matching-col">
        <div class="matching-col-title">Cột trái</div>
        ${leftItems.map(left => `
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

// ── Tap-to-place (mobile) ────────────────────────────────────
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

// ── Stubs ─────────────────────────────────────────────────────
function selectMatchLeft()  {}
function selectMatchRight() {}
function removeMatch(el)    { removeMatchDrop(el); }

/* ============================================================
   FLAG
   ============================================================ */
function toggleFlag(i) {
  if (State.flags.has(i)) State.flags.delete(i);
  else                    State.flags.add(i);
  renderQuestion(i);
}

/* ============================================================
   SUBMIT
   ============================================================ */
function confirmSubmit() {
  const unans = State.questions.filter((_,i) => !isAnswered(i)).length;
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
  saveRecord(result, elapsed, integrity);
  showResult(result, integrity);

  // 🌐 Gửi kết quả lên Google Sheet (chạy nền, không chặn UI)
  submitToGoogleSheet(result, elapsed, integrity);
}

/* ============================================================
   GRADING
   ============================================================ */
function gradeExam() {
  let correct = 0, incorrect = 0, skipped = 0;
  const details = [];

  State.questions.forEach((q, i) => {
    const ua = State.answers[i];
    const ma = State.matching[i];
    let status = 'skipped';

    if (q.type === 'single') {
      if (!ua) skipped++;
      else if ((q.correct || []).includes(ua)) { correct++; status = 'correct'; }
      else { incorrect++; status = 'incorrect'; }

    } else if (q.type === 'multi') {
      const userArr = (ua || []).slice().sort();
      const corrArr = (q.correct || []).slice().sort();
      if (userArr.length === 0) skipped++;
      else if (JSON.stringify(userArr) === JSON.stringify(corrArr)) { correct++; status = 'correct'; }
      else { incorrect++; status = 'incorrect'; }

    } else if (q.type === 'truefalse') {
      const ans = ua || {};
      if (Object.keys(ans).length === 0) skipped++;
      else {
        const ok = (q.statements || []).every((st, j) => ans[j] === st.answer);
        if (ok) { correct++; status = 'correct'; }
        else    { incorrect++; status = 'incorrect'; }
      }

    } else if (q.type === 'matching') {
      if (!q.pairs || q.pairs.length === 0) { skipped++; }
      else if (!ma || Object.keys(ma).length === 0) skipped++;
      else {
        const ok = q.pairs.every(p => ma[p.left] === p.right);
        if (ok) { correct++; status = 'correct'; }
        else    { incorrect++; status = 'incorrect'; }
      }
    }

    details.push({ num: i+1, qId: q.id, type: q.type,
      text: q.question.slice(0,60) + (q.question.length>60?'…':''), status });
  });

  return { correct, incorrect, skipped, total: State.questions.length, details };
}

/* ============================================================
   ANTI-CHEAT: INTEGRITY CHECK
   ============================================================ */
function computeIntegrity(result, elapsedSec) {
  const flags = [];
  const s     = State.session;
  const answered = result.correct + result.incorrect;

  // 1. Speed check
  const avgSec = answered > 0 ? elapsedSec / answered : 0;
  if (answered > 3 && avgSec < 3) {
    flags.push(`Tốc độ làm bài quá nhanh (trung bình ${avgSec.toFixed(1)}s/câu)`);
  }

  // 2. Tab switch count
  if (s.tabSwitches >= 3) {
    flags.push(`Rời khỏi tab/cửa sổ ${s.tabSwitches} lần`);
  }

  // 3. Zero clicks but has answers (data tampering)
  if (s.clicks === 0 && answered > 0) {
    flags.push('Không có thao tác bấm nào nhưng có đáp án — dữ liệu bất thường');
  }

  // 4. Questions answered in < 1 second
  const ultraFast = Object.entries(s.qTimes).filter(([qi, t]) => {
    return t < 1 && isAnswered(parseInt(qi));
  });
  if (ultraFast.length > Math.max(2, result.total * 0.25)) {
    flags.push(`${ultraFast.length} câu trả lời trong dưới 1 giây`);
  }

  return {
    flags,
    valid:        flags.length === 0,
    tabSwitches:  s.tabSwitches,
    clicks:       s.clicks,
    elapsedSec,
    avgSecPerQ:   parseFloat(avgSec.toFixed(1)),
    timedOut:     s.timedOut,
  };
}

/* ============================================================
   SAVE RECORD
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
    level:        s.level,
    minitest:     s.minitest,
    date:         new Date().toLocaleString('vi-VN'),
    score:        pct,
    correct:      result.correct,
    incorrect:    result.incorrect,
    skipped:      result.skipped,
    total:        result.total,
    elapsedSec,
    tabSwitches:  s.tabSwitches,
    clicks:       s.clicks,
    avgSecPerQ:   integrity.avgSecPerQ,
    timedOut:     s.timedOut,
    integrityOk:  integrity.valid,
    flags:        integrity.flags,
    details:      result.details,
  };
  try {
    const all = JSON.parse(localStorage.getItem('eduquiz_records') || '[]');
    all.unshift(rec);
    if (all.length > 500) all.length = 500;
    localStorage.setItem('eduquiz_records', JSON.stringify(all));
  } catch(e) { console.warn('Save failed', e); }
}

/* ============================================================
   SHOW RESULT
   ============================================================ */
function showResult(result, integrity) {
  const { correct, incorrect, skipped, total, details } = result;
  document.getElementById('exam').style.display   = 'none';
  document.getElementById('result').style.display = 'flex';

  const pct = Math.round((correct / total) * 100);
  document.getElementById('resultScore').textContent   = `${pct}%`;
  document.getElementById('rCorrect').textContent      = correct;
  document.getElementById('rIncorrect').textContent    = incorrect;
  document.getElementById('rSkipped').textContent      = skipped;
  document.getElementById('resultEmoji').textContent   =
    pct>=90?'🏆':pct>=70?'🎉':pct>=50?'👍':'📚';
  document.getElementById('resultLabel').textContent   =
    (pct>=90?'Xuất sắc! Bạn đã làm rất tốt!':
     pct>=70?'Tốt lắm! Cố gắng thêm nữa nhé!':
     pct>=50?'Khá! Tiếp tục luyện tập!':'Cần ôn tập thêm. Đừng nản lòng!') +
    ` — ${correct}/${total} câu đúng`;

  const badge = document.getElementById('integrityBadge');
  if (integrity.valid) {
    badge.textContent = '🛡️ Bài làm hợp lệ';
    Object.assign(badge.style, { color:'var(--accent5)', background:'rgba(6,214,160,.08)', borderColor:'rgba(6,214,160,.3)' });
  } else {
    badge.innerHTML = `⚠️ Cảnh báo: ${integrity.flags.map(f=>`<span style="display:block">${f}</span>`).join('')}`;
    Object.assign(badge.style, { color:'var(--accent4)', background:'rgba(255,209,102,.07)', borderColor:'rgba(255,209,102,.3)', textAlign:'left', borderRadius:'10px' });
  }

  document.getElementById('reviewList').innerHTML = details.map(d => `
    <div class="review-item ${d.status}">
      <span class="ri-num">${d.num}</span>
      <span class="ri-icon">${d.status==='correct'?'✓':d.status==='incorrect'?'✗':'–'}</span>
      <span class="ri-text">${d.text}</span>
    </div>`).join('');

  if (pct >= 70) launchConfetti();
}

/* ============================================================
   RECORDS MODAL
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
      <tbody>${records.map((r,i) => `
        <tr>
          <td style="color:var(--muted)">${i+1}</td>
          <td><strong>${r.studentName}</strong></td>
          <td style="font-size:.85rem">${r.studentClass || '–'}</td>
          <td style="font-size:.8rem">${r.studentSchool || '–'}</td>
          <td style="font-size:.8rem">${r.minitest}<br>
              <span style="color:var(--muted)">${r.level}</span></td>
          <td class="${r.score>=70?'pass':'fail'}">${r.score}%</td>
          <td>${r.correct}/${r.total}</td>
          <td style="font-family:'Space Mono',monospace;font-size:.8rem">${fmtTime(r.elapsedSec)}</td>
          <td class="${r.tabSwitches>=3?'warn':''}">${r.tabSwitches}</td>
          <td>${r.clicks ?? '–'}</td>
          <td class="${r.integrityOk?'pass':'warn'}">
            ${r.integrityOk ? '✓ Hợp lệ' : '⚠ ' + (r.flags?.[0]||'Nghi vấn')}
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
  const rows = records.map((r,i) => [
    i+1, r.studentName, r.studentClass||'', r.studentSchool||'',
    r.category, r.level, r.minitest, r.date,
    r.score, r.correct, r.incorrect ?? r.total-r.correct-r.skipped,
    r.skipped, r.total, r.elapsedSec, r.tabSwitches, r.clicks ?? 0,
    (r.avgSecPerQ||0).toFixed(1), r.timedOut?'Có':'Không',
    r.integrityOk?'Hợp lệ':'Nghi vấn', (r.flags||[]).join('; ')
  ]);

  const csv  = [h, ...rows].map(row =>
    row.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')
  ).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' });
  const a    = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `EduQuiz_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmtTime(s) {
  const sec = s || 0;
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}

/* ============================================================
   BACK TO LOBBY
   ============================================================ */
function backToLobby() {
  clearInterval(State.timer);
  document.getElementById('result').style.display = 'none';
  document.getElementById('lobby').style.display  = 'flex';
}

/* ============================================================
   CONFETTI
   ============================================================ */
function launchConfetti() {
  const COLORS = ['#6c63ff','#00d4aa','#ffd166','#ff6b6b','#06d6a0','#f4845f'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText =
        `left:${Math.random()*100}vw;` +
        `width:${6+Math.random()*8}px;height:${10+Math.random()*14}px;` +
        `background:${COLORS[Math.floor(Math.random()*COLORS.length)]};` +
        `animation-duration:${1.5+Math.random()*2}s;` +
        `animation-delay:${Math.random()*.5}s;` +
        `transform:rotate(${Math.random()*360}deg)`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }, i * 30);
  }
}

/* ============================================================
   UTILS
   ============================================================ */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function animatePick(el) {
  el.style.transform = 'scale(0.97) translateX(3px)';
  setTimeout(() => el.style.transform = '', 150);
}

/* ============================================================
   DEMO DATA (fallback when quiz_data.json not found)
   ============================================================ */
const DEMO_DATA = {
  categories:[{
    id:'DEMO',name:'Demo – IC3',
    levels:[{
      id:'LV1',name:'Level 1 – Demo',grade:'K6',
      minitests:{'Demo Test':[
        {id:1,type:'single',image:false,
          question:'Đâu là hệ điều hành phổ biến nhất trên máy tính để bàn?',
          options:['Android','iOS','Windows','ChromeOS'],correct:['Windows']},
        {id:2,type:'multi',image:false,
          question:'Chọn 2 trình duyệt web phổ biến: (Chọn 2)',
          options:['Microsoft Word','Google Chrome','Firefox','Notepad'],
          correct:['Google Chrome','Firefox']},
        {id:3,type:'truefalse',image:false,
          question:'Với mỗi phát biểu hãy chọn Đúng hoặc Sai:',
          statements:[
            {text:'Email là viết tắt của Electronic Mail',answer:'true'},
            {text:'RAM là bộ nhớ không mất khi tắt máy',answer:'false'}
          ],label_true:'ĐÚNG',label_false:'SAI'},
        {id:4,type:'matching',image:false,
          question:'Nối hệ điều hành với công ty phát triển:',
          pairs:[
            {left:'Windows',right:'Microsoft'},
            {left:'iOS',right:'Apple'},
            {left:'Android',right:'Google'}
          ]}
      ]}
    }]
  }]
};

/* ============================================================
   📡 GOOGLE SHEET INTEGRATION MODULE
   ============================================================ */

// ── ⚙️ CẤU HÌNH – CHỈ CẦN SỬA 1 DÒNG NÀY ──────────────────
// Dán URL Google Apps Script Web App vào đây sau khi deploy
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbylcTLKJ29VRcPeHgdVZ5qfsfqPnxg0WYM0Af35f6yUYtEmIEg0YjGreh0wtkI-2xZXBg/exec';
const REQUEST_TIMEOUT_MS = 10000;  // Timeout 10 giây

// Tập hợp các bài đã nộp (chống gửi trùng phía client)
const _submittedIds = new Set();

// Tạo ID độc nhất cho mỗi lần nộp
function generateSubmissionId(studentName, testName) {
  let hash = 0;
  const base = `${studentName}__${testName}__${Date.now()}`;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `sub_${Math.abs(hash)}_${Date.now()}`;
}

// Hiển thị toast notification ở góc trên bên phải
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
    success: { bg:'#1b5e20', border:'#4caf50' },
    error:   { bg:'#7f0000', border:'#f44336' },
    warning: { bg:'#bf360c', border:'#ff9800' },
    info:    { bg:'#0d47a1', border:'#2196f3' }
  };
  const c = colors[type] || colors.info;
  const toast = document.createElement('div');
  toast.style.cssText =
    `background:${c.bg};border:1px solid ${c.border};border-left:4px solid ${c.border};` +
    'color:#fff;padding:12px 18px;border-radius:10px;' +
    "font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;" +
    'max-width:360px;box-shadow:0 4px 20px rgba(0,0,0,.5);pointer-events:auto;' +
    'cursor:pointer;opacity:0;transform:translateX(40px);' +
    'transition:opacity .3s ease,transform .3s ease;line-height:1.5;';
  toast.textContent = message;
  toast.onclick = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
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

// Hàm chính: Gửi dữ liệu bài thi lên Google Sheet
async function saveToGoogleSheet(data) {
  console.log('📡 [GoogleSheet] Bắt đầu gửi dữ liệu...', data);

  // Kiểm tra URL đã cấu hình chưa
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('PASTE_YOUR')) {
    console.warn('⚠️ [GoogleSheet] Chưa cấu hình APPS_SCRIPT_URL – bỏ qua gửi online');
    return { success: false, message: 'URL chưa cấu hình' };
  }

  // Chống gửi trùng phía client
  const clientKey = `${data.studentName}__${data.testName}`;
  if (_submittedIds.has(clientKey)) {
    console.warn('⚠️ [GoogleSheet] Đã gửi bài này rồi, bỏ qua');
    showNotification('ℹ️ Bài thi đã được lưu trước đó.', 'info');
    return { success: true, message: 'Duplicate' };
  }

  // Chuẩn bị payload
  const payload = {
    submissionId:  generateSubmissionId(data.studentName, data.testName),
    studentName:   data.studentName   || 'Ẩn danh',
    studentClass:  data.studentClass  || '',
    studentSchool: data.studentSchool || '',
    testName:      data.testName      || 'Không rõ',
    score:         data.score         ?? 0,
    correct:       data.correct       || '0/0',
    time:          data.time          || '00:00',
    tabSwitch:     data.tabSwitch     ?? 0,
    clickCount:    data.clickCount    ?? 0,
    status:        data.status        || 'OK',
    timestamp:     data.timestamp     || new Date().toLocaleString('vi-VN'),
    note:          data.note          || ''
  };

  console.log('📦 [GoogleSheet] Payload:', payload);

  // Thiết lập timeout
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      signal: controller.signal,
      body:   JSON.stringify(payload)
    });
    clearTimeout(tid);

    console.log('📬 [GoogleSheet] HTTP Status:', response.status);
    const text = await response.text();
    console.log('📄 [GoogleSheet] Response:', text.slice(0, 300));

    let result;
    try { result = JSON.parse(text); }
    catch { throw new Error('Response không phải JSON hợp lệ'); }

    if (result.success) {
      _submittedIds.add(clientKey);
      console.log('✅ [GoogleSheet] Lưu thành công!');
      showNotification('✅ Đã lưu kết quả lên Google Sheet!', 'success');
      return { success: true };
    } else {
      console.error('❌ [GoogleSheet] Lỗi từ server:', result.error);
      showNotification('❌ Lỗi lưu kết quả: ' + (result.error || 'Không rõ'), 'error');
      return { success: false };
    }

  } catch (err) {
    clearTimeout(tid);
    if (err.name === 'AbortError') {
      showNotification('⏱️ Kết nối quá chậm. Kết quả đã lưu offline.', 'warning');
    } else if (!navigator.onLine) {
      showNotification('📵 Mất mạng. Kết quả đã lưu offline.', 'warning');
    } else {
      showNotification('❌ Không thể lưu online. Kết quả vẫn có trong máy.', 'error');
    }
    console.error('❌ [GoogleSheet] Lỗi:', err.message);
    return { success: false, message: err.message };
  }
}

// Hàm tích hợp: Đọc từ State.session và gọi saveToGoogleSheet
async function submitToGoogleSheet(result, elapsedSec, integrity) {
  const s   = State.session;
  const pct = Math.round((result.correct / result.total) * 100);
  const mm  = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss2 = String(elapsedSec % 60).padStart(2, '0');

  await saveToGoogleSheet({
    studentName:   s.studentName,
    studentClass:  s.studentClass  || '',
    studentSchool: s.studentSchool || '',
    testName:      [s.category, s.level, s.minitest].filter(Boolean).join(' > '),
    score:         pct,
    correct:       `${result.correct}/${result.total}`,
    time:          `${mm}:${ss2}`,
    tabSwitch:     integrity.tabSwitches,
    clickCount:    integrity.clicks,
    status:        integrity.valid ? 'OK' : 'Nghi van: ' + (integrity.flags[0] || ''),
    timestamp:     new Date().toLocaleString('vi-VN'),
    note:          integrity.timedOut ? 'Het gio' : ''
  });
}

/* ============================================================
   DARK / LIGHT MODE TOGGLE
   ============================================================ */
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const icon = next === 'dark' ? '☀️' : '🌙';
  ['themeToggle','themeToggleExam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });
  try { localStorage.setItem('eduquiz_theme', next); } catch {}
}

// Apply saved theme on load
(function() {
  let saved = 'light';
  try { saved = localStorage.getItem('eduquiz_theme') || 'light'; } catch {}
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.addEventListener('DOMContentLoaded', () => {
      ['themeToggle','themeToggleExam'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '☀️';
      });
    });
  }
})();

/* BOOT */
loadData();
