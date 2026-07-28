#!/usr/bin/env python3
"""
add_hotspot_distractors.py  (v2 — đặt vùng theo LƯỚI, logic & đều hơn)
────────────────────────────────────────────────────────────────────────
Vấn đề: dữ liệu Hotspot gốc (trích từ file iSpring) chỉ ghi lại toạ độ
CÁC VÙNG ĐÚNG — không có vùng nhiễu. Kết quả: mỗi câu hotspot chỉ có 1
(hoặc vài) chỗ bấm được trên cả tấm ảnh, học sinh không thực sự phải
"chọn" giữa nhiều đáp án.

Script này sinh thêm các vùng NHIỄU (distractor, correct=false).

── v2 khác v1 (bản random thuần) ở chỗ nào? ──────────────────────────
v1 thả vùng nhiễu ở toạ độ ngẫu nhiên bất kỳ trên ảnh (chỉ tránh đè
lên nhau) → dễ bị dồn cụm 1 góc hoặc nằm rải rác vô tổ chức, trông
"không logic". v2 chia ảnh thành LƯỚI ô đều nhau (mặc định 3×3), mỗi
vùng nhiễu được gán vào 1 Ô KHÁC với ô chứa vùng đúng và khác ô của
các vùng nhiễu còn lại (nếu đủ ô trống) → 4-6 lựa chọn được rải đều
khắp bố cục ảnh, giống cách người thiết kế đề thi thật sự đặt câu hỏi
hotspot (các lựa chọn tách bạch theo từng khu vực, không chồng chéo,
không dồn cụm).

Vẫn còn 1 giới hạn cố hữu: script không "hiểu" nội dung ảnh (không có
nhận diện icon/nút bấm thật), nên vùng nhiễu là 1 khung hình chữ nhật/
oval trống ở khu vực khác, không phải 1 icon/nút cụ thể khác trong ảnh.
Nếu cần độ chính xác tuyệt đối theo từng chi tiết UI thật trong ảnh,
cách chắc chắn nhất vẫn là đội ngũ nội dung xem ảnh và tự khoanh vùng
nhiễu bằng tay (có thể sửa trực tiếp trên chính danh sách area JSON này).

Thuật toán:
  1. Chia ảnh thành lưới GRID_COLS × GRID_ROWS ô đều nhau.
  2. Xác định ô chứa từng vùng đúng (theo tâm vùng) → đánh dấu "đã dùng".
  3. Trộn (shuffle, seed theo uid câu hỏi) danh sách ô còn trống, ưu
     tiên gán mỗi vùng nhiễu vào 1 ô riêng biệt chưa ai dùng.
  4. Nếu số ô trống ít hơn số vùng nhiễu cần thêm (hiếm khi xảy ra vì
     lưới có nhiều ô hơn 3-6 vùng cần), quay vòng lại sang các ô đã bị
     vùng đúng chiếm — vẫn kiểm tra chồng lấn (rejection sampling)
     trong phạm vi ô đó để không đè lên vùng đúng.
  5. Trong mỗi ô, vùng nhiễu được đặt với kích thước theo TỈ LỆ khung
     hình (aspect ratio) trung bình của các vùng đúng trong câu — để
     trông tự nhiên, không bị méo dạng — và bị giới hạn không vượt
     quá kích thước ô (trừ hao lề CELL_MARGIN).
  6. Rejection sampling trong ô để không đè lên vùng đúng/nhiễu khác.

Cách chạy:
  python3 scripts/add_hotspot_distractors.py
  (đọc + GHI ĐÈ quiz_data.json)

Sau khi chạy xong, luôn chạy tiếp:
  python3 scripts/split-quiz-data.py
────────────────────────────────────────────────────────────────────────
"""
import json
import pathlib
import random
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUIZ_DATA = ROOT / "quiz_data.json"
HOTSPOT_MT_NAME = "Minitest Hotspot"

DISTRACTORS_PER_QUESTION = 3
GRID_COLS = 3
GRID_ROWS = 3
CELL_MARGIN = 2.0     # % lề bên trong mỗi ô, tránh vùng nhiễu dính sát viền ô
PADDING = 1.5          # % khoảng đệm tối thiểu giữa 2 vùng bất kỳ
SIZE_JITTER = 0.12     # dao động kích thước nhẹ để không phải mọi vùng nhiễu giống hệt nhau
MAX_ATTEMPTS_PER_CELL = 60


def _rects_overlap(a, b, padding=0.0):
    """True nếu 2 hình chữ nhật (x,y,w,h theo %) đè/dính nhau (có tính khoảng đệm)."""
    return not (
        a["x"] + a["w"] + padding <= b["x"] or
        b["x"] + b["w"] + padding <= a["x"] or
        a["y"] + a["h"] + padding <= b["y"] or
        b["y"] + b["h"] + padding <= a["y"]
    )


def _cell_bounds(col, row):
    cw = 100.0 / GRID_COLS
    ch = 100.0 / GRID_ROWS
    return {
        "x0": col * cw + CELL_MARGIN,
        "y0": row * ch + CELL_MARGIN,
        "x1": (col + 1) * cw - CELL_MARGIN,
        "y1": (row + 1) * ch - CELL_MARGIN,
    }


def _cell_of_point(px, py):
    col = min(int(px / (100.0 / GRID_COLS)), GRID_COLS - 1)
    row = min(int(py / (100.0 / GRID_ROWS)), GRID_ROWS - 1)
    return (col, row)


def _place_in_cell(cell, target_w, target_h, shape, existing_areas, rng):
    """Thử đặt 1 vùng kích thước ~ (target_w, target_h) bên trong ranh giới `cell`."""
    b = _cell_bounds(*cell)
    cell_w = max(b["x1"] - b["x0"], 4.0)
    cell_h = max(b["y1"] - b["y0"], 4.0)

    for attempt in range(MAX_ATTEMPTS_PER_CELL):
        shrink = 1.0 if attempt < MAX_ATTEMPTS_PER_CELL * 0.6 else 0.7
        w = min(target_w * shrink * rng.uniform(1 - SIZE_JITTER, 1 + SIZE_JITTER), cell_w)
        h = min(target_h * shrink * rng.uniform(1 - SIZE_JITTER, 1 + SIZE_JITTER), cell_h)
        w = max(w, 3.0)
        h = max(h, 3.0)

        max_x = max(b["x0"], b["x1"] - w)
        max_y = max(b["y0"], b["y1"] - h)
        x = rng.uniform(b["x0"], max_x) if max_x > b["x0"] else b["x0"]
        y = rng.uniform(b["y0"], max_y) if max_y > b["y0"] else b["y0"]

        candidate = {"x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(h, 2)}
        if not any(_rects_overlap(candidate, a, PADDING) for a in existing_areas):
            candidate["shape"] = shape
            return candidate

    return None


def _shuffled(cells, rng):
    lst = list(cells)
    rng.shuffle(lst)
    return lst


def add_distractors_to_question(q):
    areas = q.get("areas", [])
    correct_areas = [a for a in areas if a.get("correct")]
    if not correct_areas:
        return q, 0

    # Tỉ lệ khung hình + kích thước "gọn" cho vùng nhiễu, dựa theo vùng đúng của
    # chính câu này nhưng chặn trong khoảng hợp lý để luôn vừa 1 ô lưới.
    avg_w = sum(a["w"] for a in correct_areas) / len(correct_areas)
    avg_h = sum(a["h"] for a in correct_areas) / len(correct_areas)
    aspect = avg_w / avg_h if avg_h else 1.0
    cell_w_max = 100.0 / GRID_COLS - 2 * CELL_MARGIN
    cell_h_max = 100.0 / GRID_ROWS - 2 * CELL_MARGIN
    target_h = min(max(avg_h, 8.0), cell_h_max, 22.0)
    target_w = min(max(target_h * aspect, 8.0), cell_w_max, 26.0)

    shapes = [a.get("shape", "rectangle") for a in correct_areas]
    shape = max(set(shapes), key=shapes.count)

    rng = random.Random(q.get("uid", ""))  # seed cố định theo uid → kết quả ổn định qua nhiều lần chạy

    existing_nums = [int(a["id"][1:]) for a in areas if a.get("id", "").startswith("a") and a["id"][1:].isdigit()]
    next_num = (max(existing_nums) if existing_nums else len(areas)) + 1

    # Ô nào đã bị vùng đúng "chiếm" (theo tâm) → ưu tiên tránh, chỉ dùng khi hết ô trống
    occupied_cells = {
        _cell_of_point(a["x"] + a["w"] / 2, a["y"] + a["h"] / 2) for a in correct_areas
    }
    all_cells = [(c, r) for r in range(GRID_ROWS) for c in range(GRID_COLS)]
    free_cells = _shuffled([c for c in all_cells if c not in occupied_cells], rng)
    cell_queue = free_cells + _shuffled(occupied_cells, rng)

    placed = list(areas)
    added = 0
    ci = 0
    while added < DISTRACTORS_PER_QUESTION and ci < len(cell_queue):
        cell = cell_queue[ci]
        ci += 1
        spot = _place_in_cell(cell, target_w, target_h, shape, placed, rng)
        if spot is None:
            continue
        spot["id"] = f"a{next_num}"
        spot["correct"] = False
        next_num += 1
        areas.append(spot)
        placed.append(spot)
        added += 1

    q["areas"] = areas
    return q, added


def main():
    if not QUIZ_DATA.exists():
        sys.exit(f"❌ Không tìm thấy {QUIZ_DATA}")

    data = json.loads(QUIZ_DATA.read_text(encoding="utf-8"))

    total_q = 0
    total_distractors = 0
    already_has_distractor = 0

    for cat in data.get("categories", []):
        for level in cat.get("levels", []):
            mt = level.get("minitests", {}).get(HOTSPOT_MT_NAME)
            if not mt:
                continue
            for q in mt:
                total_q += 1
                if any(not a.get("correct", True) for a in q.get("areas", [])):
                    already_has_distractor += 1
                    continue  # đã có vùng nhiễu (chạy script này lần 2) → bỏ qua, không thêm chồng
                q, added = add_distractors_to_question(q)
                total_distractors += added

    QUIZ_DATA.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    print(f"✅ Đã xử lý {total_q} câu hotspot, thêm tổng {total_distractors} vùng nhiễu "
          f"(đặt theo lưới {GRID_COLS}×{GRID_ROWS}).")
    if already_has_distractor:
        print(f"   (Bỏ qua {already_has_distractor} câu đã có vùng nhiễu từ trước.)")
    print("👉 Chạy tiếp: python3 scripts/split-quiz-data.py để đồng bộ data/ic3/*.json + meta.json")


if __name__ == "__main__":
    main()
