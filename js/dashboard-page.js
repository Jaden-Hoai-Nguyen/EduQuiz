/* ============================================================
   ic3-dashboard.html — page-specific init (tách ra khỏi HTML)
   ============================================================ */

window.EDU_ALLOWED_ROLES = ['admin', 'teacher'];

window.addEventListener('edu:ready', ({ detail }) => {
  const { user, profile } = detail;
  document.getElementById('userChipName').textContent = profile.name || user.email;
  document.getElementById('userChipRole').textContent = EduAuth.ROLE_LABEL[profile.role] || profile.role;
  if (profile.role === 'admin') {
    document.getElementById('adminUsersLink').style.display = 'flex';
  }
  document.getElementById('userChip').addEventListener('click', async () => {
    if (confirm('Đăng xuất khỏi EduQuiz?')) {
      await EduAuth.logoutUser();
      window.location.href = 'login.html';
    }
  });
});
