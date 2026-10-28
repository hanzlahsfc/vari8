#!/usr/bin/env python3
"""Capture catalogue inputs without executing external worksheet lookups."""

from __future__ import annotations

import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
from pathlib import Path
import posixpath
import re
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET
from zipfile import ZipFile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
COUNT_UNITS = {
    "caps": "capsules",
    "capsules": "capsules",
    "kapseln": "capsules",
    "tabs": "tablets",
    "tabletten": "tablets",
    "tablets": "tablets",
    "lollys": "lollies",
    "beutel": "sachets",
    "tropfen": "drops",
}


def numeric(value: str) -> int | float | None:
    try:
        number = Decimal(value)
    except InvalidOperation:
        return None
    if not number.is_finite() or number < 0:
        return None
    result = float(number)
    if not math.isfinite(result):
        return None
    return int(number) if number == number.to_integral_value() else result


def product_url(value: str) -> str | None:
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme.lower() in {"http", "https"}
            and parsed.hostname
            and not parsed.username
            and not parsed.password
        ):
            return value
    except ValueError:
        pass
    return None


def read_catalogue(source: Path) -> dict:
    with ZipFile(source) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = [
                "".join(node.itertext())
                for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall(
                    "s:si", NS
                )
            ]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relations = {
            node.get("Id"): node.get("Target")
            for node in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        sheet = next(
            (
                node
                for node in workbook.find("s:sheets", NS)
                if node.get("name") == "Supplement Datenbank"
            ),
            None,
        )
        if sheet is None:
            raise ValueError("Expected the Supplement Datenbank worksheet")
        target = relations[sheet.get(REL_ID)]
        path = (
            target.lstrip("/")
            if target.startswith("/")
            else posixpath.normpath(posixpath.join("xl", target))
        )
        cells = {}
        for cell in ET.fromstring(archive.read(path)).findall(
            "s:sheetData/s:row/s:c", NS
        ):
            ref = cell.get("r")
            computed = None
            formula = cell.find("s:f", NS)
            if ref.startswith(("D", "E")) and formula is not None:
                expression = formula.text or ""
                # The source's D384 is a literal 540+360, not a cached lookup.
                if not re.fullmatch(
                    r"\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)+", expression
                ):
                    raise ValueError(f"Unsupported reference formula at {ref}")
                computed = str(sum(Decimal(part.strip()) for part in expression.split("+")))
            value = cell.find("s:v", NS)
            inline = cell.find("s:is", NS)
            text = value.text or "" if value is not None else ""
            if cell.get("t") == "s" and text:
                text = shared[int(text)]
            elif inline is not None:
                text = "".join(inline.itertext())
            if computed is not None:
                text = computed
            cells[ref] = text.strip()

    expected = {
        "B2": "HERSTELLER",
        "C2": "PRODUKT",
        "D2": "TAGESDOSIERUNG",
        "E2": "PORTION",
        "G2": "EINHEIT",
    }
    for ref, label in expected.items():
        if cells.get(ref) != label:
            raise ValueError(f"Unexpected catalogue header at {ref}")

    row_numbers = sorted(
        {
            int(ref[1:])
            for ref in cells
            if ref.startswith("C") and ref[1:].isdigit() and int(ref[1:]) >= 3
        }
    )
    products = []
    for row in row_numbers:
        brand, name = cells.get(f"B{row}", ""), cells.get(f"C{row}", "")
        if not brand or not name:
            continue
        declared = numeric(cells.get(f"D{row}", ""))
        reference = numeric(cells.get(f"E{row}", ""))
        if reference == 0:
            reference = None
        source_unit = cells.get(f"G{row}", "") or None
        count_unit = COUNT_UNITS.get((source_unit or "").casefold())
        # Content mass/IU is not evidence of capsule, spray or tablet count units.
        quantity_unit = count_unit
        if not count_unit and declared is None and source_unit in {"g", "ml"}:
            quantity_unit = source_unit
        products.append(
            {
                "id": f"supplement-{row:03d}",
                "brand": brand,
                "name": name,
                "referenceQuantity": reference,
                "quantityUnit": quantity_unit,
                "declaredAmount": None if count_unit else declared,
                "declaredUnit": None if count_unit else source_unit,
                "url": product_url(cells.get(f"H{row}", "")),
                "sourceRow": row,
                "sourceRows": [row],
                "sourceUnit": source_unit,
                "sourceDeclaredAmount": declared,
            }
        )
    unique = {}
    for product in products:
        signature = json.dumps(
            {
                key: value
                for key, value in product.items()
                if key not in {"id", "sourceRow", "sourceRows"}
            },
            sort_keys=True,
        )
        if signature in unique:
            unique[signature]["sourceRows"].append(product["sourceRow"])
        else:
            unique[signature] = product
    return {
        "source": source.name,
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sheet": "Supplement Datenbank",
        "basis": "As recorded in the supplied workbook; not manufacturer-verified",
        "deduplication": "Identical fields and links only; original sourceRows retained",
        "products": list(unique.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.output.parent.is_dir():
        raise ValueError("Output parent must already exist")
    payload = read_catalogue(args.source)
    products = payload["products"]
    ids = [product["id"] for product in products]
    if len(ids) != len(set(ids)):
        raise ValueError("Catalogue IDs must be unique")
    args.output.write_text(
        json.dumps(payload, ensure_ascii=True, allow_nan=False, indent=2) + "\n",
        encoding="utf-8",
    )
    names = Counter((product["brand"], product["name"]) for product in products)
    print(
        json.dumps(
            {
                "products": len(products),
                "brands": dict(Counter(product["brand"] for product in products)),
                "missingReference": sum(
                    product["referenceQuantity"] is None for product in products
                ),
                "unconfirmedQuantityUnit": sum(
                    product["quantityUnit"] is None for product in products
                ),
                "missingDeclaredAmount": sum(
                    product["declaredAmount"] is None for product in products
                ),
                "missingUrl": sum(product["url"] is None for product in products),
                "duplicateNames": [
                    {"brand": brand, "name": name, "rows": count}
                    for (brand, name), count in names.items()
                    if count > 1
                ],
                "output": str(args.output),
            },
            ensure_ascii=True,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
