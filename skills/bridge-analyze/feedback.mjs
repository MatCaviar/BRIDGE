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
 * 上报链: 1) BRIDGE_FEEDBACK_TOKEN(GitHub 细粒度 PAT, 仅 issues:write) → 建 GitHub Issue;
 *         2) GitHub 不成功(未配置/请求失败) → 兜底 BRIDGE_FEEDBACK_GITLAB_TOKEN(内网 GitLab PAT, 需 api scope)
 *            → gitlab-ha.immotors.com im-mcp/bridge 建 Issue;
 *         3) 全部不成功 → 生成 feedback-bundle-<时间戳>.md 打包全部未上报项, 打印转交指引(降级永不阻断)。
 * 原则: 只报真实遇到的问题; reproduce 附真实命令与输出摘录; 上报失败静默降级, 不影响主流程。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const REPO = "MatCaviar/BRIDGE";
const GITLAB_HOST = "gitlab-ha.immotors.com";
const GITLAB_PROJECT = "im-mcp/bridge";
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

async function postGitHub(it, token) {
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
  if (r.ok && j.html_url) return { url: j.html_url, channel: "github" };
  throw new Error(j.message || `HTTP ${r.status}`);
}

async function postGitLab(it, token) {
  const r = await fetch(`https://${GITLAB_HOST}/api/v4/projects/${encodeURIComponent(GITLAB_PROJECT)}/issues`, {
    method: "POST",
    headers: { "PRIVATE-TOKEN": token, "content-type": "application/json" },
    body: JSON.stringify({
      title: `[feedback][${it.type}][${it.severity}] ${it.title}`,
      description: renderMd([it]),
      labels: ["feedback", `type-${it.type}`, `sev-${it.severity}`].join(","),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.web_url) return { url: j.web_url, channel: "gitlab" };
  throw new Error(j.message || `HTTP ${r.status}`);
}

function markSubmitted(d, it, done) {
  it.submitted = true; it.issueUrl = done.url; it.channel = done.channel;
  writeFileSync(join(d, `issue-${it.id}.json`), JSON.stringify(it, null, 1), "utf-8");
  console.log(`✓ ${it.id} → ${done.url} [${done.channel}]`);
}

// 降级: 打包 + 转交指引(绝不阻断)
function degrade(items) {
  const d = dir();
  const bundle = join(d, `feedback-bundle-${now()}.md`);
  writeFileSync(bundle,
    `# BRIDGE 使用反馈包 · ${new Date().toISOString()}\n\n共 ${items.length} 条未上报反馈。请把本文件发给 BRIDGE 团队(或配置 BRIDGE_FEEDBACK_TOKEN / BRIDGE_FEEDBACK_GITLAB_TOKEN 后重跑 submit 自动建 Issue)。\n\n` +
    "---\n\n" + renderMd(items), "utf-8");
  console.log(`GitHub / GitLab 均不可用 —— 已打包待转交: ${bundle}`);
  console.log(`请将此文件转交 BRIDGE 团队统一处理(共 ${items.length} 条)。`);
}

async function cmdSubmit() {
  const only = arg("--id");
  let items = loadIssues().filter((x) => !x.submitted);
  if (only) items = items.filter((x) => x.id === only);
  if (!items.length) { console.log("没有待上报的反馈"); return; }
  const ghToken = process.env.BRIDGE_FEEDBACK_TOKEN;
  const glToken = process.env.BRIDGE_FEEDBACK_GITLAB_TOKEN;
  const d = dir();
  if (!ghToken && !glToken) { degrade(items); return; }
  let ok = 0;
  const failed = [];
  for (const it of items) {
    let done = null;
    if (ghToken) {
      try { done = await postGitHub(it, ghToken); }
      catch (e) { console.error(`✗ github ${it.id}: ${e.message}`); }
    }
    // GitHub 不成功(未配置/请求失败) → GitLab 兜底
    if (!done && glToken) {
      try { done = await postGitLab(it, glToken); }
      catch (e) { console.error(`✗ gitlab ${it.id}: ${e.message}`); }
    }
    if (done) { markSubmitted(d, it, done); ok++; }
    else failed.push(it);
  }
  console.log(`上报完成: 成功 ${ok} / 失败 ${failed.length}${failed.length ? "(失败项保留本地, 稍后重试)" : ""}`);
  if (failed.length) degrade(failed);
}

const cmd = process.argv[2];
if (cmd === "new") cmdNew();
else if (cmd === "list") cmdList();
else if (cmd === "submit") cmdSubmit();
else {
  console.log(`BRIDGE 反馈通道
  new     记录一条反馈(--type bug|gap|doc|env|idea --severity blocker|major|minor --title --detail [--reproduce --evidence a,b --proposer])
  list    列出本地反馈
  submit  上报(GitHub 需 BRIDGE_FEEDBACK_TOKEN; 不成功兜底 GitLab 需 BRIDGE_FEEDBACK_GITLAB_TOKEN; 均不可用则打包降级)  [--id fb-...] 指定单条
目录: --dir 或 BRIDGE_FEEDBACK_DIR, 默认 ./feedback`);
}
