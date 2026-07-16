/* ============================================================
   js/idle-logout.js
   Tự động đăng xuất tài khoản (admin/teacher) sau một khoảng thời
   gian KHÔNG HOẠT ĐỘNG (mặc định 10 phút), để tránh quên đăng xuất
   trên máy dùng chung (phòng máy, máy tính lớp học...).

   CHỈ dùng trên các trang có đăng nhập (dashboard, admin-users,
   image-manager...) — KHÔNG dùng trên index.html vì học sinh làm
   bài không cần tài khoản.

   Cách dùng — thêm SAU auth-guard.js:
     <script src="js/firebase-config.js"></script>
     <script src="js/auth.js"></script>
     <script src="js/auth-guard.js"></script>
     <script src="js/idle-logout.js"></script>

   Có thể tùy chỉnh thời gian trước khi nạp file này:
     <script>window.EDU_IDLE_LIMIT_MIN = 10;</script>
   ============================================================ */
(function () {
  'use strict';

  const IDLE_LIMIT_MS = (window.EDU_IDLE_LIMIT_MIN || 10) * 60 * 1000; // mặc định 10 phút
  const WARNING_MS     = 60 * 1000; // cảnh báo trước 60 giây

  let idleTimer, warnTimer, countdownInterval;
  let warningEl = null;

  function buildWarningBanner() {
    const el = document.createElement('div');
    el.id = 'edu-idle-warning';
    el.innerHTML = `
      <div class="edu-idle-box">
        <div class="edu-idle-icon">⏳</div>
        <div class="edu-idle-text">
          Bạn không hoạt động một lúc rồi.<br>
          Hệ thống sẽ <b>tự đăng xuất sau <span id="edu-idle-count">60</span>s</b>.
        </div>
        <button type="button" id="edu-idle-stay">Tiếp tục làm việc</button>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #edu-idle-warning {
        position: fixed; bottom: 1.2rem; right: 1.2rem; z-index: 99999;
        font-family: 'Baloo 2', sans-serif;
        animation: edu-idle-in .25s ease-out;
      }
      @keyframes edu-idle-in { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
      .edu-idle-box {
        display:flex; align-items:center; gap:.7rem;
        background:#1a1a2e; color:#fff; border-radius:14px;
        padding:.9rem 1.1rem; box-shadow:0 8px 24px rgba(0,0,0,.25); max-width: 320px;
      }
      .edu-idle-icon { font-size:1.4rem; }
      .edu-idle-text { font-size:.82rem; line-height:1.45; flex:1; }
      #edu-idle-stay {
        background:#6c63ff; color:#fff; border:none; border-radius:999px;
        padding:.5rem .9rem; font-weight:700; font-size:.78rem; cursor:pointer; white-space:nowrap;
      }
      #edu-idle-stay:hover { background:#5a52e0; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(el);
    document.getElementById('edu-idle-stay').addEventListener('click', resetIdleTimer);
    return el;
  }

  function showWarning() {
    if (!warningEl) warningEl = buildWarningBanner();
    warningEl.style.display = 'block';

    let secondsLeft = Math.round(WARNING_MS / 1000);
    const countEl = document.getElementById('edu-idle-count');
    countEl.textContent = secondsLeft;

    countdownInterval = setInterval(() => {
      secondsLeft -= 1;
      if (countEl) countEl.textContent = secondsLeft;
      if (secondsLeft <= 0) clearInterval(countdownInterval);
    }, 1000);
  }

  function hideWarning() {
    if (warningEl) warningEl.style.display = 'none';
    clearInterval(countdownInterval);
  }

  async function doLogout() {
    hideWarning();
    try {
      if (window.EduAuth) await EduAuth.logoutUser();
    } catch (e) {
      console.warn('[EduIdleLogout] Lỗi khi đăng xuất:', e);
    }
    window.location.href = 'login.html?reason=idle';
  }

  function resetIdleTimer() {
    hideWarning();
    clearTimeout(idleTimer);
    clearTimeout(warnTimer);
    warnTimer = setTimeout(showWarning, IDLE_LIMIT_MS - WARNING_MS);
    idleTimer = setTimeout(doLogout, IDLE_LIMIT_MS);
  }

  function startTracking() {
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((evt) => document.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer();
    console.log('[EduIdleLogout] Bật tự động đăng xuất sau ' + (IDLE_LIMIT_MS / 60000) + ' phút không hoạt động.');
  }

  // Chỉ bắt đầu đếm giờ SAU KHI auth-guard xác nhận đăng nhập hợp lệ,
  // để tránh đăng xuất "ma" khi trang còn đang tải / kiểm tra quyền.
  window.addEventListener('edu:ready', startTracking, { once: true });
})();
