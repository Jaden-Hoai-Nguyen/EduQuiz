/* ============================================================
   js/auth-guard.js
   Chặn truy cập trang cho tới khi xác định được người dùng đã đăng
   nhập VÀ có vai trò phù hợp. Dùng trên các trang quản trị (dashboard,
   image-manager, admin-users...).

   Cách dùng — khai báo TRƯỚC khi nạp script này:
     <script>window.EDU_ALLOWED_ROLES = ['admin','teacher'];</script>
     <script src="js/firebase-config.js"></script>
     <script src="js/auth.js"></script>
     <script src="js/auth-guard.js"></script>

   Trang sẽ được ẩn (bằng cách thêm class "edu-guard-locked" vào <html>)
   cho tới khi guard xác nhận hợp lệ, lúc đó class được gỡ và sự kiện
   "edu:ready" được bắn ra kèm { user, profile }.
   ============================================================ */
(function () {
  'use strict';

  const allowedRoles = window.EDU_ALLOWED_ROLES || ['admin', 'teacher', 'student'];
  document.documentElement.classList.add('edu-guard-locked');

  // CSS ẩn toàn bộ nội dung trong lúc chờ xác thực, tránh "nháy" nội dung nhạy cảm
  const style = document.createElement('style');
  style.textContent = `
    html.edu-guard-locked body { visibility: hidden !important; }
    #edu-guard-overlay {
      position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center;
      justify-content: center; flex-direction: column; gap: .8rem;
      background: #fff; font-family: 'Baloo 2', sans-serif; visibility: visible !important;
      color: #333;
    }
    #edu-guard-overlay .spin {
      width: 34px; height: 34px; border-radius: 50%;
      border: 4px solid #e0e0f0; border-top-color: #6c63ff;
      animation: edu-guard-spin .8s linear infinite;
    }
    @keyframes edu-guard-spin { to { transform: rotate(360deg); } }
    #edu-guard-overlay .msg { font-weight: 700; font-size: .95rem; color: #555; text-align:center; padding: 0 1.2rem; }
    #edu-guard-overlay .btn { background:#6c63ff;color:#fff;border:none;border-radius:999px;padding:.6rem 1.3rem;font-weight:700;cursor:pointer; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'edu-guard-overlay';
  overlay.innerHTML = `<div class="spin"></div><div class="msg">🔐 Đang kiểm tra đăng nhập...</div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));

  function showDenied(message, needsSignOut) {
    const btnLabel = needsSignOut ? 'Đăng xuất & về trang đăng nhập' : 'Về trang đăng nhập';
    overlay.innerHTML = `<div class="msg">🚫 ${message}</div>
      <button class="btn" id="edu-guard-back">${btnLabel}</button>`;
    const back = async () => {
      // QUAN TRỌNG: phải đăng xuất trước khi quay về login.html — nếu không,
      // login.html sẽ thấy phiên đăng nhập cũ vẫn còn, tự động điều hướng
      // ngược lại trang này, và trang này lại từ chối → tạo vòng lặp
      // "đẩy ra đẩy vào" vô hạn, khiến người dùng không thể đổi tài khoản.
      if (needsSignOut && window.EduAuth) {
        try { await EduAuth.logoutUser(); } catch (e) { /* ignore */ }
      }
      window.location.href = 'login.html?next=' + encodeURIComponent(location.pathname + location.search);
    };
    document.getElementById('edu-guard-back')?.addEventListener('click', back);
    document.documentElement.classList.remove('edu-guard-locked');
    overlay.style.visibility = 'visible';
  }

  function unlock(user, profile) {
    document.documentElement.classList.remove('edu-guard-locked');
    overlay.remove();
    window.EduCurrentUser = user;
    window.EduCurrentProfile = profile;
    window.dispatchEvent(new CustomEvent('edu:ready', { detail: { user, profile } }));
  }

  function boot() {
    if (!window.EduFirebase || !window.EduAuth) {
      console.error('[EduGuard] Thiếu firebase-config.js / auth.js — phải nạp trước auth-guard.js');
      return;
    }
    EduAuth.onAuthReady((user, profile) => {
      if (!user) {
        setTimeout(() => showDenied('Bạn cần đăng nhập để xem trang này.', false), 300);
        return;
      }
      if (!profile) {
        setTimeout(() => showDenied('Không tìm thấy hồ sơ tài khoản. Liên hệ quản trị viên.', true), 300);
        return;
      }
      if (!allowedRoles.includes(profile.role)) {
        setTimeout(() => showDenied('Tài khoản của bạn không có quyền truy cập trang này.', true), 300);
        return;
      }
      if (profile.role === 'teacher' && profile.approved === false) {
        setTimeout(() => showDenied('Tài khoản giáo viên của bạn đang chờ quản trị viên duyệt.', true), 300);
        return;
      }
      unlock(user, profile);
    });
  }

  boot();
})();
