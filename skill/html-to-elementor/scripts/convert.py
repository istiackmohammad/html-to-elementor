"""Entry point for the skill: python convert.py page.html -o out/ [options]

Runs the bundled html_to_elementor package (copied next to this file by
scripts/build_skill.py) or, in a repo checkout, the one in src/.
"""
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
for candidate in (here, here.parents[2] / "src"):
    if (candidate / "html_to_elementor").is_dir():
        sys.path.insert(0, str(candidate))
        break

from html_to_elementor.cli import main  # noqa: E402

raise SystemExit(main())
