// ============================================================
//  📋 GOOGLE APPS SCRIPT – IC3 MiniTest Result Collector
//  Dán toàn bộ file này vào Google Apps Script Editor
//  https://script.google.com
// ============================================================

// ⚙️ CẤU HÌNH – Thay ID sheet của bạn vào đây
// Lấy ID từ URL: https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit
var SHEET_ID   = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';
var SHEET_NAME = 'Kết quả thi';   // Tên tab trong Google Sheet

// ============================================================
//  🔒 CHỐNG GỬI TRÙNG (Duplicate Prevention)
//  Lưu các submission ID đã xử lý vào PropertiesService
// ============================================================
function isDuplicate(submissionId) {
  var props  = PropertiesService.getScriptProperties();
  var key    = 'sub_' + submissionId;
  if (props.getProperty(key)) return true;    // Đã tồn tại → trùng
  props.setProperty(key, '1');                // Lưu lại để check lần sau
  return false;
}

// ============================================================
//  📬 HÀM CHÍNH: Nhận dữ liệu POST từ Frontend
// ============================================================
function doPost(e) {
  // ── Bước 1: Cho phép mọi domain gọi được (CORS) ──────────
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    // ── Bước 2: Parse JSON từ request body ────────────────
    var raw  = e.postData && e.postData.contents ? e.postData.contents : '{}';
    var data = JSON.parse(raw);

    Logger.log('📥 Dữ liệu nhận được: ' + JSON.stringify(data));

    // ── Bước 3: Validate dữ liệu tối thiểu ───────────────
    if (!data.studentName || !data.testName) {
      output.setContent(JSON.stringify({
        success: false,
        error:   'Thiếu tên học sinh hoặc tên bài thi'
      }));
      return output;
    }

    // ── Bước 4: Chống gửi trùng ───────────────────────────
    var submissionId = data.submissionId || '';
    if (submissionId && isDuplicate(submissionId)) {
      Logger.log('⚠️ Duplicate submission: ' + submissionId);
      output.setContent(JSON.stringify({
        success:   true,
        duplicate: true,
        message:   'Bài thi đã được lưu trước đó'
      }));
      return output;
    }

    // ── Bước 5: Mở Google Sheet ───────────────────────────
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);

    // Nếu sheet chưa tồn tại → tự động tạo mới
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      Logger.log('✅ Tạo sheet mới: ' + SHEET_NAME);
    }

    // ── Bước 6: Tạo dòng tiêu đề nếu sheet còn trống ─────
    if (sheet.getLastRow() === 0) {
      var headers = [
        'STT', 'Thời gian nộp', 'Họ tên học sinh', 'Lớp', 'Trường', 'Tên bài thi',
        'Điểm (%)', 'Đúng/Tổng', 'Thời gian làm bài',
        'Chuyển tab', 'Số lần click', 'Trạng thái', 'Ghi chú'
      ];
      sheet.appendRow(headers);

      // Định dạng tiêu đề: nền xanh đậm, chữ trắng, in đậm
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#1a237e');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);  // Cố định dòng tiêu đề

      Logger.log('✅ Đã tạo tiêu đề bảng');
    }

    // ── Bước 7: Chuẩn bị dữ liệu để ghi vào Sheet ────────
    var rowNumber  = sheet.getLastRow();          // Số dòng hiện tại (để tính STT)
    var timestamp  = data.timestamp || new Date().toLocaleString('vi-VN');

    var newRow = [
      rowNumber,                      // STT (tự động)
      timestamp,                      // Thời gian nộp bài
      data.studentName   || '',       // Họ tên học sinh
      data.studentClass  || '',       // Lớp
      data.studentSchool || '',       // Trường
      data.testName      || '',       // Tên bài thi
      data.score         || 0,        // Điểm %
      data.correct       || '0/0',    // Ví dụ: 17/20
      data.time          || '00:00',  // Thời gian làm bài
      data.tabSwitch     || 0,        // Số lần chuyển tab
      data.clickCount    || 0,        // Số lần click chuột
      data.status        || 'OK',     // OK / Gian lận
      data.note          || ''        // Ghi chú thêm (nếu có)
    ];

    // ── Bước 8: Ghi dữ liệu vào Sheet ────────────────────
    sheet.appendRow(newRow);
    Logger.log('✅ Đã ghi dòng: ' + JSON.stringify(newRow));

    // ── Bước 9: Tô màu dòng theo trạng thái ──────────────
    var lastRow   = sheet.getLastRow();
    var rowRange  = sheet.getRange(lastRow, 1, 1, newRow.length);

    if (data.status && data.status !== 'OK') {
      rowRange.setBackground('#fff3e0');   // Cam nhạt nếu nghi vấn gian lận
    } else if (data.score >= 70) {
      rowRange.setBackground('#e8f5e9');   // Xanh lá nhạt nếu đạt
    } else {
      rowRange.setBackground('#ffebee');   // Đỏ nhạt nếu không đạt
    }

    // ── Bước 10: Trả về kết quả thành công ───────────────
    output.setContent(JSON.stringify({
      success: true,
      message: 'Đã lưu kết quả bài thi thành công!',
      row:     lastRow
    }));

  } catch (err) {
    // ── Xử lý lỗi ────────────────────────────────────────
    Logger.log('❌ Lỗi: ' + err.toString());
    output.setContent(JSON.stringify({
      success: false,
      error:   err.toString()
    }));
  }

  return output;
}

// ============================================================
//  🧪 HÀM TEST – Chạy thủ công để kiểm tra kết nối Sheet
//  Nhấn ▶ Run trong Apps Script Editor để kiểm tra
// ============================================================
function testDoPost() {
  var fakeEvent = {
    postData: {
      contents: JSON.stringify({
        submissionId:  'test_' + Date.now(),
        studentName:   'Nguyễn Văn Test',
        studentClass:  '6A1',
        studentSchool: 'THCS Nguyễn Du',
        testName:      'IC3 Demo Test',
        score:         85,
        correct:       '17/20',
        time:          '12:34',
        tabSwitch:     1,
        clickCount:    42,
        status:        'OK',
        timestamp:     new Date().toLocaleString('vi-VN'),
        note:          'Chạy từ hàm test'
      })
    }
  };

  var result = doPost(fakeEvent);
  Logger.log('🧪 Kết quả test: ' + result.getContent());
}