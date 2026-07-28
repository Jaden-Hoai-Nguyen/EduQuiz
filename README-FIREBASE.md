# EduQuiz — Hệ thống tài khoản & quản lý câu hỏi trên Firebase

Bản cập nhật này thêm vào dự án:

1. **Đăng nhập/đăng ký + phân quyền** Admin / Giáo viên / Học sinh (`login.html`,
   `js/auth.js`, `js/auth-guard.js`).
2. **Trang quản lý tài khoản** cho admin (`admin-users.html`) để duyệt giáo viên
   mới và đổi vai trò bất kỳ ai.
3. **`image-manager.html` viết lại hoàn toàn**: giờ đọc/ghi trực tiếp trên
   Firestore (collection `questions`), cho phép sửa **toàn bộ nội dung câu hỏi**
   (không chỉ ảnh) — câu hỏi, đáp án, loại câu hỏi, nối cặp, đúng/sai... Mọi
   thao tác Thêm / Xoá / Sửa đều **lưu ngay lập tức** lên Firebase.

## Việc cần làm 1 lần trên Firebase Console (dự án `data-ic3`)

1. **Bật Authentication**: Console → Build → Authentication → Sign-in method →
   bật **Email/Password**.
2. **Bật Firestore**: Console → Build → Firestore Database → Create database
   (nếu chưa có) → chọn chế độ Production.
3. **Dán Security Rules**: mở file `firestore.rules` trong dự án này, copy toàn
   bộ nội dung, dán vào Console → Firestore Database → Rules → Publish.
4. **Tạo admin đầu tiên**:
   - Vào trang `login.html` trên site của bạn → tab "Đăng ký" → tạo 1 tài khoản
     bất kỳ (chọn "Học sinh" cho nhanh).
   - Vào Firebase Console → Firestore Database → Data → collection `users` →
     tìm document ứng với tài khoản vừa tạo (theo email) → sửa field
     `role` thành `"admin"` và `approved` thành `true`.
   - Đăng nhập lại — tài khoản này giờ là admin, có thể vào `admin-users.html`
     để duyệt/đổi vai trò cho tất cả tài khoản khác về sau (không cần sửa tay
     trong Console nữa).
5. **Nhập dữ liệu câu hỏi ban đầu**: đăng nhập bằng tài khoản admin → mở
   `image-manager.html` → sẽ thấy khối màu vàng "Chưa có dữ liệu câu hỏi nào
   trên Firebase" → bấm **"📥 Nhập dữ liệu từ quiz_data.json"** (chỉ cần làm 1
   lần, đọc file `quiz_data.json` có sẵn trong dự án và ghi từng câu hỏi thành
   1 document trong collection `questions`).

## Luồng vai trò

- **Học sinh (student)**: đăng ký xong dùng được ngay, chỉ vào được các trang
  học sinh (`index.html`...), không vào được dashboard/quản lý.
- **Giáo viên (teacher)**: đăng ký xong ở trạng thái *chờ duyệt*
  (`approved: false`) — chưa vào được trang quản trị cho tới khi admin duyệt
  trong `admin-users.html`.
- **Admin**: không thể tự đăng ký — phải được nâng cấp thủ công lần đầu (bước
  4 ở trên), sau đó admin có thể phong admin/giáo viên cho người khác ngay
  trong `admin-users.html`.

## Ghi chú kỹ thuật

- Dùng Firebase **Compat SDK** (không phải modular v9+) để giữ phong cách
  script thuần (không cần bundler) đồng bộ với phần còn lại của dự án.
- `image-manager.html`/`ic3-dashboard.html`/`admin-users.html` đều được bọc bởi
  `js/auth-guard.js` — chưa đăng nhập hoặc sai vai trò sẽ bị chặn và đưa về
  `login.html`.
- `firestore.rules` chặn ghi collection `questions` với bất kỳ ai không phải
  admin hoặc giáo viên đã được duyệt — dù có sửa code phía client thì vẫn
  không ghi được lên Firebase nếu không đúng vai trò.
- Nút **"⬇️ Sao lưu JSON"** trong `image-manager.html` chỉ để tải một bản dự
  phòng từ dữ liệu hiện có trên Firestore — không còn là bước bắt buộc trong
  quy trình chỉnh sửa như bản cũ.

## 📊 Báo cáo kết quả trực quan (mục mới)

- Sau khi học sinh nộp bài trên `index.html`, kết quả được ghi vào **2 nơi
  song song**:
  1. **Firestore, collection `quiz_results`** (`js/firestore-results.js`) —
     nguồn dữ liệu CHÍNH cho biểu đồ/báo cáo trong app.
  2. **Google Sheet** qua Apps Script (`js/googleSheet.js` + `apps/Code.gs`,
     đã có sẵn từ trước) — vẫn giữ lại làm bản sao lưu/đối chiếu thủ công.
  Học sinh **không cần đăng nhập** để làm bài, nên việc ghi vào `quiz_results`
  được `firestore.rules` cho phép công khai nhưng có kiểm tra dữ liệu tối
  thiểu (đúng kiểu, điểm 0–100, dấu thời gian phải khớp server) để chống
  giả mạo; **chỉ đọc được** bởi admin/giáo viên/điều phối đào tạo.
- Xem báo cáo tại `ic3-dashboard.html` → mục **"📊 Báo cáo kết quả"**: có bộ
  lọc theo lớp / bộ đề / khoảng thời gian, 4 chỉ số tổng quan, 3 biểu đồ
  (Đạt/Chưa đạt, điểm TB theo lớp, xu hướng điểm TB theo ngày — dùng
  Chart.js qua CDN) và bảng chi tiết + nút xuất CSV.
- **Vai trò mới: `coordinator` ("🧭 Điều phối đào tạo")** — chỉ xem được mục
  Báo cáo kết quả (không thấy "Bộ đề của tôi"/"Cài đặt", không có quyền sửa
  câu hỏi hay tài khoản). Giống `admin`, vai trò này **không tự đăng ký
  được** — admin phải vào `admin-users.html` → đổi vai trò một tài khoản có
  sẵn thành "🧭 Điều phối đào tạo".
- **Nhớ dán lại `firestore.rules`** (bản mới có thêm rule cho `quiz_results`
  và role `coordinator`) vào Console → Firestore Database → Rules → Publish,
  nếu không học sinh sẽ không lưu được kết quả và điều phối đào tạo sẽ
  không xem được báo cáo.
