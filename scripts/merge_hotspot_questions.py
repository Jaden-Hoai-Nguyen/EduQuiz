#!/usr/bin/env python3
"""
merge_hotspot_questions.py
────────────────────────────────────────────────────────────────────────
Đưa các câu hỏi dạng "Hotspot" (bấm vào đúng vị trí trên hình) nằm trong
data/manual_review/*.json vào quiz_data.json — nguồn dữ liệu gốc — dưới
dạng 1 minitest mới tên "Minitest Hotspot" cho mỗi khối (level).

Vì sao chỉ merge Hotspot mà không merge DND / WordBank / Sequence /
MultipleChoiceText? Vì engine hiện tại (js/quiz-engine.js) mới hỗ trợ
renderer cho loại "hotspot" (xem hàm renderHotspot). Các loại còn lại
cần thiết kế UI kéo-thả / điền từ riêng — để lại cho một đợt sau, dữ
liệu gốc của chúng vẫn còn nguyên trong data/manual_review/ khi cần.

Định dạng câu hỏi "hotspot" mới trong quiz_data.json:
{
  "type": "hotspot",
  "question": "...",
  "image": true,
  "image_file": "img-xxx.png",
  "imageUrl": "img/img-xxx.png",
  "areas": [
    {"id": "a1", "shape": "rectangle", "x":.., "y":.., "w":.., "h":.., "correct": true},
    ...
  ],
  "id": <int, tiếp theo trong level>,
  "uid": "<cat>__<level>__hotspot__q<n>"
}

Cách chạy:
  python3 scripts/merge_hotspot_questions.py
  (đọc quiz_data.json + data/manual_review/*.json, GHI ĐÈ quiz_data.json)

Sau khi chạy xong, luôn chạy tiếp:
  python3 scripts/split-quiz-data.py
để đồng bộ lại data/ic3/*.json + meta.json từ quiz_data.json mới.
────────────────────────────────────────────────────────────────────────
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUIZ_DATA = ROOT / "quiz_data.json"
REVIEW_DIR = ROOT / "data" / "manual_review"
HOTSPOT_MT_NAME = "Minitest Hotspot"


def load_review_file(cat_id: str, level_id: str):
    path = REVIEW_DIR / f"{cat_id}__{level_id}_manual_review.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def convert_hotspot_entry(entry: dict, cat_id: str, level_id: str, next_id: int, idx_in_level: int) -> dict:
    areas = []
    for i, area in enumerate(entry.get("hotspot_areas", []), start=1):
        rp = area.get("rect_percent", {})
        areas.append({
            "id": f"a{i}",
            "shape": area.get("shape", "rectangle"),
            "x": rp.get("x", 0),
            "y": rp.get("y", 0),
            "w": rp.get("w", 0),
            "h": rp.get("h", 0),
            "correct": bool(area.get("correct", True)),
        })

    image_file = entry.get("image_file")
    uid = f"{cat_id.lower()}__{level_id.lower()}__hotspot__q{idx_in_level}"

    return {
        "question": entry.get("question", ""),
        "type": "hotspot",
        "image": True,
        "image_file": image_file,
        "imageUrl": entry.get("imageUrl") or (f"img/{image_file}" if image_file else None),
        "areas": areas,
        "id": next_id,
        "uid": uid,
    }


def main():
    if not QUIZ_DATA.exists():
        sys.exit(f"❌ Không tìm thấy {QUIZ_DATA}")

    data = json.loads(QUIZ_DATA.read_text(encoding="utf-8"))

    total_added = 0
    total_skipped_no_image = 0

    for cat in data.get("categories", []):
        cat_id = cat.get("id")
        for level in cat.get("levels", []):
            level_id = level.get("id")
            minitests = level.setdefault("minitests", {})

            # Bỏ qua nếu đã merge trước đó (chạy script 2 lần không bị trùng)
            if HOTSPOT_MT_NAME in minitests:
                print(f"  ↷ {cat_id} {level_id}: đã có '{HOTSPOT_MT_NAME}', bỏ qua (xoá key này trong "
                      f"quiz_data.json nếu muốn merge lại từ đầu).")
                continue

            review_items = load_review_file(cat_id, level_id)
            hotspot_items = [
                it for it in review_items
                if it.get("original_type") == "Hotspot"
                and it.get("image_file")
                and it.get("hotspot_areas")
            ]
            if not hotspot_items:
                continue

            # id tiếp theo (không trùng với id đã có trong level) ─────
            existing_ids = [q.get("id", 0) for mt in minitests.values() for q in mt]
            next_id = (max(existing_ids) if existing_ids else 0) + 1

            new_questions = []
            for i, item in enumerate(hotspot_items, start=1):
                q = convert_hotspot_entry(item, cat_id, level_id, next_id, i)
                new_questions.append(q)
                next_id += 1

            minitests[HOTSPOT_MT_NAME] = new_questions
            total_added += len(new_questions)
            print(f"  ✓ {cat_id} {level_id}: +{len(new_questions)} câu hotspot (minitest mới: '{HOTSPOT_MT_NAME}')")

    QUIZ_DATA.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    print(f"\n✅ Đã thêm {total_added} câu hỏi hotspot vào quiz_data.json.")
    if total_skipped_no_image:
        print(f"   (Bỏ qua {total_skipped_no_image} câu không có ảnh)")
    print("👉 Chạy tiếp: python3 scripts/split-quiz-data.py để đồng bộ data/ic3/*.json + meta.json")


if __name__ == "__main__":
    main()
