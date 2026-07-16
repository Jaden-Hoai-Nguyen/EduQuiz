/* ============================================================
   js/image-manager.js
   Công cụ quản lý CÂU HỎI + HÌNH ẢNH cho EduQuiz IC3.
   Nguồn dữ liệu: Firebase Firestore, collection "questions"
   (mỗi document = 1 câu hỏi, id document = uid câu hỏi, vd "thcs__k6__mt1__q1").

   Mọi thao tác Thêm / Xoá / Sửa (dữ liệu lẫn ảnh) đều ghi thẳng lên
   Firestore ngay khi người dùng bấm nút tương ứng — không cần bước
   "xuất file" như bản cũ. Yêu cầu đăng nhập vai trò admin/teacher
   (xem js/auth-guard.js, khai báo ở image-manager.html).
   ============================================================ */

const COMMON_KEYS = ['id','uid','question','type','image','imageUrl','image_file','image_id','catName','gradeName','minitestName'];
const TYPE_TEMPLATES = {
  single:    { options: ['', ''], correct: [] },
  multi:     { options: ['', ''], correct: [] },
  matching:  { pairs: [{ left: '', right: '' }] },
  truefalse: { statements: [{ text: '', answer: 'true' }], label_true: 'ĐÚNG', label_false: 'SAI' },
};

/* ============================================================
   STATE
   ============================================================ */
let QUESTIONS = [];       // flat list: { q, docId }
let usedPictureNums = new Set();
let nextPictureCounter = 1;

const PAGE_SIZE = 20;
let currentPage = 1;
let filtered = [];

const state = { search: '', grade: '', minitest: '', status: '' };

function db() { return window.EduFirebase.db; }
function colRef() { return db().collection('questions'); }

/* ============================================================
   BOOT — chờ auth-guard xác nhận đăng nhập rồi mới tải dữ liệu
   ============================================================ */
window.addEventListener('edu:ready', ({ detail }) => {
  const { user, profile } = detail;
  document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
  loadFromFirestore();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await EduAuth.logoutUser();
  window.location.href = 'login.html';
});

async function loadFromFirestore() {
  document.getElementById('loadState').style.display = 'block';
  document.getElementById('loadState').textContent = '⏳ Đang tải dữ liệu câu hỏi từ Firebase…';
  document.getElementById('app').style.display = 'none';
  document.getElementById('migrateBox').style.display = 'none';
  try {
    const snap = await colRef().get();
    if (snap.empty) {
      document.getElementById('loadState').style.display = 'none';
      const isAdmin = window.EduCurrentProfile && window.EduCurrentProfile.role === 'admin';
      if (isAdmin) {
        document.getElementById('migrateBox').style.display = 'block';
      } else {
        document.getElementById('loadState').style.display = 'block';
        document.getElementById('loadState').textContent = 'Chưa có dữ liệu câu hỏi trên Firebase. Hãy nhờ quản trị viên nhập dữ liệu ban đầu.';
      }
      return;
    }
    QUESTIONS = snap.docs.map(doc => ({ q: doc.data(), docId: doc.id }));
    scanUsedPictureNumbers();
    document.getElementById('loadState').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    buildFilterOptions();
    applyFilters();
  } catch (err) {
    console.error(err);
    document.getElementById('loadState').textContent = '⚠️ Lỗi tải dữ liệu từ Firebase: ' + err.message;
  }
}

/* ============================================================
   MIGRATE quiz_data.json → Firestore (chỉ admin, 1 lần)
   ============================================================ */
document.getElementById('migrateBtn').addEventListener('click', async () => {
  if (!confirm('Nhập toàn bộ câu hỏi từ quiz_data.json vào Firebase? Chỉ nên làm việc này 1 lần.')) return;
  const btn = document.getElementById('migrateBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Đang nhập dữ liệu...';
  try {
    const res = await fetch('quiz_data.json');
    if (!res.ok) throw new Error('Không tải được quiz_data.json');
    const data = await res.json();
    const flat = [];
    (data.categories || []).forEach(cat => {
      (cat.levels || []).forEach(lvl => {
        const mts = lvl.minitests || {};
        Object.keys(mts).forEach(mtName => {
          (mts[mtName] || []).forEach(q => {
            const docId = q.uid || `${cat.id || cat.name}__${lvl.grade || lvl.id}__${mtName}__q${q.id}`.replace(/\s+/g, '_');
            flat.push({
              docId,
              data: Object.assign({}, q, {
                uid: docId,
                catName: cat.name || cat.id || '',
                gradeName: lvl.name || lvl.grade || lvl.id || '',
                minitestName: mtName,
              }),
            });
          });
        });
      });
    });

    let done = 0;
    for (let i = 0; i < flat.length; i += 450) {
      const batch = db().batch();
      flat.slice(i, i + 450).forEach(item => {
        batch.set(colRef().doc(item.docId), item.data);
      });
      await batch.commit();
      done += Math.min(450, flat.length - i);
      btn.textContent = `⏳ Đã nhập ${done}/${flat.length}...`;
    }
    toast(`✅ Đã nhập ${flat.length} câu hỏi lên Firebase`);
    loadFromFirestore();
  } catch (err) {
    console.error(err);
    toast('❌ Lỗi nhập dữ liệu: ' + err.message, 5000);
    btn.disabled = false;
    btn.textContent = '📥 Nhập dữ liệu từ quiz_data.json';
  }
});

function scanUsedPictureNumbers() {
  usedPictureNums = new Set();
  QUESTIONS.forEach(({ q }) => {
    const id = q.image_id || '';
    const m = /^Upload(\d+)$/.exec(id);
    if (m) usedPictureNums.add(parseInt(m[1], 10));
  });
  let n = 1;
  while (usedPictureNums.has(n)) n++;
  nextPictureCounter = n;
}
function claimNextPictureNumber() {
  let n = nextPictureCounter;
  while (usedPictureNums.has(n)) n++;
  usedPictureNums.add(n);
  nextPictureCounter = n + 1;
  return n;
}

/* ============================================================
   FILTER OPTIONS
   ============================================================ */
function buildFilterOptions() {
  const grades = [...new Set(QUESTIONS.map(x => x.q.gradeName).filter(Boolean))];
  const gSel = document.getElementById('gradeFilter');
  gSel.innerHTML = '<option value="">Tất cả khối</option>' +
    grades.map(g => `<option value="${escAttr(g)}">${esc(g)}</option>`).join('');

  const mts = [...new Set(QUESTIONS.map(x => x.q.minitestName).filter(Boolean))];
  const mSel = document.getElementById('minitestFilter');
  mSel.innerHTML = '<option value="">Tất cả Minitest</option>' +
    mts.map(m => `<option value="${escAttr(m)}">${esc(m)}</option>`).join('');
}

function questionStatus(q) {
  if (q.imageUrl) return 'have';
  if (q.image === true) return 'need';
  return 'skip';
}

/* ============================================================
   FILTER + RENDER
   ============================================================ */
function applyFilters() {
  const s = state.search.trim().toLowerCase();
  filtered = QUESTIONS.filter(item => {
    if (state.grade && item.q.gradeName !== state.grade) return false;
    if (state.minitest && item.q.minitestName !== state.minitest) return false;
    if (state.status && questionStatus(item.q) !== state.status) return false;
    if (s && !(item.q.question || '').toLowerCase().includes(s)) return false;
    return true;
  });
  currentPage = 1;
  renderStats();
  renderList();
}

function renderStats() {
  let need = 0, have = 0, skip = 0;
  QUESTIONS.forEach(({ q }) => {
    const st = questionStatus(q);
    if (st === 'need') need++;
    else if (st === 'have') have++;
    else skip++;
  });
  document.getElementById('statTotal').textContent = QUESTIONS.length;
  document.getElementById('statNeed').textContent = need;
  document.getElementById('statHave').textContent = have;
  document.getElementById('statSkip').textContent = skip;
}

function renderList() {
  const list = document.getElementById('qlist');
  const empty = document.getElementById('emptyState');
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  document.getElementById('pageInfo').textContent =
    filtered.length ? `Trang ${currentPage}/${totalPages} — ${filtered.length} câu` : 'Không có kết quả';
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;

  if (!pageItems.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = pageItems.map(item => renderCard(item)).join('');
  pageItems.forEach(item => wireCard(item));
}

/* ============================================================
   CARD RENDER — chỉnh được toàn bộ dữ liệu, không chỉ ảnh
   ============================================================ */
function extraFieldsOf(q) {
  const out = {};
  Object.keys(q).forEach(k => { if (!COMMON_KEYS.includes(k)) out[k] = q[k]; });
  return out;
}

function renderCard(item) {
  const { q, docId } = item;
  const status = questionStatus(q);
  const tagHtml = status === 'have'
    ? '<span class="qtag have">✅ Đã có ảnh</span>'
    : status === 'need'
      ? '<span class="qtag need">🟡 Cần ảnh</span>'
      : '<span class="qtag skip">— Không cần</span>';

  const imgHtml = q.imageUrl
    ? `<img src="${escAttr(q.imageUrl)}" alt="preview">`
    : `<div class="qimg-placeholder">🖼️</div>`;
  const fname = q.image_file ? `<div class="fname">${esc(q.image_file)}</div>` : '';

  const isStructured = q.type === 'single' || q.type === 'multi';
  const options = Array.isArray(q.options) ? q.options : [];
  const correct = Array.isArray(q.correct) ? q.correct : [];

  const optionsHtml = options.map((opt, i) => `
    <div class="opt-row" data-opt-idx="${i}">
      <input type="${q.type === 'multi' ? 'checkbox' : 'radio'}" class="optCorrect" name="correct-${docId}" ${correct.includes(opt) ? 'checked' : ''}>
      <input type="text" class="optText" value="${escAttr(opt)}" placeholder="Nội dung lựa chọn ${i + 1}">
      <button type="button" class="removeOptBtn" title="Xoá lựa chọn">✕</button>
    </div>`).join('');

  const extraObj = extraFieldsOf(q);
  const advJson = esc(JSON.stringify(extraObj, null, 2));

  return `
  <div class="qcard" data-docid="${escAttr(docId)}">
    <div class="qimg-area" id="imgArea-${escAttr(docId)}">
      ${imgHtml}
      ${fname}
    </div>
    <div class="qbody">
      <div class="qmeta-edit">
        <input class="metaInput" data-field="catName" value="${escAttr(q.catName || '')}" placeholder="Danh mục">
        <input class="metaInput" data-field="gradeName" value="${escAttr(q.gradeName || '')}" placeholder="Khối/Lớp">
        <input class="metaInput" data-field="minitestName" value="${escAttr(q.minitestName || '')}" placeholder="Minitest">
      </div>
      <textarea class="questionInput" placeholder="Nội dung câu hỏi...">${esc(q.question || '')}</textarea>
      <select class="typeSelect">
        <option value="single" ${q.type === 'single' ? 'selected' : ''}>Chọn 1 đáp án</option>
        <option value="multi" ${q.type === 'multi' ? 'selected' : ''}>Chọn nhiều đáp án</option>
        <option value="matching" ${q.type === 'matching' ? 'selected' : ''}>Nối cặp (matching)</option>
        <option value="truefalse" ${q.type === 'truefalse' ? 'selected' : ''}>Đúng / Sai</option>
      </select>

      <div class="optionsEditor" style="${isStructured ? '' : 'display:none'}">
        ${optionsHtml}
        <button type="button" class="addOptBtn">➕ Thêm lựa chọn</button>
      </div>

      <button type="button" class="advToggle">${isStructured ? '🛠️ Sửa dữ liệu nâng cao (JSON)' : '🛠️ Sửa dữ liệu (JSON) — loại câu hỏi này chỉnh qua đây'}</button>
      <div class="advBox ${isStructured ? '' : 'open'}">
        <textarea class="advTextarea" spellcheck="false">${advJson}</textarea>
      </div>

      <div class="qbreadcrumb"><span>Câu ${esc(q.id ?? '?')}</span><span>${esc(docId)}</span></div>
      ${tagHtml}

      <div class="qactions">
        <label class="upload-label">
          📤 Tải ảnh lên
          <input type="file" accept="image/*" class="fileInput">
        </label>
        ${q.imageUrl ? `<button type="button" class="btn btn-danger btn-sm removeImgBtn">🗑️ Xoá ảnh</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm toggleSkipBtn">
          ${status === 'skip' ? '➕ Đánh dấu cần minh hoạ' : '🚫 Không cần minh hoạ'}
        </button>
        <button type="button" class="btn saveBtn btn-sm saveQBtn">💾 Lưu câu hỏi</button>
        <button type="button" class="btn btn-danger btn-sm deleteQBtn">🗑️ Xoá câu hỏi</button>
      </div>
      <div class="url-row">
        <input type="text" class="urlInput" placeholder="...hoặc dán link ảnh (URL) rồi nhấn Enter" value="${q.imageUrl && !q.imageUrl.startsWith('data:') && !q.imageUrl.startsWith('img/') ? escAttr(q.imageUrl) : ''}">
      </div>
      <div class="pending-box" style="display:none"></div>
    </div>
  </div>`;
}

function wireCard(item) {
  const { q, docId } = item;
  const card = document.querySelector(`.qcard[data-docid="${cssEsc(docId)}"]`);
  if (!card) return;

  const fileInput = card.querySelector('.fileInput');
  fileInput.addEventListener('change', (e) => onFilePicked(item, e.target.files[0]));

  const removeImgBtn = card.querySelector('.removeImgBtn');
  if (removeImgBtn) removeImgBtn.addEventListener('click', async () => {
    delete item.q.imageUrl;
    delete item.q.image_file;
    delete item.q.image_id;
    await persistQuestion(item, { imageUrl: firebase.firestore.FieldValue.delete(), image_file: firebase.firestore.FieldValue.delete(), image_id: firebase.firestore.FieldValue.delete() });
    renderStats();
    refreshCard(item);
    toast('Đã xoá ảnh của câu ' + (item.q.id ?? ''));
  });

  const toggleBtn = card.querySelector('.toggleSkipBtn');
  toggleBtn.addEventListener('click', async () => {
    const st = questionStatus(item.q);
    const patch = {};
    if (st === 'skip') {
      item.q.image = true;
      patch.image = true;
    } else {
      item.q.image = false;
      delete item.q.imageUrl; delete item.q.image_file; delete item.q.image_id;
      patch.image = false;
      patch.imageUrl = firebase.firestore.FieldValue.delete();
      patch.image_file = firebase.firestore.FieldValue.delete();
      patch.image_id = firebase.firestore.FieldValue.delete();
    }
    await persistQuestion(item, patch);
    renderStats();
    refreshCard(item);
  });

  const urlInput = card.querySelector('.urlInput');
  urlInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const val = urlInput.value.trim();
    if (!val) return;
    item.q.imageUrl = val;
    item.q.image = true;
    delete item.q.image_file; delete item.q.image_id;
    await persistQuestion(item, { imageUrl: val, image: true, image_file: firebase.firestore.FieldValue.delete(), image_id: firebase.firestore.FieldValue.delete() });
    renderStats();
    refreshCard(item);
    toast('Đã gắn ảnh từ URL cho câu ' + (item.q.id ?? ''));
  });

  // Options editor (single/multi)
  const optionsEditor = card.querySelector('.optionsEditor');
  wireOptionsEditor(optionsEditor, card, item.q.type);

  card.querySelector('.addOptBtn').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'opt-row';
    const type = card.querySelector('.typeSelect').value;
    row.innerHTML = `
      <input type="${type === 'multi' ? 'checkbox' : 'radio'}" class="optCorrect" name="correct-${docId}">
      <input type="text" class="optText" placeholder="Nội dung lựa chọn mới">
      <button type="button" class="removeOptBtn" title="Xoá lựa chọn">✕</button>`;
    optionsEditor.insertBefore(row, card.querySelector('.addOptBtn'));
    wireOptRow(row, card);
  });

  // Type select toggles which editor shows
  const typeSelect = card.querySelector('.typeSelect');
  const advBox = card.querySelector('.advBox');
  const advToggleBtn = card.querySelector('.advToggle');
  typeSelect.addEventListener('change', () => {
    const t = typeSelect.value;
    const structured = t === 'single' || t === 'multi';
    optionsEditor.style.display = structured ? '' : 'none';
    if (!structured) {
      advBox.classList.add('open');
      const ta = advBox.querySelector('.advTextarea');
      if (!ta.value.trim() || ta.value.trim() === '{}') {
        ta.value = JSON.stringify(TYPE_TEMPLATES[t] || {}, null, 2);
      }
    }
    advToggleBtn.textContent = structured ? '🛠️ Sửa dữ liệu nâng cao (JSON)' : '🛠️ Sửa dữ liệu (JSON) — loại câu hỏi này chỉnh qua đây';
  });

  advToggleBtn.addEventListener('click', () => advBox.classList.toggle('open'));

  card.querySelector('.saveQBtn').addEventListener('click', () => saveCardData(item, card));
  card.querySelector('.deleteQBtn').addEventListener('click', () => deleteQuestion(item));
}

function wireOptionsEditor(container, card) {
  container.querySelectorAll('.opt-row').forEach(row => wireOptRow(row, card));
}
function wireOptRow(row, card) {
  row.querySelector('.removeOptBtn').addEventListener('click', () => row.remove());
  const typeSelect = card.querySelector('.typeSelect');
  const radioLike = row.querySelector('.optCorrect');
  if (typeSelect.value === 'single') {
    radioLike.addEventListener('change', () => {
      card.querySelectorAll('.optCorrect').forEach(cb => { if (cb !== radioLike) cb.checked = false; });
    });
  }
}

function refreshCard(item) {
  const card = document.querySelector(`.qcard[data-docid="${cssEsc(item.docId)}"]`);
  if (!card) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = renderCard(item).trim();
  card.replaceWith(wrap.firstElementChild);
  wireCard(item);
}

/* ============================================================
   SAVE (Thêm/Sửa) — ghi thẳng lên Firestore
   ============================================================ */
async function persistQuestion(item, patch) {
  try {
    await colRef().doc(item.docId).set(patch, { merge: true });
  } catch (err) {
    console.error(err);
    toast('❌ Lỗi lưu Firebase: ' + err.message, 4000);
  }
}

async function saveCardData(item, card) {
  const btn = card.querySelector('.saveQBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Đang lưu...';
  try {
    const catName = card.querySelector('[data-field="catName"]').value.trim();
    const gradeName = card.querySelector('[data-field="gradeName"]').value.trim();
    const minitestName = card.querySelector('[data-field="minitestName"]').value.trim();
    const question = card.querySelector('.questionInput').value.trim();
    const type = card.querySelector('.typeSelect').value;

    const patch = { catName, gradeName, minitestName, question, type };
    const localPatch = { catName, gradeName, minitestName, question, type };
    const deleteKeys = []; // field cần xoá khỏi cả Firestore lẫn bản sao cục bộ

    if (type === 'single' || type === 'multi') {
      const rows = [...card.querySelectorAll('.opt-row')];
      const options = rows.map(r => r.querySelector('.optText').value.trim()).filter(Boolean);
      const correct = rows
        .filter(r => r.querySelector('.optCorrect').checked)
        .map(r => r.querySelector('.optText').value.trim())
        .filter(Boolean);
      if (!options.length) throw new Error('Cần ít nhất 1 lựa chọn');
      if (!correct.length) throw new Error('Chưa chọn đáp án đúng');
      localPatch.options = options;
      localPatch.correct = correct;
      deleteKeys.push('pairs', 'statements', 'label_true', 'label_false');
    } else {
      const raw = card.querySelector('.advTextarea').value.trim() || '{}';
      let extra;
      try { extra = JSON.parse(raw); } catch (e) { throw new Error('JSON nâng cao không hợp lệ: ' + e.message); }
      Object.assign(localPatch, extra);
      deleteKeys.push('options', 'correct');
    }

    Object.assign(patch, localPatch);
    deleteKeys.forEach(k => { patch[k] = firebase.firestore.FieldValue.delete(); });

    await colRef().doc(item.docId).set(patch, { merge: true });

    // cập nhật bản sao cục bộ để card hiển thị đúng ngay sau khi lưu
    deleteKeys.forEach(k => delete item.q[k]);
    Object.assign(item.q, localPatch);

    toast('✅ Đã lưu câu ' + (item.q.id ?? '') + ' lên Firebase');
    refreshCard(item);
  } catch (err) {
    console.error(err);
    toast('❌ ' + err.message, 4500);
    btn.disabled = false;
    btn.textContent = '💾 Lưu câu hỏi';
  }
}

async function deleteQuestion(item) {
  if (!confirm('Xoá hẳn câu hỏi này khỏi Firebase? Không thể hoàn tác.')) return;
  try {
    await colRef().doc(item.docId).delete();
    QUESTIONS = QUESTIONS.filter(x => x.docId !== item.docId);
    applyFilters();
    toast('🗑️ Đã xoá câu hỏi khỏi Firebase');
  } catch (err) {
    console.error(err);
    toast('❌ Lỗi xoá: ' + err.message, 4000);
  }
}

/* ============================================================
   THÊM CÂU HỎI MỚI
   ============================================================ */
document.getElementById('addQuestionBtn').addEventListener('click', () => {
  const box = document.getElementById('newQuestionBox');
  if (box.innerHTML.trim()) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="new-q-form">
      <div class="row2">
        <input type="text" id="newCat" placeholder="Danh mục (vd: THCS – IC3 THCS)">
        <input type="text" id="newGrade" placeholder="Khối/Lớp (vd: Khối 6)" value="${escAttr(state.grade)}">
        <input type="text" id="newMinitest" placeholder="Minitest (vd: Minitest 1)" value="${escAttr(state.minitest)}">
      </div>
      <textarea class="questionInput" id="newQuestionText" placeholder="Nội dung câu hỏi mới..."></textarea>
      <select class="typeSelect" id="newType">
        <option value="single">Chọn 1 đáp án</option>
        <option value="multi">Chọn nhiều đáp án</option>
        <option value="matching">Nối cặp (matching)</option>
        <option value="truefalse">Đúng / Sai</option>
      </select>
      <div class="row2">
        <button type="button" class="btn btn-primary btn-sm" id="createQBtn">✅ Tạo câu hỏi (lưu lên Firebase)</button>
        <button type="button" class="btn btn-ghost btn-sm" id="cancelQBtn">Huỷ</button>
      </div>
    </div>`;

  document.getElementById('cancelQBtn').addEventListener('click', () => { box.innerHTML = ''; });

  document.getElementById('createQBtn').addEventListener('click', async () => {
    const btn = document.getElementById('createQBtn');
    const catName = document.getElementById('newCat').value.trim();
    const gradeName = document.getElementById('newGrade').value.trim();
    const minitestName = document.getElementById('newMinitest').value.trim();
    const question = document.getElementById('newQuestionText').value.trim();
    const type = document.getElementById('newType').value;
    if (!question) { toast('❌ Cần nhập nội dung câu hỏi'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Đang tạo...';
    try {
      const nextLocalId = (Math.max(0, ...QUESTIONS.map(x => Number(x.q.id) || 0)) + 1);
      const slug = (s) => (s || 'x').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const docId = `${slug(catName)}__${slug(gradeName)}__${slug(minitestName)}__q${nextLocalId}__${Date.now().toString(36)}`;

      const data = Object.assign({
        id: nextLocalId,
        uid: docId,
        question,
        type,
        image: false,
        catName, gradeName, minitestName,
      }, TYPE_TEMPLATES[type] || {});

      await colRef().doc(docId).set(data);
      QUESTIONS.push({ q: data, docId });
      scanUsedPictureNumbers();
      buildFilterOptions();
      applyFilters();
      box.innerHTML = '';
      toast('✅ Đã tạo câu hỏi mới và lưu lên Firebase');
    } catch (err) {
      console.error(err);
      toast('❌ Lỗi tạo câu hỏi: ' + err.message, 4000);
      btn.disabled = false;
      btn.textContent = '✅ Tạo câu hỏi (lưu lên Firebase)';
    }
  });
});

/* ============================================================
   FILE UPLOAD → PENDING CHOICE (base64 vs saved file) → lưu Firestore
   ============================================================ */
function onFilePicked(item, file) {
  if (!file) return;
  const card = document.querySelector(`.qcard[data-docid="${cssEsc(item.docId)}"]`);
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const num = claimNextPictureNumber();
    const suggested = `Upload${num}.${ext}`;

    const box = card.querySelector('.pending-box');
    box.style.display = 'flex';
    box.innerHTML = `
      <div class="row"><img src="${dataUrl}" style="max-height:90px;border-radius:8px" alt="new preview"></div>
      <div class="row" style="font-size:.75rem;color:var(--muted)">Chọn cách lưu ảnh cho câu này:</div>
      <div class="row">
        <button class="btn btn-green btn-sm embedBtn">✅ Nhúng trực tiếp (base64, lưu ngay lên Firebase)</button>
      </div>
      <div class="row">
        <input class="fname-edit" value="${suggested}">
        <button class="btn btn-primary btn-sm fileRefBtn">💾 Lưu thành file riêng + tải xuống</button>
      </div>
      <div class="row" style="font-size:.7rem;color:var(--muted)">
        Gợi ý: dùng "Lưu thành file riêng" cho ảnh lớn (giữ dữ liệu Firestore nhỏ gọn) — file tải về cần copy vào thư mục <code>img/</code> và deploy lại trang. Dùng "Nhúng trực tiếp" nếu muốn xong ngay, không cần thao tác thêm.
      </div>
    `;

    box.querySelector('.embedBtn').addEventListener('click', async () => {
      item.q.imageUrl = dataUrl;
      item.q.image = true;
      delete item.q.image_file; delete item.q.image_id;
      await persistQuestion(item, { imageUrl: dataUrl, image: true, image_file: firebase.firestore.FieldValue.delete(), image_id: firebase.firestore.FieldValue.delete() });
      box.style.display = 'none';
      renderStats();
      refreshCard(item);
      toast('✅ Đã nhúng ảnh (base64) và lưu lên Firebase cho câu ' + (item.q.id ?? ''));
    });

    box.querySelector('.fileRefBtn').addEventListener('click', async () => {
      const fnameInput = box.querySelector('.fname-edit');
      let fname = (fnameInput.value || suggested).trim();
      if (!/\.[a-z0-9]+$/i.test(fname)) fname += '.' + ext;
      const idOnly = fname.replace(/\.[a-z0-9]+$/i, '');

      item.q.imageUrl = 'img/' + fname;
      item.q.image_file = fname;
      item.q.image_id = idOnly;
      item.q.image = true;
      await persistQuestion(item, { imageUrl: 'img/' + fname, image_file: fname, image_id: idOnly, image: true });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();

      box.style.display = 'none';
      renderStats();
      refreshCard(item);
      toast(`✅ Đã lưu "${fname}" lên Firebase — nhớ copy file ảnh vào thư mục img/`);
    });
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   SAO LƯU JSON (không bắt buộc — chỉ để tải bản dự phòng)
   ============================================================ */
document.getElementById('backupBtn').addEventListener('click', () => {
  const root = { categories: [] };
  const catMap = new Map();
  QUESTIONS.forEach(({ q }) => {
    const catKey = q.catName || '(Chưa phân loại)';
    if (!catMap.has(catKey)) {
      const cat = { id: catKey, name: catKey, levels: [] };
      catMap.set(catKey, { cat, lvlMap: new Map() });
      root.categories.push(cat);
    }
    const { cat, lvlMap } = catMap.get(catKey);
    const gradeKey = q.gradeName || '(Chưa có khối)';
    if (!lvlMap.has(gradeKey)) {
      const lvl = { id: gradeKey, name: gradeKey, grade: gradeKey, minitests: {} };
      lvlMap.set(gradeKey, lvl);
      cat.levels.push(lvl);
    }
    const lvl = lvlMap.get(gradeKey);
    const mtKey = q.minitestName || 'Minitest 1';
    if (!lvl.minitests[mtKey]) lvl.minitests[mtKey] = [];
    const clone = Object.assign({}, q);
    delete clone.catName; delete clone.gradeName; delete clone.minitestName;
    lvl.minitests[mtKey].push(clone);
  });

  const json = JSON.stringify(root, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quiz_data_backup.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('✅ Đã tải bản sao lưu JSON');
});

/* ============================================================
   FILTER UI WIRING
   ============================================================ */
document.getElementById('searchBox').addEventListener('input', (e) => {
  state.search = e.target.value;
  applyFilters();
});
document.getElementById('gradeFilter').addEventListener('change', (e) => {
  state.grade = e.target.value;
  applyFilters();
});
document.getElementById('minitestFilter').addEventListener('change', (e) => {
  state.minitest = e.target.value;
  applyFilters();
});
document.querySelectorAll('#statusChips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#statusChips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.status = chip.dataset.status;
    applyFilters();
  });
});
document.getElementById('prevPage').addEventListener('click', () => { currentPage--; renderList(); });
document.getElementById('nextPage').addEventListener('click', () => { currentPage++; renderList(); });

/* ============================================================
   THEME
   ============================================================ */
const themeBtn = document.getElementById('themeToggle');
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
}
applyTheme(localStorage.getItem('ic3_theme') === 'dark' ? 'dark' : 'light');
themeBtn.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(isDark ? 'light' : 'dark');
  localStorage.setItem('ic3_theme', isDark ? 'light' : 'dark');
});

/* ============================================================
   UTIL
   ============================================================ */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escAttr(s) { return esc(s); }
function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

let toastTimer = null;
function toast(msg, duration) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration || 2600);
}
