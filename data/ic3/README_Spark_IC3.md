# Bộ câu hỏi Spark & IC3 (GS6) — chuyển đổi từ iSpring QuizMaker

Thay thế cho bộ câu hỏi THCS/TIH cũ (K3-K8). Nguồn gốc: 6 file `.quiz`
(iSpring QuizMaker) `Spark_GS6_LV1/2/3` và `IC3_GS6_LV1/2/3`.

## Cấu trúc
- `Spark__LV1/2/3.json`, `IC3__LV1/2/3.json` — dữ liệu câu hỏi đầy đủ, được
  `meta.json` trỏ tới qua field `file` (engine fetch tại `data/ic3/<file>`).
- `meta.json` — chỉ 2 category: `Spark` và `IC3`, mỗi category 3 level
  (`LV1/LV2/LV3`, giữ nguyên tên gốc "GS6 LV1/2/3", **không** tương ứng
  K3-K8 hay K6-K8 như quy ước cũ).
- `../manual_review/*.json` — 61/1070 câu hỏi gốc (dạng Hotspot, kéo-thả
  WordBank/DND, sắp xếp Sequence, hoặc MultipleChoiceText có >2 lựa chọn)
  **không** có type tương ứng trong schema hiện tại (`single/multi/
  truefalse/matching`) nên chưa đưa vào quiz — để tham khảo, bổ sung thủ
  công sau nếu cần.

## Loại câu hỏi đã chuyển tự động
- `MultipleChoice` → `single`
- `MultipleResponse` → `multi`
- `Matching` → `matching`
- `MultipleChoiceText` nhị phân nhất quán (mọi dòng dùng đúng 1 cặp lựa
  chọn, vd Đúng/Sai, Có/Không, Phần cứng/Phần mềm...) → `truefalse`, với
  `label_true`/`label_false` lấy đúng theo cặp nhãn gốc của từng câu (có
  thể không mang nghĩa đúng/sai theo nghĩa đen — UI hiển thị truefalse
  cần dùng đúng 2 field này thay vì hard-code "Đúng/Sai").

## uid
`{cat}__{lv}__mt{n}__q{sort}` viết thường, vd `spark__lv1__mt1__q1`.
