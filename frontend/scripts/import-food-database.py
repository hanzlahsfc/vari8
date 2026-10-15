#!/usr/bin/env python3
"""Import complete nutrition entries from the source food database workbook."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import openpyxl


DEFAULT_SOURCE = Path.home() / "Documents" / "food database.xlsx"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "src" / "data" / "food-database.json"


def numeric(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    workbook = openpyxl.load_workbook(args.source, read_only=True, data_only=True)
    sheet = workbook["Nutrition Database"]
    rows = sheet.iter_rows(values_only=True)
    next(rows)  # title row
    header = next(rows)
    expected = ("NO.", "FOOD", "AMOUNT", "UNIT", "CALORIES (KCAL)", "PROTEIN (G)", "CARBS (G)", "FATS (G)")
    actual = tuple(str(value).strip().upper() for value in header[1:9])
    if actual != expected:
        raise ValueError(f"Unexpected workbook columns: {actual!r}")

    complete_named = 0
    incomplete: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    foods: list[dict[str, Any]] = []
    duplicate_count = 0
    for row_number, row in enumerate(rows, start=3):
        source_no, name, amount, unit, calories, protein, carbs, fat = row[1:9]
        if name is None or not str(name).strip():
            continue
        name = str(name).strip()
        complete_named += 1
        if not (numeric(amount) and amount > 0 and isinstance(unit, str) and unit.strip()):
            incomplete.append({"row": row_number, "name": name, "reason": "missing or invalid amount/unit"})
            continue
        values = (calories, protein, carbs, fat)
        if not all(numeric(value) for value in values):
            missing = [field for field, value in zip(("calories", "protein", "carbs", "fat"), values) if not numeric(value)]
            incomplete.append({"row": row_number, "name": name, "reason": "missing " + ", ".join(missing)})
            continue

        amount_number = int(amount) if isinstance(amount, int) or amount.is_integer() else amount
        key = (name, amount_number, unit.strip(), *values)
        if key in seen:
            duplicate_count += 1
            continue
        seen.add(key)
        source_id = int(source_no) if numeric(source_no) else row_number
        foods.append(
            {
                "id": f"food-{source_id:03d}",
                "name": name,
                "amount": amount_number,
                "unit": unit.strip(),
                "protein": protein,
                "carbs": carbs,
                "fat": fat,
                "calories": calories,
            }
        )

    ids = [food["id"] for food in foods]
    if len(ids) != len(set(ids)):
        raise ValueError("Generated food IDs are not unique")

    payload = {
        "source": "food database.xlsx",
        "basis": "as listed in source",
        "foods": foods,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Named source rows: {complete_named}")
    print(f"Incomplete entries excluded: {len(incomplete)}")
    for entry in incomplete:
        print(f"  row {entry['row']}: {entry['name']} ({entry['reason']})")
    print(f"Exact duplicate rows omitted: {duplicate_count}")
    print(f"Imported foods: {len(foods)}")
    print(f"Output: {args.output}")


if __name__ == "__main__":
    main()
