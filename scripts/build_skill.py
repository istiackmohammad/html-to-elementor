"""Assemble the self-contained skill folder and zip.

  python scripts/build_skill.py            -> dist/html-to-elementor/ and dist/html-to-elementor-skill.zip
  python scripts/build_skill.py --install DIR   also copy the skill folder into DIR
                                                (e.g. ~/.claude/skills)
"""
import argparse
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL_SRC = ROOT / "skill" / "html-to-elementor"
PKG = ROOT / "src" / "html_to_elementor"
DIST = ROOT / "dist"


def build() -> Path:
    out = DIST / "html-to-elementor"
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(SKILL_SRC, out, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copytree(PKG, out / "scripts" / "html_to_elementor",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "server.py"))
    (out / "references").mkdir(exist_ok=True)
    shutil.copy(PKG / "MAPPING.md", out / "references" / "MAPPING.md")
    shutil.copy(ROOT / "LICENSE", out / "LICENSE")
    zip_path = DIST / "html-to-elementor-skill.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(DIST).as_posix())
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--install", help="copy the built skill folder into this skills directory")
    args = ap.parse_args()
    out = build()
    print(f"built {out}")
    print(f"zip   {DIST / 'html-to-elementor-skill.zip'}")
    if args.install:
        dest = Path(args.install).expanduser() / "html-to-elementor"
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(out, dest)
        print(f"installed {dest}")


if __name__ == "__main__":
    main()
