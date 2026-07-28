  const params = new URLSearchParams(location.search);
  const nextUrl = params.get('next') || 'ic3-dashboard.html';

  if (params.get('reason') === 'idle') {
    const msgEl = document.getElementById('msg');
    msgEl.textContent = '⏳ Bạn đã bị đăng xuất do không hoạt động trong 10 phút. Vui lòng đăng nhập lại.';
    msgEl.classList.add('err');
  }

  // Nếu đã đăng nhập sẵn → chuyển thẳng đi, khỏi cần đăng nhập lại
  EduFirebase.auth.onAuthStateChanged((user) => {
    if (user) redirectByRole();
  });

  async function redirectByRole() {
    try {
      const user = EduFirebase.auth.currentUser;
      const profile = await EduAuth.fetchProfile(user.uid);
      if (!profile) return; // hồ sơ chưa kịp tạo (vừa đăng ký) — để luồng register tự điều hướng
      if (profile.role === 'student') {
        window.location.href = 'index.html';
        return;
      }
      // Giáo viên chưa được duyệt: KHÔNG điều hướng sang trang quản trị (sẽ bị
      // auth-guard.js chặn ngay), tránh vòng lặp "đẩy ra đẩy vào" giữa login.html
      // và trang quản trị. Hiện thông báo tại chỗ và đăng xuất để người dùng có
      // thể thử tài khoản khác ngay.
      if (profile.role === 'teacher' && profile.approved === false) {
        setMsg('⏳ Tài khoản giáo viên của bạn đang chờ quản trị viên duyệt. Vui lòng thử lại sau, hoặc đăng nhập bằng tài khoản khác.', 'err');
        await EduAuth.logoutUser();
        return;
      }
      window.location.href = nextUrl;
    } catch (e) { /* ignore, ở lại trang login */ }
  }

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
      document.getElementById('registerForm').classList.toggle('hidden', isLogin);
      setMsg('');
    });
  });

  // Role choice
  let chosenRole = 'student';
  document.querySelectorAll('.role-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.role-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      chosenRole = opt.dataset.role;
      document.getElementById('roleHint').textContent = chosenRole === 'teacher'
        ? 'Tài khoản giáo viên cần quản trị viên duyệt trước khi dùng được các trang quản trị.'
        : 'Tài khoản học sinh dùng được ngay sau khi đăng ký.';
    });
  });

  function setMsg(text, type) {
    const el = document.getElementById('msg');
    el.textContent = text || '';
    el.className = 'msg' + (type ? ' ' + type : '');
  }

  function friendlyError(err) {
    const code = err && err.code || '';
    const map = {
      'auth/invalid-email': 'Email không hợp lệ.',
      'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
      'auth/wrong-password': 'Sai mật khẩu.',
      'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
      'auth/email-already-in-use': 'Email này đã được đăng ký.',
      'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).',
      'auth/too-many-requests': 'Bạn thử sai quá nhiều lần, hãy đợi một lát rồi thử lại.',
    };
    return map[code] || (err && err.message) || 'Đã có lỗi xảy ra, thử lại nhé.';
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    setMsg('Đang đăng nhập...', '');
    try {
      const email = document.getElementById('loginEmail').value.trim();
      const pass = document.getElementById('loginPass').value;
      await EduAuth.loginUser(email, pass);
      setMsg('✅ Đăng nhập thành công, đang chuyển hướng...', 'ok');
      await redirectByRole();
    } catch (err) {
      setMsg('❌ ' + friendlyError(err), 'err');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    btn.disabled = true;
    setMsg('Đang tạo tài khoản...', '');
    try {
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const pass = document.getElementById('regPass').value;
      const { role, approved } = await EduAuth.registerUser({
        name, email, password: pass, wantsTeacher: chosenRole === 'teacher',
      });
      if (role === 'teacher' && !approved) {
        setMsg('✅ Đã tạo tài khoản giáo viên. Vui lòng chờ quản trị viên duyệt trước khi đăng nhập vào trang quản trị.', 'ok');
        btn.disabled = false;
        return;
      }
      setMsg('✅ Tạo tài khoản thành công, đang chuyển hướng...', 'ok');
      window.location.href = role === 'student' ? 'index.html' : nextUrl;
    } catch (err) {
      setMsg('❌ ' + friendlyError(err), 'err');
      btn.disabled = false;
    }
  });

  document.getElementById('forgotLink').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) { setMsg('Nhập email ở trên trước rồi bấm "Quên mật khẩu?" nhé.', 'err'); return; }
    try {
      await EduAuth.sendResetEmail(email);
      setMsg('📩 Đã gửi email đặt lại mật khẩu tới ' + email, 'ok');
    } catch (err) {
      setMsg('❌ ' + friendlyError(err), 'err');
    }
  });
