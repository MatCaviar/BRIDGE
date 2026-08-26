#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { convertToAnthropic, convertToOpenAI } from "./dist/mcp/schema-convert.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(ROOT, "../cli/bin/mcp-pipeline.js");
const argv = process.argv.slice(2);
const value = (flag, fallback) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : fallback; };
const analysisPath = value("--analysis", resolve(ROOT, "bridge-analysis.json"));
const reportPath = value("--report", "");

const bridgeArtifact = JSON.parse(execFileSync(process.execPath, [CLI, "schema", "--analysis", analysisPath, "--format", "bridge"], { encoding: "utf8" }));
const expected = bridgeArtifact.functions.map((fn) => fn.name).sort();

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [CLI, "serve", "--analysis", analysisPath, "--device", "schema-smoke"],
  stderr: "pipe",
});
const client = new Client({ name: "bridge-schema-smoke", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);
let listed;
try {
  listed = await client.listTools();
} finally {
  await client.close();
}

const actual = listed.tools.map((tool) => tool.name).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`tools/list mismatch: expected ${expected.length}, actual ${actual.length}`);
const mcpDefs = listed.tools.map((tool) => ({
  serverName: "bridge",
  name: tool.name,
  qualifiedName: `bridge.${tool.name}`,
  description: tool.description ?? "",
  inputSchema: tool.inputSchema,
  annotations: tool.annotations,
}));
const openai = convertToOpenAI(mcpDefs);
const anthropic = convertToAnthropic(mcpDefs);
if (openai.length !== actual.length || anthropic.length !== actual.length) throw new Error("provider schema conversion count mismatch");
if (!openai.every((tool) => /^[a-zA-Z0-9_-]{1,64}$/.test(tool.function.name))) throw new Error("provider function name is not API-safe");

const sample = openai.find((tool) => Object.keys((tool.function.parameters.properties ?? {})).length > 0) ?? openai[0];
const report = {
  ok: true,
  analysis: analysisPath.replace(/\\/g, "/"),
  bridgeFunctions: expected.length,
  mcpToolsList: actual.length,
  openaiFunctions: openai.length,
  anthropicTools: anthropic.length,
  sample: sample?.function,
};
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log("BRIDGE function-schema injection E2E: PASS");
console.log(`  bridge artifact: ${report.bridgeFunctions}`);
console.log(`  MCP tools/list:  ${report.mcpToolsList}`);
console.log(`  OpenAI tools:    ${report.openaiFunctions}`);
console.log(`  Anthropic tools: ${report.anthropicTools}`);
if (sample) console.log(`  sample: ${sample.function.name}(${Object.keys(sample.function.parameters.properties ?? {}).join(", ") || "no arguments"})`);
if (reportPath) console.log(`  report: ${reportPath}`);
