/* index.html — script khởi tạo trang (tách từ inline <script>) */

// Hiển thị dải XP/Streak/Huy hiệu ngay khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
  if (window.EduGamification) EduGamification.renderInto('#lobbyGameStrip');
});
