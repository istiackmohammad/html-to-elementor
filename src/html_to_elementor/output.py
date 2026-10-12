"""Write converter results as Elementor-importable .json and .zip files."""
from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

from .converter import to_template


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "page"


def dumps(data) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def write_outputs(elements: list, page_settings: dict, title: str, out_dir: str,
                  type_: str = "page", make_zip: bool = True) -> dict:
    """Write <slug>.json (template) and, optionally, <slug>.zip containing it.

    Both are accepted by Elementor > Templates > Saved Templates > Import Templates.
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    slug = slugify(title)
    template = to_template(elements, page_settings, title, type_)
    json_path = out / f"{slug}.json"
    json_path.write_text(dumps(template), encoding="utf-8")
    result = {"json": str(json_path)}
    if make_zip:
        zip_path = out / f"{slug}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(json_path, arcname=f"{slug}.json")
        result["zip"] = str(zip_path)
    return result
