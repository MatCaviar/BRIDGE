import { describe, it, expect } from "vitest";
import { getRegisteredCommands } from "../../src/executors/adb-executor.js";

// 独立文件：vitest 每文件隔离模块，adb-executor 的 module-load registerCommand 在此全新运行，
// 不受 adb-executor.test.ts 的 beforeEach(clearCommands) 影响。验证生产注册（非 in-test 注册）。
describe("adb-executor module-load commands", () => {
  it("registers sendlink and shell at module load", () => {
    expect(getRegisteredCommands()).toEqual(expect.arrayContaining(["sendlink", "shell"]));
  });
});
