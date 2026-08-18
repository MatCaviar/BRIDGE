#!/usr/bin/env node
// SP-D Task 5: cross-host manifest drift guard.
//
// Claude Code and Codex have DIFFERENT manifest field sets
// (Claude: commands/hooks/defaultEnabled; Codex: interface/longDescription/
// defaultPrompt) — each valid only in its own schema. So this script is
// FORMAT-AWARE: it compares only the SHARED identity (plugin `name`, `version`,
// and that both declare the `skills/` path), NOT a field-by-field diff.
//
// Full per-host Codex validation is a separate concern (validate_plugin.py) and
// is intentionally NOT invoked here — this script is pure Node, portable, and
// has no python dependency.
//
// Exit 0 + "manifests agree" on success; exit 1 with per-error stderr lines on
// drift or unreadable manifests.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const errors = [];

function readJson(rel) {
  const abs = resolve(ROOT, rel);
  try {
    const raw = readFileSync(abs, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    errors.push(`${rel}: ${e.code === "ENOENT" ? "missing" : "invalid JSON"} (${e.message})`);
    return null;
  }
}

// Normalize a skills declaration to a comparable form.
// Claude: ["./skills/"] (array); Codex: "./skills/" (string). Both → "skills".
// Strips leading "./" and trailing "/". Flattens arrays and keeps only the
// first entry (both hosts declare a single skills base dir).
function normalizeSkills(decl) {
  const arr = Array.isArray(decl) ? decl : [decl];
  const first = arr[0];
  if (typeof first !== "string" || first.length === 0) return null;
  return first.replace(/^\.\//, "").replace(/\/$/, "");
}

const claude = readJson(".claude-plugin/plugin.json");
const codex = readJson(".codex-plugin/plugin.json");

if (claude && codex) {
  // name (shared identity)
  if (claude.name !== codex.name) {
    errors.push(`name differs: claude="${claude.name}" codex="${codex.name}"`);
  }

  // version (shared identity)
  if (claude.version !== codex.version) {
    errors.push(`version differs: claude="${claude.version}" codex="${codex.version}"`);
  }

  // skills path — both must declare it and resolve to the same base dir.
  const cSkills = normalizeSkills(claude.skills);
  const xSkills = normalizeSkills(codex.skills);
  if (cSkills === null) {
    errors.push("claude skills declaration missing/invalid");
  }
  if (xSkills === null) {
    errors.push("codex skills declaration missing/invalid");
  }
  if (cSkills !== null && xSkills !== null && cSkills !== xSkills) {
    errors.push(`skills path differs: claude="${cSkills}" codex="${xSkills}"`);
  }
}

// Optional cross-check: marketplace.json's plugin name/version should match.
const market = readJson(".claude-plugin/marketplace.json");
if (market && claude) {
  const entry = Array.isArray(market.plugins)
    ? market.plugins.find((p) => p && p.name === claude.name)
    : undefined;
  if (!entry) {
    errors.push(`marketplace.json has no plugin entry named "${claude.name}"`);
  } else if (claude.version && entry.version && entry.version !== claude.version) {
    errors.push(
      `marketplace plugin version "${entry.version}" != claude plugin.json "${claude.version}"`
    );
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`[check-manifests] ${e}`);
  console.error(`[check-manifests] ${errors.length} drift error(s).`);
  process.exit(1);
}

console.log("manifests agree");
process.exit(0);
