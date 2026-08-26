import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { invokeTool, parseInvokeArgs, type InvokeOptions } from "../src/commands/invoke.js";
import { resolveAdbBinary, type Adb } from "../src/car/adb.js";

/** Records calls + serves scripted shell responses (FIFO). push() captures the local file content. */
class MockAdb implements Adb {
  readonly shells: string[] = [];
  readonly pushes: { local: string; device: string }[] = [];
  pushedContent = "";
  private responses: string[] = [];
  queueShells(...out: string[]): this { this.responses.push(...out); return this; }
  async push(local: string, device: string): Promise<void> {
    this.pushedContent = readFileSync(local, "utf-8");
    this.pushes.push({ local, device });
  }
  async shell(cmd: string): Promise<string> {
    this.shells.push(cmd);
    return this.responses.shift() ?? "";
  }
}

const noSleep = async () => {};
const base = (over: Partial<InvokeOptions> = {}): InvokeOptions => ({
  op: "get_mic_vocal", device: "SERIAL", reqId: "r1", sleep: noSleep, timeoutMs: 800, pollMs: 100, ...over,
});

describe("invokeTool", () => {
  it("writes cmd.json {reqId,op,args}, triggers the executor, returns the matched result", async () => {
    const adb = new MockAdb();
    const result = JSON.stringify({ reqId: "r1", ok: true, data: { code: 1000, message: "SUCCESS", data: 0 } });
    adb.queueShells("", "", "", result); // write, am start, cat(empty), cat(match)
    const res = await invokeTool(adb, base({ args: { x: 1 } }));
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ code: 1000, message: "SUCCESS", data: 0 });
    // cmd.json payload
    const cmd = JSON.parse(adb.pushedContent);
    expect(cmd).toEqual({ reqId: "r1", op: "get_mic_vocal", args: { x: 1 } });
    expect(adb.pushes[0]!.device).toBe("/data/local/tmp/__bridge_cmd.json");
    // am start targets the executor component + foreground user 10
    expect(adb.shells.some((s) => /am start --user 10 -n com\.immotors\.bridge\.executor\/\.ExecutorActivity/.test(s))).toBe(true);
  });

  it("ignores stale/empty results, matching only its own reqId", async () => {
    const adb = new MockAdb();
    const stale = JSON.stringify({ reqId: "OTHER", ok: true, data: "stale" });
    const mine = JSON.stringify({ reqId: "r1", ok: true, data: "mine" });
    adb.queueShells("", "", stale, "{}", mine);
    const res = await invokeTool(adb, base());
    expect(res.ok).toBe(true);
    expect(res.data).toBe("mine");
  });

  it("propagates executor errors (ok:false) as InvokeResult.ok=false + error", async () => {
    const adb = new MockAdb();
    adb.queueShells("", "", "", JSON.stringify({ reqId: "r1", ok: false, error: "UNKNOWN_OP bogus" }));
    const res = await invokeTool(adb, base({ op: "bogus" }));
    expect(res.ok).toBe(false);
    expect(res.error).toBe("UNKNOWN_OP bogus");
  });

  it("times out when no matching result arrives", async () => {
    const adb = new MockAdb();
    adb.queueShells("", "", "not-json", "", "", "", "", "", ""); // never a valid match
    const res = await invokeTool(adb, base({ timeoutMs: 300, pollMs: 100 }));
    expect(res.ok).toBe(false);
    expect(res.error).toBe("TIMEOUT");
  });

  it("respects --package / --activity overrides (retargets the executor component)", async () => {
    const adb = new MockAdb();
    adb.queueShells("", "", "", JSON.stringify({ reqId: "r1", ok: true }));
    await invokeTool(adb, base({ pkg: "com.other.app", activity: ".Exec" }));
    expect(adb.shells.some((s) => /am start --user 10 -n com\.other\.app\/\.Exec/.test(s))).toBe(true);
    expect(adb.shells.some((s) => s.includes("/data/user/10/com.other.app/files/imrpc"))).toBe(true);
  });

  it("treats a cat failure (adb reject) as an empty poll, not a crash", async () => {
    const result = JSON.stringify({ reqId: "r1", ok: true, data: "ok" });
    const adb = new MockAdb();
    adb.queueShells("", ""); // write + am start
    let catSeen = false;
    const realShell = adb.shell.bind(adb);
    adb.shell = async (cmd: string) => {
      if (cmd.startsWith("cat ")) {
        if (!catSeen) { catSeen = true; throw new Error("adb reject"); }
        return result;
      }
      return realShell(cmd);
    };
    const res = await invokeTool(adb, base());
    expect(res.ok).toBe(true);
    expect(res.data).toBe("ok");
  });
});

describe("parseInvokeArgs", () => {
  it("parses --op/--device/--args + numeric + flags", () => {
    const o = parseInvokeArgs(["--op", "set_mic_vocal", "--device", "b12bf58e", "--args", '{"vol":3}', "--user", "0", "--timeout", "5000", "--json"]);
    expect(o.op).toBe("set_mic_vocal");
    expect(o.device).toBe("b12bf58e");
    expect(o.args).toEqual({ vol: 3 });
    expect(o.user).toBe(0);
    expect(o.timeoutMs).toBe(5000);
    expect(o.json).toBe(true);
  });
});

describe("resolveAdbBinary", () => {
  it("honors an explicit binary and otherwise uses the host-appropriate fallback", () => {
    expect(resolveAdbBinary({ BRIDGE_ADB: "/opt/android/adb" } as NodeJS.ProcessEnv, "linux")).toBe("/opt/android/adb");
    expect(resolveAdbBinary({} as NodeJS.ProcessEnv, "linux")).toBe("adb");
  });
});
