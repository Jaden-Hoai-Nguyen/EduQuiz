/* ============================================================
   js/firebase-config.js
   Khởi tạo Firebase dùng chung cho toàn bộ dự án EduQuiz.
   Nạp file này SAU các thẻ <script> của Firebase Compat SDK và
   TRƯỚC js/auth.js / js/auth-guard.js / các script khác cần dùng
   firebase.auth() hoặc firebase.firestore().

   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
   <script src="js/firebase-config.js"></script>
   ============================================================ */
(function () {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyCff1nnmUBKONN8JnzoWuitvIi3ewM1oi4",
    authDomain: "data-ic3.firebaseapp.com",
    databaseURL: "https://data-ic3-default-rtdb.firebaseio.com",
    projectId: "data-ic3",
    storageBucket: "data-ic3.firebasestorage.app",
    messagingSenderId: "1087430420781",
    appId: "1:1087430420781:web:d126581d25aaf6d853cba4",
    measurementId: "G-2EMBPZXCX1"
  };

  if (!window.firebase) {
    console.error('[EduQuiz] Firebase SDK chưa được nạp trước firebase-config.js');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // Bật cache offline (không bắt buộc, giúp trang mượt hơn khi mạng chập chờn)
  try {
    firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch (e) { /* ignore */ }

  // firebase.auth() chỉ tồn tại nếu trang có nạp firebase-auth-compat.js.
  // index.html (trang học sinh làm bài) không yêu cầu đăng nhập nên có thể
  // không nạp Auth SDK — tránh throw lỗi làm hỏng cả Firestore.
  let authInstance = null;
  try {
    if (firebase.auth) authInstance = firebase.auth();
  } catch (e) {
    console.warn('[EduQuiz] Firebase Auth SDK chưa được nạp trên trang này (bình thường với index.html).');
  }

  window.EduFirebase = {
    auth: authInstance,
    db: firebase.firestore(),
  };
})();
