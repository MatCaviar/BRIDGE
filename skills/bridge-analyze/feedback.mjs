#!/usr/bin/env node
/**
 * BRIDGE 使用反馈通道 (零依赖) —— 推广给各研发同事的 codeagent:
 *   执行套件过程中遇到问题/缺口/文档坑/改进想法, 当场文件化, 收尾统一上报。
 *
 * 用法:
 *   node feedback.mjs new --type bug --severity major --title "..." --detail "..." [--reproduce "..." --evidence "f1,f2" --proposer "名/团队"] [--dir <目录>]
 *   node feedback.mjs list [--dir <目录>]
 *   node feedback.mjs submit [--dir <目录>] [--id fb-...]     # 默认提交全部未上报的
 *
 * 文件: <dir>/issue-<id>.json  (dir 默认 ./feedback, 可用 BRIDGE_FEEDBACK_DIR 覆盖)
 * 上报: 有 BRIDGE_FEEDBACK_TOKEN(细粒度 PAT, 仅 issues:write) → 自动建 GitHub Issue 并回写 issueUrl;
 *       无凭证/失败 → 生成 feedback-bundle-<时间戳>.md 打包全部未上报项, 打印转交指引(降级永不阻断)。
 * 原则: 只报真实遇到的问题; reproduce 附真实命令与输出摘录; 上报失败静默降级, 不影响主流程。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const REPO = "MatCaviar/BRIDGE";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const SUITE_ROOT = resolve(HERE, "..", "..");
const TYPES = ["bug", "gap", "doc", "env", "idea"];
const SEVS = ["blocker", "major", "minor"];

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dir = () => resolve(arg("--dir") || process.env.BRIDGE_FEEDBACK_DIR || "feedback");
const ctx = () => {
  let ver = "";
  try { ver = JSON.parse(readFileSync(join(SUITE_ROOT, "cli", "package.json"), "utf-8")).version || ""; } catch {}
  return {
    suiteVersion: ver,
    app: process.env.BRIDGE_APP || "",
    inputForm: process.env.BRIDGE_INPUT_FORM || "",
    os: `${process.platform} ${process.arch}`,
    node: process.version,
  };
};
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "issue";
const now = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function cmdNew() {
  const type = arg("--type"), sev = arg("--severity") || "minor", title = arg("--title"), detail = arg("--detail");
  const errs = [];
  if (!TYPES.includes(type || "")) errs.push(`--type 必须是 ${TYPES.join("|")}`);
  if (!SEVS.includes(sev)) errs.push(`--severity 必须是 ${SEVS.join("|")}`);
  if (!title) errs.push("--title 必填");
  if (!detail) errs.push("--detail 必填(现象与期望, 条理描述)");
  if (errs.length) { console.error("✗ " + errs.join("; ")); process.exit(1); }
  const id = `fb-${now()}-${slug(title)}`;
  const issue = {
    id, type, severity: sev, title, detail,
    reproduce: arg("--reproduce") || "",
    evidence: (arg("--evidence") || "").split(",").map((x) => x.trim()).filter(Boolean),
    proposer: arg("--proposer") || process.env.BRIDGE_USER || "",
    context: ctx(), createdAt: new Date().toISOString(),
    submitted: false, issueUrl: "",
  };
  const d = dir(); mkdirSync(d, { recursive: true });
  const f = join(d, `issue-${id}.json`);
  writeFileSync(f, JSON.stringify(issue, null, 1), "utf-8");
  console.log(`✓ 已记录 ${f}`);
}

function loadIssues() {
  const d = dir();
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.startsWith("issue-") && f.endsWith(".json"))
    .map((f) => { try { return JSON.parse(readFileSync(join(d, f), "utf-8")); } catch { return null; } })
    .filter(Boolean);
}

function cmdList() {
  const all = loadIssues();
  if (!all.length) { console.log("(无反馈记录)"); return; }
  for (const it of all) {
    console.log(`${it.submitted ? "✓" : "·"} [${it.type}/${it.severity}] ${it.title}  (${it.id})${it.issueUrl ? " → " + it.issueUrl : ""}`);
  }
  console.log(`共 ${all.length} 条, 未上报 ${all.filter((x) => !x.submitted).length} 条`);
}

function renderMd(items) {
  const zh = { bug: "缺陷", gap: "能力缺口", doc: "文档", env: "环境", idea: "改进" };
  return items.map((it) => `# [feedback][${zh[it.type] || it.type}][${it.severity}] ${it.title}

- **id**: ${it.id}
- **提出人**: ${it.proposer || "(未署名)"}
- **环境**: BRIDGE v${it.context.suiteVersion || "?"} · ${it.context.os} · node ${it.context.node}${it.context.app ? ` · app=${it.context.app}` : ""}${it.context.inputForm ? ` · 输入形态=${it.context.inputForm}` : ""}
- **时间**: ${it.createdAt}

## 现象与期望
${it.detail}
${it.reproduce ? `\n## 复现\n\`\`\`\n${it.reproduce}\n\`\`\`\`` : ""}
${it.evidence && it.evidence.length ? `\n## 证据\n${it.evidence.map((e) => `- ${e}`).join("\n")}` : ""}
`).join("\n---\n\n");
}

async function cmdSubmit() {
  const only = arg("--id");
  let items = loadIssues().filter((x) => !x.submitted);
  if (only) items = items.filter((x) => x.id === only);
  if (!items.length) { console.log("没有待上报的反馈"); return; }
  const token = process.env.BRIDGE_FEEDBACK_TOKEN;
  const d = dir();
  if (token) {
    let ok = 0, fail = 0;
    for (const it of items) {
      try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "content-type": "application/json" },
          body: JSON.stringify({
            title: `[feedback][${it.type}][${it.severity}] ${it.title}`,
            body: renderMd([it]),
            labels: ["feedback", `type-${it.type}`, `sev-${it.severity}`],
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.html_url) {
          it.submitted = true; it.issueUrl = j.html_url; ok++;
          writeFileSync(join(d, `issue-${it.id}.json`), JSON.stringify(it, null, 1), "utf-8");
          console.log(`✓ ${it.id} → ${it.issueUrl}`);
        } else { fail++; console.error(`✗ ${it.id}: ${j.message || r.status}`); }
      } catch (e) { fail++; console.error(`✗ ${it.id}: ${e.message}`); }
    }
    console.log(`上报完成: 成功 ${ok} / 失败 ${fail}${fail ? "(失败项保留本地, 稍后重试)" : ""}`);
    return;
  }
  // 降级: 打包 + 转交指引(绝不阻断)
  const bundle = join(d, `feedback-bundle-${now()}.md`);
  writeFileSync(bundle,
    `# BRIDGE 使用反馈包 · ${new Date().toISOString()}\n\n共 ${items.length} 条未上报反馈。请把本文件发给 BRIDGE 团队(或配置 BRIDGE_FEEDBACK_TOKEN 后重跑 submit 自动建 Issue)。\n\n` +
    "---\n\n" + renderMd(items), "utf-8");
  console.log(`未配置 BRIDGE_FEEDBACK_TOKEN —— 已打包待转交: ${bundle}`);
  console.log(`请将此文件转交 BRIDGE 团队统一处理(共 ${items.length} 条)。`);
}

const cmd = process.argv[2];
if (cmd === "new") cmdNew();
else if (cmd === "list") cmdList();
else if (cmd === "submit") cmdSubmit();
else {
  console.log(`BRIDGE 反馈通道
  new     记录一条反馈(--type bug|gap|doc|env|idea --severity blocker|major|minor --title --detail [--reproduce --evidence a,b --proposer])
  list    列出本地反馈
  submit  上报(需 BRIDGE_FEEDBACK_TOKEN; 无则打包降级)  [--id fb-...] 指定单条
目录: --dir 或 BRIDGE_FEEDBACK_DIR, 默认 ./feedback`);
}
