/* ============================================================
   ic3-dashboard.html — page-specific init (tách ra khỏi HTML)
   ============================================================ */

window.EDU_ALLOWED_ROLES = ['admin', 'teacher', 'coordinator'];

window.addEventListener('edu:ready', ({ detail }) => {
  const { user, profile } = detail;
  document.getElementById('userChipName').textContent = profile.name || user.email;
  document.getElementById('userChipRole').textContent = EduAuth.ROLE_LABEL[profile.role] || profile.role;
  if (profile.role === 'admin') {
    document.getElementById('adminUsersLink').style.display = 'flex';
  }

  // Điều phối đào tạo (coordinator): chỉ xem Báo cáo kết quả, không có
  // quyền quản lý bộ đề / cài đặt hệ thống → ẩn các mục còn lại và mở
  // thẳng vào tab Báo cáo.
  if (profile.role === 'coordinator') {
    document.querySelector('.nav-item[data-section="my-sets"]')?.style.setProperty('display', 'none');
    document.querySelector('.nav-item[data-section="settings"]')?.style.setProperty('display', 'none');
    document.querySelector('.nav-item[data-section="reports"]')?.click();
  }

  document.getElementById('userChip').addEventListener('click', async () => {
    if (confirm('Đăng xuất khỏi EduQuiz?')) {
      await EduAuth.logoutUser();
      window.location.href = 'login.html';
    }
  });
});
