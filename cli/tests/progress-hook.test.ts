import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {spawn, spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HOOK = ROOT + 'hooks/progress-report.mjs';
const VIZ = ROOT + 'viz/run.mjs';
const PORT = 8677;
const BASE = `http://127.0.0.1:${PORT}`;

let server: any;

const hookCall = (phase: 'pre' | 'post', payload: object) =>
  spawnSync(process.execPath, [HOOK, phase], {
    input: JSON.stringify(payload),
    env: {...process.env, BRIDGE_VIZ_URL: `http://127.0.0.1:${PORT}`},
    encoding: 'utf8', timeout: 8000,
  });

const session = async () => (await fetch(`${BASE}/api/session`, {cache: 'no-store'})).json();

beforeAll(async () => {
  server = spawn(process.execPath, [VIZ, '--port', String(PORT)], {stdio: 'ignore', windowsHide: true});
  for (let i = 0; i < 40; i++) {
    try { await fetch(`${BASE}/api/health`); return; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  throw new Error('viz server did not start');
});

afterAll(() => { server?.kill(); });

describe('hooks 自动进度上报（可视化「分析时不动」根治）', () => {
  it('阶段推断规则覆盖管线关键动作', async () => {
    const {inferEvent} = await import(HOOK);
    expect(inferEvent('pre', 'Write', {file_path: 'D:/p/analysis.json'})).toMatchObject({stage: 'n2', status: 'running'});
    expect(inferEvent('post', 'Write', {file_path: 'D:/p/analysis.json'})).toMatchObject({stage: 'n2', status: 'done'});
    expect(inferEvent('pre', 'Bash', {command: 'node skills/bridge-analyze/validate-analysis.mjs analysis.json'})).toMatchObject({stage: 'n3'});
    expect(inferEvent('pre', 'Bash', {command: 'node cli/bin/mcp-pipeline.js schema --analysis a.json --format mcp'})).toMatchObject({stage: 'n3'});
    expect(inferEvent('pre', 'Bash', {command: 'node e2e/analysis-to-registry.mjs a.json r.json'})).toMatchObject({stage: 'n4b'});
    expect(inferEvent('pre', 'Bash', {command: 'node cli/bin/mcp-pipeline.js serve --analysis a.json'})).toMatchObject({stage: 'n4a'});
    expect(inferEvent('pre', 'Bash', {command: 'node cli/bin/mcp-pipeline.js call --analysis a.json --op x'})).toMatchObject({stage: 'n6'});
    expect(inferEvent('pre', 'Bash', {command: 'echo hello world'})).toBeNull();
  });

  it('端到端：hook 调用流驱动 /api/session 阶段推进（页面轮询即跟随）', async () => {
    hookCall('pre', {tool_name: 'Bash', tool_input: {command: 'node x/validate-analysis.mjs analysis.json'}});
    hookCall('post', {tool_name: 'Write', tool_input: {file_path: 'D:/proj/analysis.json'}});
    hookCall('pre', {tool_name: 'Bash', tool_input: {command: 'node cli/bin/mcp-pipeline.js schema --analysis analysis.json --format mcp'}});
    hookCall('post', {tool_name: 'Bash', tool_input: {command: 'node cli/bin/mcp-pipeline.js schema --analysis analysis.json --format mcp'}});
    hookCall('post', {tool_name: 'Bash', tool_input: {command: 'node e2e/analysis-to-registry.mjs analysis.json registry.json'}});

    const s = await session();
    expect(s.startedAt).toBeGreaterThan(0);            // 未 start 也自动建会话
    expect(s.stages.n1).toBe('done');                  // 首个 bridge 活动补输入受理
    expect(s.stages.n2).toBe('done');                  // 写 analysis.json 即分析产出
    expect(s.stages.n3).toBe('done');
    expect(s.stages.n4b).toBe('done');
    expect(s.progress.done).toBeGreaterThanOrEqual(4);
    expect(s.log.some((e: any) => e.msg.includes('validate-analysis')));
  });

  it('非 bridge 活动零上报（页面不被无关命令打扰）', async () => {
    const before = (await session()).log.length;
    hookCall('pre', {tool_name: 'Bash', tool_input: {command: 'npm install some-random-pkg'}});
    expect((await session()).log.length).toBe(before);
  });
});
