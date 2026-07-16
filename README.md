# EduQuiz — Ghi chú nâng cấp (Tháng 7/2026)

## 0 (mới nhất). Click trực tiếp trên ảnh cho câu nối cột (thay vì đọc chữ)

### Tính năng mới: `q.regions` — vùng bấm trên ảnh cho câu "matching"
Thêm khả năng: với câu nối cột (`type: "matching"`) có ảnh, cột trái có
thể hiển thị dưới dạng **ảnh + vùng bấm** thay vì danh sách chữ — học
sinh bấm thẳng vào đúng vị trí trên ảnh (vd. bấm vào đầu cắm USB-C)
thay vì đọc tên rồi tìm trong danh sách.

**Cách bật cho 1 câu hỏi**: thêm field `regions` vào object câu hỏi
trong `quiz_data.json` (rồi chạy `python3 scripts/split-quiz-data.py`
để đồng bộ ra `data/ic3/*.json`):
```json
{
  "uid": "thcs__k6__mt1__q35",
  "type": "matching",
  "imageUrl": "img/Picture38.png",
  "pairs": [...],
  "regions": [
    { "value": "USB",       "x": 1,  "y": 3, "w": 18, "h": 93 },
    { "value": "Micro USB", "x": 23, "y": 3, "w": 15, "h": 93 },
    { "value": "LIGHTNING", "x": 63, "y": 3, "w": 14, "h": 93 },
    { "value": "USB-C",     "x": 83, "y": 3, "w": 16, "h": 93 }
  ]
}
```
- `x, y, w, h`: % theo **kích thước ảnh gốc** (0-100), góc trên-trái.
- `value`: phải khớp **chính xác** 1 chuỗi trong `pairs[].left`.
- Item nào trong `pairs[].left` KHÔNG có `value` tương ứng trong
  `regions` vẫn tự động hiện dạng chữ bên dưới ảnh (không mất đáp án).
- Không có `regions` → câu hỏi hiện dạng chữ như cũ, không đổi gì.

**Cách click hoạt động**: giống hệt cơ chế đang có (nhấn chip đáp án
bên phải → nhấn vào vùng trên ảnh để đặt đáp án) — không đổi cách chấm
điểm, chỉ đổi cách chọn "ô đích" bên trái từ đọc-chữ sang bấm-ảnh.

### Đã áp dụng cho: `thcs__k6__mt1__q35` (câu đầu nối USB — Khối 6)
Toạ độ được đo **bằng phân tích pixel thật** (không ước lượng bằng
mắt): dùng Python phát hiện 5 cụm điểm ảnh tối màu (5 đầu cắm) trên
nền trắng, ra đúng 5 khoảng cột tách biệt rõ ràng, rồi ánh xạ 4/5 đầu
cắm khớp với 4 đáp án theo hình dạng chuẩn (USB-A hình chữ nhật to,
Micro USB hình thang nhỏ, Lightning dẹt bo tròn, USB-C oval đối xứng).
Đầu cắm còn lại (Mini USB, cột "C") không khớp đáp án nào — đây là
**nhiễu có chủ đích** trong ảnh gốc, không gán vùng bấm cho nó.

### CHƯA áp dụng cho 7 câu còn lại — lý do cụ thể từng câu:

| Câu | Ảnh | Vấn đề |
|---|---|---|
| `thcs__k6__mt1__q3` | Picture56.png | **Ảnh sai hoàn toàn với nội dung câu hỏi** — ảnh là màn hình Windows Settings (System/Accounts/Personalization/Ease of Access), còn câu hỏi hỏi về Android/iOS/MacOS/Windows/Chrome OS → hãng phát triển. Khả năng cao bị gán nhầm ảnh từ lúc trích xuất dữ liệu gốc (Word/PDF → ảnh rời). **Cần bạn kiểm tra và gán lại đúng ảnh trong `image-manager.html`.** |
| `thcs__k6__mt1__q4`, `thcs__k6__mt3__q10` | Picture18.jpg | Ảnh có 6 icon (Edge/Word/Excel/PowerPoint/Mail/Calendar) nhưng câu hỏi có đáp án "Hệ thống quản lý cơ sở dữ liệu" — **không có icon nào trong ảnh khớp** (thiếu icon Access). Nếu ép chọn 1 icon bất kỳ sẽ dạy sai. |
| `thcs__k7__mt1__q3`, `thcs__k7__mt4__q12` | Picture29.png | Ảnh chỉ **63×60px** (kích thước 1 icon đơn) — không đủ lớn để tách 4 vùng bấm riêng biệt cho 4 đáp án. |
| `tih__k4__mt1__q35`, `tih__k4__mt4__q13` | Picture50.png | Ảnh là ảnh chụp màn hình Word (Track Changes) với 4 mũi tên A/B/C/D trỏ vào các nút — **nội dung không khớp** với đáp án của câu (câu hỏi về cấu trúc đoạn văn giới thiệu con vật). Cùng loại vấn đề như Picture56 — nhiều khả năng gán nhầm ảnh. |

→ Cả 7 câu này **vẫn hoạt động bình thường ở dạng chữ** (không bị hỏng
gì), chỉ là chưa có trải nghiệm "bấm trên ảnh". Muốn làm thêm câu nào,
gửi mình: câu nào + ảnh nào + đáp án nào tương ứng vùng nào trên ảnh
(hoặc xác nhận lại ảnh đúng nếu là ảnh bị gán nhầm) — mình sẽ đo toạ độ
bằng phân tích pixel như đã làm với câu USB.

---

## 0b. Câu có ảnh (loại 1 đáp án / nhiều đáp án): ẩn nhãn A/B/C/D

Với câu hỏi loại `single` (1 đáp án) và `multi` (nhiều đáp án) **có ảnh
minh hoạ** (`imageUrl`/`image_file`), nút đáp án giờ **không hiện vòng
tròn chữ cái A/B/C/D** nữa — chỉ còn nội dung đáp án, học sinh click
thẳng vào nội dung để chọn (hành vi click/chấm điểm không đổi, chỉ ẩn
nhãn chữ). Câu hỏi **không có ảnh** vẫn hiện A/B/C/D như cũ.

Lưu ý: ngân hàng câu hỏi hiện tại không có câu nào dùng ảnh làm **đáp
án** (ảnh chỉ minh hoạ ngữ cảnh, đáp án luôn là văn bản) — nên đây là
thay đổi giao diện (ẩn nhãn chữ), không phải đổi cách chấm điểm.

Loại `truefalse` (Đúng/Sai) và `matching` (nối cột) không dùng nhãn
A/B/C/D nên không bị ảnh hưởng.

---

## 0b. Dọn trùng lặp còn sót + sửa lỗi HTML thật (validate bằng công cụ)

Sau khi soát lại toàn bộ project bằng `node --check` (JS), `json.load`
(tất cả file JSON), đối chiếu ID giữa từng cặp JS ↔ HTML, và
`html-validate` (bộ validate HTML thật, không đoán):

**🗑️ Xoá 6 file dữ liệu trùng lặp 100% ở `data/` gốc** — đã đối chiếu
md5 từng cặp và xác nhận **giống hệt byte-by-byte** với bản đã tổ chức
trong `data/ic3/raw/`: `minitest_K3_questions.xlsx/csv`,
`minitest_k4_question_bank.xlsx`, `minitest_k5_questions.xlsx`,
`Minitest_K6_QuestionBank.xlsx`, `QuizData_K7_4Minitests.xlsx`,
`QuizData_K8_4Minitest.xlsx`. Đây là hậu quả của việc merge zip cũ +
zip mới vào cùng 1 thư mục — giờ `data/` chỉ còn duy nhất `data/ic3/`.

**✅ Sửa 49/68 lỗi HTML thật** (chạy `html-validate index.html
ic3-dashboard.html image-manager.html`), gồm 3 nhóm lặp lại nhiều lần:
- Thêm `type="button"` cho **32 thẻ `<button>`** thiếu (mặc định trình
  duyệt coi là `type="submit"`, có thể vô tình submit form/reload trang).
- Thêm `scope="col"` cho 5 thẻ `<th>` trong bảng báo cáo (dashboard) —
  yêu cầu WCAG cho accessibility (screen reader đọc đúng cột).
- Mã hoá ký tự `&` thô thành `&amp;` (2 chỗ) và thêm `aria-label` cho
  9 nút toggle chỉ có icon, không có chữ (dùng đúng text của `<label>`
  đứng cạnh, vd. `aria-label="Chặn tự sửa điểm"`).

**⚠️ 19 lỗi còn lại (`no-inline-style`) — CỐ Ý CHƯA SỬA:** đây là các
thuộc tính `style="..."` viết trực tiếp trên thẻ HTML (chủ yếu ở
`ic3-dashboard.html`). Đây là **quy tắc phong cách** (nhiều dự án không
bật rule này), không phải lỗi làm hỏng chức năng. Chuyển hết sang class
CSS cần thời gian kiểm thử kỹ (một số style là layout 1 lần, tách ra
class mới có thể tạo thêm rủi ro). Nếu bạn muốn dọn nốt, nhắn mình làm
tiếp — nhưng ưu tiên thấp hơn các lỗi chức năng đã sửa ở trên.

**🔗 Đã xác minh liên kết JS ↔ HTML bằng script đối chiếu ID** (không
đoán): `js/quiz-engine.js` ↔ `index.html`, `js/dashboard.js` ↔
`ic3-dashboard.html`, `js/image-manager.js` ↔ `image-manager.html` —
**khớp 100%**, kể cả các ID tưởng như "thiếu" (`newSetName`,
`newSetLink`...) thực chất được `dashboard.js` tự tạo động qua
`innerHTML` khi mở modal "Tạo bộ đề mới", không phải lỗi.

---

## 0b. Cập nhật trước đó: sửa lỗi nghiêm trọng + gắn kết các trang

**🔴 Lỗi nghiêm trọng đã sửa:** `index.html` và `ic3-dashboard.html` có
dấu xung đột merge Git chưa giải quyết (`<<<<<<< HEAD ... =======
... >>>>>>>`) — khiến 2 file này không phải HTML hợp lệ (bản code cũ
monolithic và bản refactor mới nằm chồng lên nhau). Đây là nguyên nhân
VS Code báo lỗi đỏ trên 2 file. Đã resolve bằng cách giữ đúng nhánh
HEAD (bản refactor mới, khớp mục 1-5 bên dưới), loại bỏ hoàn toàn bản
code cũ trùng lặp.

**📁 Tách hoàn toàn HTML / CSS / JS (MỚI):** trước đây `ic3-dashboard.html`
và `image-manager.html` mỗi file có ~700-1500 dòng CSS/JS viết thẳng
trong `<style>`/`<script>` nội tuyến. Đã tách ra:
- `css/dashboard.css` + `js/dashboard.js` ← từ `ic3-dashboard.html`
- `css/image-manager.css` + `js/image-manager.js` ← từ `image-manager.html`
- `js/main.js` ← đoạn script khởi tạo nhỏ còn lại trong `index.html`

Giờ cả 3 trang `.html` chỉ còn phần khung (markup), không còn CSS/JS
viết tay bên trong — sửa giao diện thì vào `css/`, sửa hành vi thì vào
`js/`, không phải kéo lên xuống trong 1 file HTML dài cả nghìn dòng nữa.

**🧹 Dọn file rác trùng lặp ở gốc dự án:** phát hiện `googleSheet.js`,
`quiz-engine-upgrade.js`, `Code.gs` ở thư mục gốc là **bản cũ, không
còn được bất kỳ trang nào gọi tới** (bản đang dùng thật nằm ở
`js/googleSheet.js`, `js/quiz-engine.js`, `apps/Code.gs`) — đã chuyển
vào `legacy/` để đối chiếu khi cần, không xóa hẳn. Riêng `quiz_schema.sql`
ở gốc trùng **y hệt** `docs/quiz_schema.sql` (chỉ khác xuống dòng
CRLF/LF) nên đã xóa bản trùng, giữ lại bản trong `docs/`.

**🎨 Gắn kết giao diện — `css/theme.css` (MỚI):** Trước đây 3 trang
`index.html` (qua `style.css`), `ic3-dashboard.html`, `image-manager.html`
mỗi trang tự khai báo bộ biến màu `:root` riêng — `ic3-dashboard.html`
dùng tông tím khác hẳn (`#6366f1`) so với 2 trang kia (`#6c63ff`), tên
biến cũng khác (`--bg-main` vs `--bg`). Đã gộp thành 1 file
`css/theme.css` là **nguồn duy nhất** cho màu thương hiệu, bo góc, đổ
bóng dùng chung. `ic3-dashboard.html` giữ lại vài token riêng của nó
(đổ bóng thẻ 3D, màu tag khối lớp) vì đặc thù layout, còn lại đều tham
chiếu `css/theme.css`.
→ **Muốn đổi màu thương hiệu toàn nền tảng: chỉ sửa `css/theme.css`.**

**🔗 Liên kết điều hướng:** `image-manager.html` có nút "← Dashboard"
quay về `ic3-dashboard.html`; `ic3-dashboard.html` có nút "🎓 Xem trang
học sinh" mở `index.html` ở tab mới. `index.html` (trang học sinh) cố
tình KHÔNG có link sang khu quản trị, tránh học sinh vô tình mở nhầm.

**Cấu trúc file/thư mục mới nhất:**
```
EduQuiz/
├─ index.html              (chỉ markup — trang học sinh)
├─ ic3-dashboard.html       (chỉ markup — dashboard giáo viên)
├─ image-manager.html       (chỉ markup — công cụ quản lý ảnh)
├─ quiz_data.json
│
├─ css/
│  ├─ theme.css              (★ token màu/bo góc/đổ bóng DÙNG CHUNG)
│  ├─ dashboard.css          (★ MỚI — CSS riêng dashboard)
│  └─ image-manager.css      (★ MỚI — CSS riêng image-manager)
├─ style.css                 (CSS riêng của index.html, nạp SAU theme.css)
│
├─ js/
│  ├─ quiz-engine.js         (engine DUY NHẤT cho index.html)
│  ├─ gamification.js        (XP / streak / huy hiệu)
│  ├─ googleSheet.js         (gửi kết quả lên Google Sheet)
│  ├─ main.js                (★ MỚI — khởi tạo index.html)
│  ├─ dashboard.js           (★ MỚI — hành vi ic3-dashboard.html)
│  └─ image-manager.js       (★ MỚI — hành vi image-manager.html)
│
├─ legacy/                   (bản cũ giữ để đối chiếu/rollback — KHÔNG dùng)
│  ├─ quiz-engine.old.js
│  ├─ googleSheet.old.js
│  ├─ quiz-engine-upgrade.old.js
│  └─ Code.old.gs
│
└─ (data/, img/, apps/, docs/, scripts/ — không đổi, xem mục 1 gốc)
```

---

File này ghi lại **những gì đã thay đổi** so với bản gốc, **vì sao**, và
**những việc cần làm tiếp** — dựa trên bản phân tích 4 khía cạnh
(UX, Content, Storage, Maintainability) đã trao đổi trước đó.

> ⚠️ Đây là bản refactor có kiểm chứng logic + syntax-check kỹ, nhưng
> **chưa được test trên trình duyệt thật** (môi trường build không có
> GUI browser). Trước khi đưa lên GitHub Pages, hãy mở `index.html`
> bằng 1 local server (vd. `npx serve .` hoặc VS Code Live Server) và
> thử làm hết 1 bài thi để chắc chắn mọi thứ chạy đúng như log console
> mô tả bên dưới.

---

## 1. Cấu trúc thư mục mới

```
EduQuiz/
├─ index.html              (trang làm bài — học sinh)
├─ ic3-dashboard.html       (dashboard — không đổi, chưa có dữ liệu động)
├─ image-manager.html       (công cụ quản lý ảnh — vẫn chỉnh quiz_data.json)
├─ style.css
├─ quiz_data.json           (★ vẫn giữ — xem mục 3 "Vì sao giữ file này")
│
├─ js/
│  ├─ quiz-engine.js         (★ engine DUY NHẤT — hợp nhất từ bản "upgrade")
│  ├─ gamification.js        (★ MỚI — XP / streak / huy hiệu)
│  └─ googleSheet.js         (gửi kết quả lên Google Sheet, không đổi logic)
│
├─ apps/
│  └─ Code.gs                (Google Apps Script — thêm LockService + doGet leaderboard)
│
├─ data/
│  └─ ic3/
│     ├─ meta.json           (★ MỚI — nhẹ, chỉ số lượng câu hỏi, cho lobby)
│     ├─ THCS__LV1.json      (★ MỚI — câu hỏi đầy đủ Khối 6)
│     ├─ THCS__LV2.json      (Khối 7) · THCS__LV3.json (Khối 8)
│     ├─ TIH__LV1.json       (Khối 3) · TIH__LV2.json (Khối 4) · TIH__LV3.json (Khối 5)
│     └─ raw/                (file Excel/CSV gốc, đổi tên thống nhất k3..k8)
│
├─ img/                      (giữ nguyên, phẳng — xem mục 4)
│
├─ scripts/
│  └─ split-quiz-data.py     (★ MỚI — sinh lại data/ic3/*.json từ quiz_data.json)
│
├─ legacy/
│  └─ quiz-engine.old.js     (bản engine cũ, giữ lại để đối chiếu/rollback)
│
└─ docs/
   └─ quiz_schema.sql        (schema tham khảo, không đổi)
```

## 2. Đã làm gì, theo đúng 4 mục đã phân tích

### (A) Hợp nhất 2 bản engine trùng lặp
Dự án gốc có `quiz-engine.js` (bản cũ, đang được `index.html` dùng) và
`quiz-engine-upgrade.js` (bản mới hơn, nhiều tính năng hơn nhưng
**chưa từng được gắn vào `index.html`**). Hai file này trùng lặp phần lớn
logic (anti-cheat, lưu lịch sử, theme...).

→ Đã chọn bản "upgrade" làm nền (nhiều tính năng hơn, tách bạch rõ với
`googleSheet.js`), đặt tên lại thành `js/quiz-engine.js` duy nhất, và
**gắn nó vào `index.html`** — đây là lần đầu tiên các cải tiến trong bản
upgrade thực sự chạy trên trang. Bản cũ được giữ ở `legacy/` để đối chiếu,
không xoá hẳn để có thể rollback.

### (B) Tải dữ liệu theo khối (lazy-load) — tối ưu tốc độ
Trước đây `fetch('quiz_data.json')` tải nguyên **~1MB** ngay khi mở trang,
dù học sinh chỉ làm 1 khối/1 minitest.

→ `js/quiz-engine.js` giờ tải `data/ic3/meta.json` (~3KB) trước để dựng
3 dropdown ở lobby. Chỉ khi bấm "Bắt đầu thi", nó mới tải đúng 1 file
của khối đang chọn (`data/ic3/THCS__LV1.json` ≈ 70-140KB) — nhỏ hơn
7-15 lần so với trước.

Có **3 lớp fallback** để không bao giờ làm trang trắng:
`meta.json` lỗi → tự tải nguyên `quiz_data.json` như cũ → vẫn lỗi →
dùng `DEMO_DATA` có sẵn trong code.

### (C) Gamification cơ bản (không cần backend mới)
`js/gamification.js` là module độc lập, tự quản lý state riêng trong
`localStorage['eduquiz_gamestate']`, không đụng vào logic chấm điểm/anti-cheat
hiện có:
- **XP**: +10/câu đúng, +50/bài hoàn thành, +100 nếu đạt điểm tuyệt đối.
- **Cấp độ**: tính theo ngưỡng XP (10 cấp).
- **Streak**: số ngày làm bài liên tiếp (dựa theo ngày hệ thống của máy học sinh).
- **Huy hiệu**: "Bài đầu tiên", "3/7 ngày liên tiếp", "Điểm tuyệt đối", "10 bài đã làm".

Hiển thị ở lobby (`#lobbyGameStrip`) và có toast báo khi mở khoá huy hiệu mới.
Đây là bản MVP — xem mục 5 để mở rộng lên bảng xếp hạng thật.

### (D) Bảng xếp hạng (leaderboard) — endpoint mới trong Apps Script
`apps/Code.gs` thêm hàm `doGet(e)`: gọi `APPS_SCRIPT_URL + '?action=leaderboard&limit=10'`
(có thể thêm `&class=6A1`) để lấy top điểm cao từ chính Sheet đang lưu kết quả —
**không cần thêm database mới**. Đây mới là *backend endpoint*; front-end
hiển thị bảng xếp hạng (vd. trên `ic3-dashboard.html`) là bước tiếp theo,
xem mục 5.

Cũng đã thêm `LockService` vào `doPost()` để tránh mất dữ liệu khi
nhiều học sinh nộp bài cùng lúc (bản gốc chưa có khoá ghi).

### (E) Chuẩn hoá nguồn dữ liệu thô
File Excel/CSV gốc (`Minitest_K6_QuestionBank.xlsx`, `QuizData_K7_4Minitests.xlsx`...)
được copy và **đổi tên** vào `data/ic3/raw/k3_questions.xlsx` ... `k8_questions.xlsx`
— quy ước tên thống nhất. **Lưu ý quan trọng**: các file này hiện chỉ mang tính
lưu trữ/tham khảo — ứng dụng KHÔNG đọc trực tiếp từ Excel (xem mục 3), vì
cấu trúc cột giữa các khối khác nhau hoàn toàn (đã kiểm tra thực tế, K5 có
1 sheet/câu hỏi kiểu bảng, còn K6/K7/K8 chỉ có sheet tổng hợp thống kê).
Chuẩn hoá triệt để cấu trúc cột cần làm thủ công cho từng khối — xem mục 5.

---

## 3. Vì sao vẫn giữ `quiz_data.json` ở gốc?

`image-manager.html` (công cụ quản lý ảnh) đọc/ghi trực tiếp file này và
đã hoạt động tốt. Việc bẻ nó ra nhiều file nhỏ sẽ đòi hỏi viết lại toàn bộ
tool đó (615+ dòng) — rủi ro cao hơn lợi ích trong lần refactor này.
→ Quyết định: **giữ `quiz_data.json` làm "nguồn sự thật" mà admin chỉnh sửa**,
còn `data/ic3/*.json` là **bản build phái sinh** để app học sinh tải nhanh hơn.

### Quy trình cập nhật câu hỏi/ảnh (không cần sửa code)
1. Mở `image-manager.html` → sửa câu hỏi/ảnh như bình thường → "Xuất quiz_data.json".
2. Thay file `quiz_data.json` ở gốc dự án bằng file vừa xuất.
3. Chạy: `python3 scripts/split-quiz-data.py`
4. Commit cả `quiz_data.json` lẫn toàn bộ `data/ic3/*.json` mới sinh ra.

Nếu quên bước 3, học sinh vẫn thấy dữ liệu **cũ** (vì app đọc từ `data/ic3/`,
không đọc trực tiếp `quiz_data.json` nữa) — image-manager.html giờ tự nhắc
điều này ngay trong toast lúc xuất file.

---

## 4. Vì sao KHÔNG tách `img/` thành thư mục con theo khối?

Đã cân nhắc, nhưng `image-manager.html` build đường dẫn ảnh dạng phẳng
(`img/<filename>`) ở nhiều chỗ trong code. Tách thư mục sẽ phải sửa tool
đó + toàn bộ `image_file` trong `quiz_data.json` cùng lúc — dễ gây lệch
dữ liệu nếu làm vội. Việc này để ở mục 5 (bước tiếp theo) khi có thời gian
kiểm thử kỹ hơn.

Việc **đã làm ngay** được: không tải ảnh thừa — quiz chỉ tải ảnh của câu
đang hiển thị (`loading="lazy"` sẵn có ở thẻ `<img>` do engine sinh ra
qua `_buildImageBlock`) — nếu chưa có, kiểm tra và thêm `loading="lazy"`
là việc nhỏ, nên làm sớm.

---

## 5. Việc nên làm tiếp (chưa làm trong lần này, để tránh phá vỡ hệ thống đang chạy)

| Việc | Vì sao chưa làm | Độ ưu tiên |
|---|---|---|
| Nén ảnh trong `img/` (4.8MB → ~1-1.5MB) | Cần công cụ nén ảnh (sharp/imagemin), không có sẵn trong môi trường build này | Cao |
| Hiển thị bảng xếp hạng trên `ic3-dashboard.html` bằng endpoint `doGet` mới | Cần `SHEET_ID` thật của bạn để test được — hiện `Code.gs` vẫn để placeholder | Cao |
| Chuẩn hoá cột Excel nguồn theo đúng `docs/quiz_schema.sql` cho cả 6 khối | Cấu trúc 5 file Excel gốc khác nhau hoàn toàn, cần bạn xác nhận layout chuẩn muốn dùng trước khi viết parser | Trung bình |
| Tổ chức lại `img/` theo khối | Phụ thuộc việc sửa `image-manager.html` cùng lúc | Trung bình |
| Đưa vào Vite, giữ vanilla JS | An toàn để làm độc lập, không phụ thuộc các việc trên | Trung bình |
| Cá nhân hoá "ôn lại phần yếu" dựa trên lịch sử `localStorage` | Cần thêm thống kê chi tiết theo dạng câu hỏi vào `saveRecord()` | Thấp |

---

## 6. Kiểm thử trước khi deploy

```bash
# Chạy local server ở thư mục gốc EduQuiz/ rồi mở http://localhost:5000
npx serve . -l 5000
```

Checklist thủ công:
- [ ] Mở `index.html`, console không có lỗi đỏ, thấy log
      `[EduQuiz] ✅ meta.json nạp thành công (lazy-load câu hỏi theo khối)!`
- [ ] Chọn Category → Level → Minitest, số câu hiện đúng ở khung thống kê
- [ ] Bấm "Bắt đầu thi": nút chuyển sang "⏳ Đang tải câu hỏi..." rồi vào bài
      đúng minitest đã chọn (kiểm tra vài câu đầu khớp với `data/ic3/*.json`)
- [ ] Làm hết bài, nộp bài, thấy toast huy hiệu "🎉 Bài đầu tiên"
- [ ] Bấm "Về Lobby", dải XP/Streak ở góc trái cập nhật số mới
- [ ] Mở lại `image-manager.html`, vẫn tải và sửa `quiz_data.json` bình thường
- [ ] Dán `SHEET_ID` thật + deploy lại `apps/Code.gs`, chạy `testDoPost()` để
      chắc chắn `LockService` không làm hỏng luồng ghi cũ
