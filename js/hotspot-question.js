/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   HOTSPOT QUESTION COMPONENT — Vanilla JS, tự chứa, dễ tích hợp   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Xử lý trọn vẹn 1 câu hỏi "bấm vào điểm/ vùng trên ảnh":
 *   - Có vùng đúng (Correct Hotspot) VÀ vùng nhiễu (Distractor Hotspot).
 *   - Click vùng nào → highlight vùng đó (chọn lại thì đổi highlight).
 *   - Bấm "Nộp bài" → khoá tương tác, tô xanh vùng đúng đã chọn / tô đỏ
 *     vùng sai đã chọn + viền xanh vùng đúng thật sự, cảnh báo nếu
 *     chưa chọn gì.
 *
 * Kiến trúc: 3 phần tách biệt rõ ràng theo yêu cầu:
 *   § RENDER   — dựng DOM (ảnh nền + các vùng hotspot theo %)
 *   § EVENTS   — xử lý click chọn/đổi vùng
 *   § CHECK    — chấm điểm khi Submit + tô màu kết quả
 *
 * ──────────────────────────────────────────────────────────────────
 * CẤU TRÚC DỮ LIỆU CÂU HỎI (đúng theo yêu cầu):
 * ──────────────────────────────────────────────────────────────────
 * {
 *   imagePath: "img/calendar-share.png",
 *   question: "Bấm vào biểu tượng chia sẻ lịch",   // tuỳ chọn, hiển thị phía trên ảnh
 *   hotspots: [
 *     {
 *       id: "h1",                 // ID/tên vùng — bắt buộc, duy nhất trong câu hỏi
 *       shape: "rect",            // "rect" | "oval" | "circle"
 *       // rect/oval dùng x, y, width, height (đơn vị %, góc trên-trái ảnh):
 *       x: 54.2, y: 3.9, width: 6.6, height: 19.1,
 *       // circle dùng x, y (tâm, %) + radius (%):
 *       // x: 50, y: 50, radius: 6,
 *       isCorrect: true            // true = đáp án đúng, false = vùng nhiễu
 *     },
 *     { id: "h2", shape: "rect", x: 10, y: 60, width: 12, height: 8, isCorrect: false },
 *     { id: "h3", shape: "circle", x: 80, y: 30, radius: 5, isCorrect: false }
 *   ]
 * }
 *
 * ──────────────────────────────────────────────────────────────────
 * CÁCH DÙNG:
 * ──────────────────────────────────────────────────────────────────
 *   const hs = createHotspotQuestion(
 *     document.getElementById('hotspotContainer'),
 *     questionData,
 *     { onSubmit: (result) => console.log(result) }
 *   );
 *   // ... người dùng bấm nút Nộp bài của bạn ...
 *   hs.submit();          // chấm điểm + tô màu kết quả
 *   hs.reset();           // làm lại câu hỏi (bỏ chọn, xoá màu kết quả)
 *   hs.getSelectedId();   // id vùng đang được chọn (hoặc null)
 * ────────────────────────────────────────────────────────────────── */

'use strict';

/* ============================================================
   § RENDER — dựng giao diện ảnh + các vùng hotspot theo %
   ============================================================ */

/**
 * Dựng DOM cho 1 câu hỏi hotspot vào trong `container`.
 * Toạ độ/kích thước dùng % nên tự responsive theo kích thước thực tế
 * của ảnh — không cần tính lại khi resize màn hình vì % luôn bám theo
 * wrapper (div bọc ảnh, width:100%, height theo tỉ lệ ảnh gốc).
 */
function _renderHotspotDOM(container, data) {
  container.innerHTML = '';
  container.classList.add('hsq-container');

  if (data.question) {
    const qEl = document.createElement('div');
    qEl.className = 'hsq-question-text';
    qEl.textContent = data.question;
    container.appendChild(qEl);
  }

  const wrap = document.createElement('div');
  wrap.className = 'hsq-image-wrap';

  const img = document.createElement('img');
  img.src = data.imagePath;
  img.alt = data.question || 'Hotspot question image';
  img.loading = 'lazy';
  img.draggable = false;
  wrap.appendChild(img);

  const hotspotEls = new Map(); // id → element (để EVENTS/CHECK truy cập nhanh, không query lại DOM)

  (data.hotspots || []).forEach(hs => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `hsq-hotspot hsq-shape-${hs.shape || 'rect'}`;
    el.dataset.id = hs.id;
    el.setAttribute('aria-label', `Vùng chọn ${hs.id}`);

    _positionHotspotEl(el, hs);

    wrap.appendChild(el);
    hotspotEls.set(hs.id, el);
  });

  const warnEl = document.createElement('div');
  warnEl.className = 'hsq-warning';
  warnEl.hidden = true;
  warnEl.textContent = '⚠ Vui lòng chọn một vùng trên hình trước khi nộp bài.';

  container.appendChild(wrap);
  container.appendChild(warnEl);

  return { wrap, img, hotspotEls, warnEl };
}

/** Đặt style vị trí/kích thước (%) cho 1 phần tử hotspot theo shape. */
function _positionHotspotEl(el, hs) {
  if (hs.shape === 'circle') {
    const r = hs.radius ?? 5;
    el.style.left   = `${hs.x - r}%`;
    el.style.top    = `${hs.y - r}%`;
    el.style.width  = `${r * 2}%`;
    el.style.height = `${r * 2}%`;
  } else {
    // rect & oval đều dùng x/y (góc trên-trái) + width/height
    el.style.left   = `${hs.x}%`;
    el.style.top    = `${hs.y}%`;
    el.style.width  = `${hs.width}%`;
    el.style.height = `${hs.height}%`;
  }
}

/* ============================================================
   § EVENTS — xử lý click chọn / đổi vùng highlight
   ============================================================ */

function _attachEvents(instance) {
  instance.hotspotEls.forEach((el, id) => {
    el.addEventListener('click', () => {
      if (instance.submitted) return; // đã nộp bài → khoá tương tác

      // Bỏ highlight vùng đang chọn trước đó (nếu có) rồi highlight vùng mới.
      if (instance.selectedId && instance.selectedId !== id) {
        instance.hotspotEls.get(instance.selectedId)?.classList.remove('hsq-selected');
      }
      const alreadySelected = instance.selectedId === id;
      instance.selectedId = alreadySelected ? null : id; // bấm lại vùng đang chọn → bỏ chọn
      el.classList.toggle('hsq-selected', !alreadySelected);

      instance.warnEl.hidden = true;
      instance.options.onSelect?.(instance.selectedId);
    });
  });
}

/* ============================================================
   § CHECK — chấm điểm khi Submit + tô màu kết quả
   ============================================================ */

function _checkAnswer(instance) {
  if (instance.submitted) return instance.lastResult; // tránh chấm 2 lần

  if (!instance.selectedId) {
    instance.warnEl.hidden = false;
    return { submitted: false, warning: 'no-selection' };
  }

  instance.warnEl.hidden = true;

  const selectedHs = instance.data.hotspots.find(h => h.id === instance.selectedId);
  const correctHs  = instance.data.hotspots.find(h => h.isCorrect);
  const isCorrect  = !!selectedHs?.isCorrect;

  const selectedEl = instance.hotspotEls.get(instance.selectedId);

  if (isCorrect) {
    selectedEl.classList.add('hsq-correct');
  } else {
    selectedEl.classList.add('hsq-incorrect');
    // Hiện đáp án đúng bằng viền xanh, kể cả khi học sinh không chọn nó.
    const correctEl = correctHs ? instance.hotspotEls.get(correctHs.id) : null;
    correctEl?.classList.add('hsq-reveal-correct');
  }

  instance.submitted = true;
  instance.hotspotEls.forEach(el => el.classList.add('hsq-locked'));

  const result = {
    submitted: true,
    isCorrect,
    selectedId: instance.selectedId,
    correctId: correctHs?.id ?? null,
  };
  instance.lastResult = result;
  instance.options.onSubmit?.(result);
  return result;
}

/* ============================================================
   § PUBLIC API
   ============================================================ */

/**
 * Tạo 1 instance câu hỏi hotspot gắn vào `container`.
 * @param {HTMLElement} container - phần tử DOM chứa câu hỏi
 * @param {Object} data - dữ liệu câu hỏi (xem cấu trúc phía trên)
 * @param {Object} [options]
 * @param {(id:string|null)=>void} [options.onSelect] - gọi mỗi khi đổi vùng chọn
 * @param {(result:Object)=>void}  [options.onSubmit] - gọi sau khi chấm điểm
 */
function createHotspotQuestion(container, data, options = {}) {
  if (!container) throw new Error('[HotspotQuestion] Thiếu container.');
  if (!data?.imagePath || !Array.isArray(data.hotspots) || data.hotspots.length === 0) {
    throw new Error('[HotspotQuestion] Dữ liệu câu hỏi không hợp lệ (thiếu imagePath hoặc hotspots).');
  }

  const instance = {
    container,
    data,
    options,
    selectedId: null,
    submitted: false,
    lastResult: null,
  };

  const { wrap, img, hotspotEls, warnEl } = _renderHotspotDOM(container, data);
  Object.assign(instance, { wrap, img, hotspotEls, warnEl });

  _attachEvents(instance);

  return {
    /** Chấm điểm vùng đang chọn + tô màu kết quả. Trả về { submitted, isCorrect, selectedId, correctId }. */
    submit: () => _checkAnswer(instance),
    /** Id vùng đang được highlight (chưa nộp bài), hoặc null nếu chưa chọn gì. */
    getSelectedId: () => instance.selectedId,
    /** Đã nộp bài / chấm điểm cho câu này chưa. */
    isSubmitted: () => instance.submitted,
    /** Làm lại câu hỏi: bỏ chọn, xoá toàn bộ trạng thái/màu kết quả, mở khoá tương tác. */
    reset: () => {
      instance.selectedId = null;
      instance.submitted  = false;
      instance.lastResult = null;
      instance.warnEl.hidden = true;
      instance.hotspotEls.forEach(el => {
        el.classList.remove('hsq-selected', 'hsq-correct', 'hsq-incorrect', 'hsq-reveal-correct', 'hsq-locked');
      });
    },
    /** Huỷ, gỡ nội dung khỏi container (dùng khi chuyển sang câu hỏi khác). */
    destroy: () => { container.innerHTML = ''; },
  };
}

// Cho phép dùng cả kiểu module lẫn gắn thẳng vào window (script thường, giống các file js/ khác trong dự án)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createHotspotQuestion };
} else {
  window.createHotspotQuestion = createHotspotQuestion;
}
