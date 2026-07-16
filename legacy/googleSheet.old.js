/* ============================================================
   📡 googleSheet.js – Module gửi kết quả thi lên Google Sheet
   Dành cho: IC3 MiniTest – EduQuiz
   
   HƯỚNG DẪN SỬ DỤNG:
   1. Deploy Google Apps Script → lấy URL
   2. Dán URL vào biến APPS_SCRIPT_URL bên dưới
   3. Gọi saveToGoogleSheet(data) sau khi học sinh nộp bài
   ============================================================ */

// ──────────────────────────────────────────────────────────────
// ⚙️ CẤU HÌNH – CHỈ CẦN SỬA PHẦN NÀY
// ──────────────────────────────────────────────────────────────

// 🔗 Dán URL Google Apps Script Web App của bạn vào đây
// Ví dụ: 'https://script.google.com/macros/s/AKfy.../exec'
const APPS_SCRIPT_URL = 'PASTE_YOUR_APPS_SCRIPT_URL_HERE';

// ⏱️ Timeout: Nếu request quá 10 giây → báo lỗi (đơn vị: ms)
const REQUEST_TIMEOUT_MS = 10000;

// ──────────────────────────────────────────────────────────────
// 🔒 CHỐNG GỬI TRÙNG (Duplicate Submit Prevention)
// Lưu ID bài đã nộp vào bộ nhớ phiên làm việc
// ──────────────────────────────────────────────────────────────
const _submittedIds = new Set();

/**
 * Tạo một ID độc nhất cho mỗi lần nộp bài
 * Dựa trên tên học sinh + tên bài thi + thời điểm nộp
 * @param {string} studentName - Tên học sinh
 * @param {string} testName    - Tên bài thi
 * @returns {string} submissionId
 */
function generateSubmissionId(studentName, testName) {
  const base = `${studentName}__${testName}__${Date.now()}`;
  // Tạo hash đơn giản từ chuỗi (không cần crypto)
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;  // Chuyển sang 32-bit integer
  }
  return `sub_${Math.abs(hash)}_${Date.now()}`;
}

// ──────────────────────────────────────────────────────────────
// 📡 HÀM CHÍNH: Gửi dữ liệu bài thi lên Google Sheet
// ──────────────────────────────────────────────────────────────

/**
 * Gửi kết quả bài thi lên Google Sheet qua Apps Script
 *
 * @param {Object} data - Dữ liệu bài thi cần lưu
 * @param {string} data.studentName  - Tên học sinh
 * @param {string} data.testName     - Tên bài thi (vd: "IC3 Level 1 – Test A")
 * @param {number} data.score        - Điểm phần trăm (vd: 85)
 * @param {string} data.correct      - Số câu đúng/tổng (vd: "17/20")
 * @param {string} data.time         - Thời gian làm bài (vd: "12:34")
 * @param {number} data.tabSwitch    - Số lần chuyển tab
 * @param {number} data.clickCount   - Số lần click chuột
 * @param {string} data.status       - Trạng thái: "OK" hoặc "Gian lận"
 * @param {string} [data.timestamp]  - Thời điểm nộp (tự động nếu bỏ trống)
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function saveToGoogleSheet(data) {
  console.log('📡 [GoogleSheet] Bắt đầu gửi dữ liệu...', data);

  // ── Kiểm tra URL đã được cấu hình chưa ──────────────────
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('PASTE_YOUR')) {
    console.error('❌ [GoogleSheet] Chưa cấu hình APPS_SCRIPT_URL!');
    showNotification('⚠️ Chưa cấu hình Google Sheet URL. Liên hệ giáo viên.', 'warning');
    return { success: false, message: 'Chưa cấu hình URL' };
  }

  // ── Tạo Submission ID để chống gửi trùng ────────────────
  const submissionId = generateSubmissionId(data.studentName, data.testName);

  // Kiểm tra phía client (bảo vệ thêm)
  const clientKey = `${data.studentName}__${data.testName}`;
  if (_submittedIds.has(clientKey)) {
    console.warn('⚠️ [GoogleSheet] Phát hiện gửi trùng, bỏ qua:', clientKey);
    showNotification('ℹ️ Bài thi đã được lưu trước đó.', 'info');
    return { success: true, message: 'Duplicate - already submitted' };
  }

  // ── Chuẩn bị payload JSON đầy đủ ────────────────────────
  const payload = {
    submissionId,
    studentName: data.studentName  || 'Ẩn danh',
    testName:    data.testName     || 'Không rõ',
    score:       data.score        ?? 0,
    correct:     data.correct      || '0/0',
    time:        data.time         || '00:00',
    tabSwitch:   data.tabSwitch    ?? 0,
    clickCount:  data.clickCount   ?? 0,
    status:      data.status       || 'OK',
    timestamp:   data.timestamp    || new Date().toLocaleString('vi-VN'),
    note:        data.note         || ''
  };

  console.log('📦 [GoogleSheet] Payload sẽ gửi:', payload);

  // ── Thiết lập Timeout (hủy request nếu quá lâu) ──────────
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => {
    controller.abort();
    console.error('⏱️ [GoogleSheet] Request bị timeout sau', REQUEST_TIMEOUT_MS / 1000, 'giây');
  }, REQUEST_TIMEOUT_MS);

  try {
    // ── Gửi HTTP POST đến Google Apps Script ────────────────
    // Dùng no-cors vì Apps Script không trả về CORS headers đúng chuẩn
    const response = await fetch(APPS_SCRIPT_URL, {
      method:  'POST',
      signal:  controller.signal,
      // Không đặt Content-Type: Apps Script đọc raw body tốt hơn
      body:    JSON.stringify(payload)
    });

    clearTimeout(timeoutId);  // Hủy timeout nếu nhận được response

    console.log('📬 [GoogleSheet] HTTP Status:', response.status);

    // ── Parse kết quả trả về ────────────────────────────────
    const text   = await response.text();
    console.log('📄 [GoogleSheet] Response text:', text);

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // Apps Script đôi khi trả về HTML nếu có lỗi script
      console.error('❌ [GoogleSheet] Không parse được JSON:', text.slice(0, 200));
      throw new Error('Server trả về dữ liệu không hợp lệ');
    }

    // ── Xử lý kết quả ───────────────────────────────────────
    if (result.success) {
      _submittedIds.add(clientKey);    // Đánh dấu đã gửi thành công
      console.log('✅ [GoogleSheet] Lưu thành công!', result);
      showNotification('✅ Đã lưu kết quả lên Google Sheet thành công!', 'success');
      return { success: true, message: result.message };
    } else {
      console.error('❌ [GoogleSheet] Server báo lỗi:', result.error);
      showNotification('❌ Lỗi lưu kết quả: ' + (result.error || 'Không rõ nguyên nhân'), 'error');
      return { success: false, message: result.error };
    }

  } catch (err) {
    clearTimeout(timeoutId);

    // Phân loại lỗi để hiển thị thông báo rõ ràng hơn
    if (err.name === 'AbortError') {
      console.error('⏱️ [GoogleSheet] Request bị timeout');
      showNotification('⏱️ Kết nối quá lâu. Kết quả đã lưu offline. Thử lại sau!', 'warning');
      return { success: false, message: 'Timeout' };
    }

    if (!navigator.onLine) {
      console.error('📵 [GoogleSheet] Không có kết nối Internet');
      showNotification('📵 Mất kết nối Internet. Kết quả đã lưu offline.', 'warning');
      return { success: false, message: 'No internet' };
    }

    console.error('❌ [GoogleSheet] Lỗi không xác định:', err);
    showNotification('❌ Không thể lưu kết quả. Vui lòng thử lại.', 'error');
    return { success: false, message: err.message };
  }
}

// ──────────────────────────────────────────────────────────────
// 🔔 HIỂN THỊ THÔNG BÁO (Toast Notification)
// Tự động ẩn sau 4 giây
// ──────────────────────────────────────────────────────────────

/**
 * Hiển thị thông báo nổi (toast) ở góc phải màn hình
 * @param {string} message - Nội dung thông báo
 * @param {'success'|'error'|'warning'|'info'} type - Loại thông báo
 */
function showNotification(message, type = 'info') {
  // Tạo container nếu chưa có
  let container = document.getElementById('gs-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'gs-toast-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  // Màu sắc theo loại thông báo
  const colors = {
    success: { bg: '#1b5e20', border: '#4caf50', icon: '✅' },
    error:   { bg: '#7f0000', border: '#f44336', icon: '❌' },
    warning: { bg: '#e65100', border: '#ff9800', icon: '⚠️' },
    info:    { bg: '#0d47a1', border: '#2196f3', icon: 'ℹ️' }
  };
  const c = colors[type] || colors.info;

  // Tạo toast element
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${c.bg};
    border: 1px solid ${c.border};
    border-left: 4px solid ${c.border};
    color: #fff;
    padding: 12px 18px;
    border-radius: 10px;
    font-family: 'Nunito', sans-serif;
    font-size: 14px;
    font-weight: 700;
    max-width: 360px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    pointer-events: auto;
    cursor: pointer;
    opacity: 0;
    transform: translateX(40px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    line-height: 1.5;
  `;
  toast.textContent = message;
  toast.title = 'Nhấp để đóng';
  toast.onclick = () => dismissToast(toast);
  container.appendChild(toast);

  // Animation vào
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });
  });

  // Tự động ẩn sau 4 giây
  setTimeout(() => dismissToast(toast), 4000);
}

function dismissToast(toast) {
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(40px)';
  setTimeout(() => toast.remove(), 300);
}

// ──────────────────────────────────────────────────────────────
// 🎯 HÀM TÍCH HỢP VỚI SUBMITEXAM CỦA EDUQUIZ
// Gọi hàm này thay thế hoặc sau submitExam() hiện tại
// ──────────────────────────────────────────────────────────────

/**
 * Tích hợp với EduQuiz: Gọi sau khi chấm điểm xong
 * Tự động lấy dữ liệu từ State và kết quả để gửi lên Sheet
 *
 * @param {Object} result     - Kết quả từ gradeExam()
 * @param {number} elapsedSec - Số giây đã làm bài
 * @param {Object} integrity  - Kết quả từ computeIntegrity()
 */
async function submitToGoogleSheet(result, elapsedSec, integrity) {
  // Lấy thông tin từ State của EduQuiz
  const s   = State.session;
  const pct = Math.round((result.correct / result.total) * 100);

  // Định dạng thời gian: mm:ss
  const minutes = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const seconds = String(elapsedSec % 60).padStart(2, '0');
  const timeStr = `${minutes}:${seconds}`;

  // Tên đầy đủ của bài thi
  const fullTestName = [s.category, s.level, s.minitest].filter(Boolean).join(' › ');

  // Xác định trạng thái hợp lệ
  const status = integrity.valid ? 'OK' : '⚠️ ' + (integrity.flags[0] || 'Nghi vấn');

  // Chuẩn bị dữ liệu gửi đi
  const sheetData = {
    studentName: s.studentName,
    testName:    fullTestName,
    score:       pct,
    correct:     `${result.correct}/${result.total}`,
    time:        timeStr,
    tabSwitch:   integrity.tabSwitches,
    clickCount:  integrity.clicks,
    status:      status,
    timestamp:   new Date().toLocaleString('vi-VN'),
    note:        integrity.flags.length > 1
                   ? integrity.flags.slice(1).join('; ')
                   : (integrity.timedOut ? 'Hết giờ' : '')
  };

  console.log('🎯 [EduQuiz] Chuẩn bị gửi kết quả:', sheetData);

  // Gửi lên Google Sheet (không chặn UI, chạy nền)
  await saveToGoogleSheet(sheetData);
}
