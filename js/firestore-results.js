/* ============================================================
   📊 js/firestore-results.js
   Module ghi kết quả bài thi vào Firestore (collection "quiz_results")
   để phục vụ trang Báo cáo trực quan (ic3-dashboard.html → Báo cáo
   kết quả), dành cho Admin / Giáo viên / Điều phối đào tạo xem.

   Đây là nơi lưu CHÍNH (song song với Google Sheet ở js/googleSheet.js
   vốn chỉ dùng làm bản sao lưu/đối chiếu thủ công).

   NẠP FILE NÀY SAU:
     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
     <script src="js/firebase-config.js"></script>
     <script src="js/firestore-results.js"></script>
   VÀ TRƯỚC js/quiz-engine.js (quiz-engine gọi saveResultToFirestore()).

   Học sinh làm bài KHÔNG cần đăng nhập Firebase Auth, nên hàm này ghi
   dữ liệu ở chế độ "public write" — xem firestore.rules để biết các
   ràng buộc dữ liệu tối thiểu chống giả mạo (collection quiz_results).
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION = 'quiz_results';

  /**
   * Lưu 1 kết quả bài thi vào Firestore.
   * @param {Object} rec - Bản ghi kết quả (cùng cấu trúc với saveRecord() trong quiz-engine.js)
   * @returns {Promise<{success:boolean, id?:string, message?:string}>}
   */
  async function saveResultToFirestore(rec) {
    try {
      if (!global.EduFirebase || !global.EduFirebase.db) {
        console.warn('[EduQuiz] Firestore chưa sẵn sàng — bỏ qua lưu báo cáo (Google Sheet vẫn hoạt động).');
        return { success: false, message: 'Firestore chưa cấu hình' };
      }

      const fullTestName = [rec.category, rec.level, rec.minitest].filter(Boolean).join(' › ');

      const payload = {
        studentName:   rec.studentName   || 'Ẩn danh',
        studentClass:  rec.studentClass  || '',
        studentSchool: rec.studentSchool || '',
        category:      rec.category      || '',
        level:         rec.level         || '',
        minitest:      rec.minitest      || '',
        testName:      fullTestName      || 'Không rõ',
        score:         Number(rec.score) || 0,
        correct:       Number(rec.correct)   || 0,
        incorrect:     Number(rec.incorrect) || 0,
        skipped:       Number(rec.skipped)   || 0,
        total:         Number(rec.total)     || 0,
        elapsedSec:    Number(rec.elapsedSec) || 0,
        tabSwitches:   Number(rec.tabSwitches) || 0,
        clicks:        Number(rec.clicks)      || 0,
        integrityOk:   rec.integrityOk !== false,
        flags:         Array.isArray(rec.flags) ? rec.flags.slice(0, 10) : [],
        timedOut:      !!rec.timedOut,
        submittedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await global.EduFirebase.db.collection(COLLECTION).add(payload);
      console.log('✅ [EduQuiz] Đã lưu báo cáo vào Firestore:', docRef.id);
      return { success: true, id: docRef.id };
    } catch (err) {
      // Không chặn trải nghiệm học sinh nếu lưu báo cáo thất bại —
      // localStorage + Google Sheet (googleSheet.js) vẫn giữ vai trò dự phòng.
      console.error('❌ [EduQuiz] Lỗi lưu báo cáo Firestore:', err);
      return { success: false, message: err.message };
    }
  }

  global.saveResultToFirestore = saveResultToFirestore;
})(window);
