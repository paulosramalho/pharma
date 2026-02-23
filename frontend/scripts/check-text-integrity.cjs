#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const roots = process.argv.slice(2);
const targetRoots = roots.length ? roots : ["src"];
const projectRoot = process.cwd();
const allowlistPath = path.join(__dirname, "text-integrity-allowlist.json");

const textExt = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".txt", ".sql", ".prisma", ".css", ".html", ".yml", ".yaml",
]);
const skipDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

const mojibakeHints = [
  "\u00C3\u00A3", "\u00C3\u00A1", "\u00C3\u00A0", "\u00C3\u00A2", "\u00C3\u00A4",
  "\u00C3\u00A9", "\u00C3\u00A8", "\u00C3\u00AA", "\u00C3\u00AB",
  "\u00C3\u00AD", "\u00C3\u00AC", "\u00C3\u00AE", "\u00C3\u00AF",
  "\u00C3\u00B3", "\u00C3\u00B2", "\u00C3\u00B4", "\u00C3\u00B6",
  "\u00C3\u00BA", "\u00C3\u00B9", "\u00C3\u00BB", "\u00C3\u00BC",
  "\u00C3\u00A7", "\u00C3\u0089", "\u00C3\u0093", "\u00C3\u009A", "\u00C3\u0087",
  "\u00C2 ", "\u00C2\u00B0", "\u00C2\u00BA",
  "\u00E2\u20AC\u2122", "\u00E2\u20AC\u0153", "\u00E2\u20AC\u009D", "\u00E2\u20AC\u201C", "\u00E2\u20AC\u201D", "\u00E2\u20AC\u00A6",
];

function loadAllowlist() {
  if (!fs.existsSync(allowlistPath)) return new Set();
  try {
    const parsed = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
    const files = Array.isArray(parsed?.files) ? parsed.files : [];
    return new Set(files.map((f) => String(f || "").replace(/\\/g, "/")));
  } catch {
    return new Set();
  }
}

function isTextFile(filePath) {
  return textExt.has(path.extname(filePath).toLowerCase());
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (isTextFile(full)) out.push(full);
  }
  return out;
}

function findIssues(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const issues = [];

  if (text.includes("\uFFFD")) {
    issues.push("contains replacement character (U+FFFD)");
  }
  for (const hint of mojibakeHints) {
    if (text.includes(hint)) {
      issues.push(`possible mojibake sequence: ${JSON.stringify(hint)}`);
      break;
    }
  }
  return issues;
}

const allFiles = targetRoots.flatMap((root) => walk(path.resolve(projectRoot, root)));
const allowlist = loadAllowlist();
const findings = [];
const ignored = [];

for (const file of allFiles) {
  const issues = findIssues(file);
  if (!issues.length) continue;
  const rel = path.relative(projectRoot, file).replace(/\\/g, "/");
  if (allowlist.has(rel)) {
    ignored.push(rel);
    continue;
  }
  findings.push({ file, issues });
}

if (findings.length) {
  console.error("Text integrity check failed: possible encoding/glyph issues found.");
  for (const f of findings) {
    const rel = path.relative(projectRoot, f.file).replace(/\\/g, "/");
    console.error(`- ${rel}: ${f.issues.join("; ")}`);
  }
  process.exit(1);
}

if (ignored.length) {
  console.log(`OK with baseline: ${allFiles.length} file(s) checked, ${ignored.length} legacy file(s) ignored.`);
} else {
  console.log(`OK: ${allFiles.length} file(s) checked, no mojibake hints found.`);
}
