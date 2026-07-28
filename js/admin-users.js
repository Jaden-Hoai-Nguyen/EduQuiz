window.EDU_ALLOWED_ROLES = ['admin'];

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
    loadUsers();
  });

  async function loadUsers() {
    const tbody = document.getElementById('userRows');
    const snap = await EduFirebase.db.collection('users').orderBy('createdAt', 'desc').get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5">Chưa có tài khoản nào.</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(doc => {
      const u = doc.data();
      const pending = u.role === 'teacher' && u.approved === false;
      return `
      <tr data-uid="${doc.id}">
        <td>${esc(u.name || '(chưa đặt tên)')}</td>
        <td>${esc(u.email || '')}</td>
        <td><span class="badge ${esc(u.role)}">${esc(EduAuth.ROLE_LABEL[u.role] || u.role)}</span>${pending ? '<span class="badge pending">Chờ duyệt</span>' : ''}</td>
        <td>
          <select class="roleSelect">
            <option value="student" ${u.role === 'student' ? 'selected' : ''}>🎓 Học sinh</option>
            <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>🧑‍🏫 Giáo viên</option>
            <option value="coordinator" ${u.role === 'coordinator' ? 'selected' : ''}>🧭 Điều phối đào tạo</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Quản trị viên</option>
          </select>
        </td>
        <td>${pending ? '<button class="approveBtn">✅ Duyệt ngay</button>' : '—'}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.roleSelect').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const uid = e.target.closest('tr').dataset.uid;
        const newRole = e.target.value;
        try {
          await EduFirebase.db.collection('users').doc(uid).set(
            { role: newRole, approved: true }, { merge: true }
          );
          toast('✅ Đã cập nhật vai trò');
          loadUsers();
        } catch (err) {
          toast('❌ Lỗi: ' + err.message);
        }
      });
    });

    tbody.querySelectorAll('.approveBtn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const uid = e.target.closest('tr').dataset.uid;
        try {
          await EduFirebase.db.collection('users').doc(uid).set({ approved: true }, { merge: true });
          toast('✅ Đã duyệt tài khoản giáo viên');
          loadUsers();
        } catch (err) {
          toast('❌ Lỗi: ' + err.message);
        }
      });
    });
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
