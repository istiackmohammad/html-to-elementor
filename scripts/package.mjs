// Builds the release zip for the agent skill.
//   node scripts/package.mjs                 -> release/*.zip
//   node scripts/package.mjs --install DIR   also copy the skill into DIR (e.g. ~/.claude/skills)
import { zipSync } from "fflate";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const out = join(root, "release");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function collect(dir, prefix, extra = {}) {
  const files = { ...extra };
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files[`${prefix}/${relative(dir, p).split("\\").join("/")}`] = readFileSync(p);
    }
  };
  walk(dir);
  return files;
}

function zip(name, files) {
  const path = join(out, name);
  writeFileSync(path, zipSync(files, { level: 9 }));
  console.log(`${relative(root, path)}  (${Object.keys(files).length} files)`);
  return path;
}

for (const f of ["skill/html-to-elementor/scripts/convert.mjs"]) {
  if (!existsSync(join(root, f))) throw new Error(`missing ${f}: run npm run build first`);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const shared = {
  LICENSE: readFileSync(join(root, "LICENSE")),
  "references/MAPPING.md": readFileSync(join(root, "docs/MAPPING.md")),
};
const skillDir = join(root, "skill/html-to-elementor");
const skillExtra = Object.fromEntries(Object.entries(shared).map(([k, v]) => [`html-to-elementor/${k}`, v]));
zip("html-to-elementor-skill.zip", collect(skillDir, "html-to-elementor", skillExtra));

const i = process.argv.indexOf("--install");
if (i !== -1) {
  const dest = join((process.argv[i + 1] ?? "~/.claude/skills").replace(/^~/, homedir()), "html-to-elementor");
  rmSync(dest, { recursive: true, force: true });
  cpSync(skillDir, dest, { recursive: true });
  mkdirSync(join(dest, "references"), { recursive: true });
  writeFileSync(join(dest, "references/MAPPING.md"), shared["references/MAPPING.md"]);
  writeFileSync(join(dest, "LICENSE"), shared.LICENSE);
  console.log(`installed ${dest}`);
}
