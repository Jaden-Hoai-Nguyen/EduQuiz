#!/usr/bin/env python3
"""
split-quiz-data.py
────────────────────────────────────────────────────────────────────────
Tách quiz_data.json (bản gộp, ~1MB) thành:

  data/ic3/meta.json        → cây categories/levels/minitests, KHÔNG chứa
                               câu hỏi (chỉ số lượng + thống kê loại câu),
                               dùng để đổ 3 dropdown ở màn hình lobby.
  data/ic3/<level_id>.json  → toàn bộ câu hỏi của MỘT khối lớp (level),
                               chỉ được tải khi học sinh thực sự bắt đầu
                               làm bài ở khối đó.

Vì sao tách theo level_id chứ không theo category?
  Mỗi category (vd "THCS – IC3") có thể có nhiều khối (K6, K7, K8...).
  Học sinh chỉ làm 1 khối/lần → tách theo level_id giúp file tải về nhỏ
  nhất có thể (thay vì ~1MB, mỗi lần chỉ tải ~100-150KB).

Cách chạy:
  python3 scripts/split-quiz-data.py
  (đọc quiz_data.json ở thư mục gốc dự án, ghi ra data/ic3/)

Khi nào cần chạy lại:
  Mỗi khi quiz_data.json được cập nhật (thêm câu hỏi mới, sửa đáp án...)
  qua image-manager.html hoặc chỉnh tay — chạy lại script này rồi commit
  cả quiz_data.json lẫn data/ic3/*.json.
────────────────────────────────────────────────────────────────────────
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "quiz_data.json"
OUT_DIR = ROOT / "data" / "ic3"

TYPE_LABELS = {
    "single": "single",
    "multi": "multi",
    "truefalse": "truefalse",
    "matching": "matching",
}


def main():
    if not SRC.exists():
        sys.exit(f"❌ Không tìm thấy {SRC}")

    data = json.loads(SRC.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    meta = {"categories": []}
    total_levels = 0
    total_questions = 0

    for cat in data.get("categories", []):
        meta_cat = {
            "id": cat.get("id"),
            "name": cat.get("name"),
            "color": cat.get("color"),
            "levels": [],
        }

        for level in cat.get("levels", []):
            level_id = level.get("id")
            minitests = level.get("minitests", {})

            # ── Ghi file riêng cho level này (đầy đủ câu hỏi) ──────────
            # LƯU Ý: level_id (LV1, LV2...) KHÔNG duy nhất giữa các category
            # (vd. THCS.LV1 = Khối 6, TIH.LV1 = Khối 3) → phải namespace
            # theo "{cat_id}__{level_id}" để tránh 2 khối ghi đè lên nhau.
            file_key = f"{cat.get('id')}__{level_id}"
            level_file = OUT_DIR / f"{file_key}.json"
            level_file.write_text(
                json.dumps(
                    {
                        "id": level_id,
                        "name": level.get("name"),
                        "grade": level.get("grade"),
                        "cat_id": cat.get("id"),
                        "minitests": minitests,
                    },
                    ensure_ascii=False,
                    indent=None,
                    separators=(",", ":"),
                ),
                encoding="utf-8",
            )

            # ── Ghi thống kê nhẹ vào meta (không kèm câu hỏi) ──────────
            meta_minitests = {}
            for name, qs in minitests.items():
                type_counts = {}
                for q in qs:
                    t = q.get("type", "unknown")
                    type_counts[t] = type_counts.get(t, 0) + 1
                meta_minitests[name] = {"count": len(qs), "types": type_counts}
                total_questions += len(qs)

            meta_cat["levels"].append(
                {
                    "id": level_id,
                    "file": f"{file_key}.json",  # tên file dữ liệu đầy đủ, front-end fetch theo giá trị này
                    "name": level.get("name"),
                    "grade": level.get("grade"),
                    "minitests": meta_minitests,
                }
            )
            total_levels += 1
            print(f"  ✓ {level_file.relative_to(ROOT)}  ({sum(m['count'] for m in meta_minitests.values())} câu)")

        meta["categories"].append(meta_cat)

    meta_file = OUT_DIR / "meta.json"
    meta_file.write_text(
        json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    print(f"\n✅ Đã tách {total_levels} khối / {total_questions} câu hỏi.")
    print(f"   meta.json: {meta_file.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
