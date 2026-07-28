/* ============================================================
   js/auth.js
   Hệ thống tài khoản & phân quyền EduQuiz: Admin / Teacher / Student.
   Dùng Firebase Authentication (email/password) + Firestore collection
   "users" để lưu hồ sơ + vai trò (role) của từng người dùng.

   Cấu trúc 1 document trong collection "users" (id = uid của Auth):
   {
     name: "Nguyễn Văn A",
     email: "a@example.com",
     role: "admin" | "teacher" | "coordinator" | "student",
     approved: true|false,   // teacher cần admin duyệt mới approved=true
     createdAt: <timestamp>
   }

   Quy tắc:
   - Đăng ký mới luôn tạo role mặc định "student" (approved=true) trừ khi
     người dùng tự chọn "Tôi là giáo viên" → role "teacher", approved=false
     (chờ admin duyệt trong trang admin-users.html).
   - Tài khoản "admin" và "coordinator" (Điều phối đào tạo) KHÔNG thể tự
     đăng ký — chỉ được admin khác nâng cấp thủ công trong
     admin-users.html (hoặc gán tay lần đầu trong Firestore Console).
     "coordinator" chỉ có quyền ĐỌC báo cáo kết quả (mục Báo cáo trong
     ic3-dashboard.html), không có quyền sửa câu hỏi/tài khoản.
   ============================================================ */
(function (global) {
  'use strict';

  function db() { return window.EduFirebase.db; }
  function auth() { return window.EduFirebase.auth; }

  const USERS_COL = 'users';

  /** Đăng ký tài khoản mới. wantsTeacher=true → xin làm giáo viên (chờ duyệt). */
  async function registerUser({ name, email, password, wantsTeacher }) {
    const cred = await auth().createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;
    await auth().currentUser.updateProfile({ displayName: name });
    const role = wantsTeacher ? 'teacher' : 'student';
    const approved = !wantsTeacher; // student: tự động approved; teacher: chờ duyệt
    await db().collection(USERS_COL).doc(uid).set({
      name: name || '',
      email: email || '',
      role,
      approved,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { uid, role, approved };
  }

  async function loginUser(email, password) {
    const cred = await auth().signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function logoutUser() {
    await auth().signOut();
  }

  async function sendResetEmail(email) {
    await auth().sendPasswordResetEmail(email);
  }

  /** Lấy hồ sơ Firestore (role, approved, name...) của 1 uid. */
  async function fetchProfile(uid) {
    const snap = await db().collection(USERS_COL).doc(uid).get();
    return snap.exists ? Object.assign({ uid }, snap.data()) : null;
  }

  /**
   * Gọi callback(user, profile) mỗi khi trạng thái đăng nhập thay đổi.
   * user = firebase.auth() user object hoặc null.
   * profile = document Firestore users/{uid} hoặc null.
   */
  function onAuthReady(callback) {
    auth().onAuthStateChanged(async (user) => {
      if (!user) return callback(null, null);
      try {
        const profile = await fetchProfile(user.uid);
        callback(user, profile);
      } catch (e) {
        console.error('[EduAuth] Không đọc được hồ sơ người dùng', e);
        callback(user, null);
      }
    });
  }

  const ROLE_LABEL = {
    admin: '👑 Quản trị viên',
    teacher: '🧑‍🏫 Giáo viên',
    coordinator: '🧭 Điều phối đào tạo',
    student: '🎓 Học sinh',
  };

  global.EduAuth = {
    registerUser,
    loginUser,
    logoutUser,
    sendResetEmail,
    fetchProfile,
    onAuthReady,
    ROLE_LABEL,
  };
})(window);
