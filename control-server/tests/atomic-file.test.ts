import { describe, expect, it, vi } from "vitest";
import { writeFileAtomically, type AtomicFileOperations } from "../src/persistence/atomic-file.js";

function operationError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

function operations(overrides: Partial<AtomicFileOperations> = {}): AtomicFileOperations {
  return {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    copyFile: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
    wait: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("writeFileAtomically", () => {
  it("retries a transient Windows rename lock", async () => {
    const rename = vi.fn()
      .mockRejectedValueOnce(operationError("EPERM"))
      .mockResolvedValueOnce(undefined);
    const fs = operations({ rename });

    await writeFileAtomically("C:\\workspace\\.workbench\\auto-run.json", "{}\n", fs);

    expect(rename).toHaveBeenCalledTimes(2);
    expect(fs.copyFile).not.toHaveBeenCalled();
    expect(fs.wait).toHaveBeenCalledTimes(1);
  });

  it("falls back to an overwrite when Windows keeps rejecting rename", async () => {
    const fs = operations({ rename: vi.fn(async () => { throw operationError("EPERM"); }) });

    await writeFileAtomically("C:\\workspace\\.workbench\\auto-run.json", "{}\n", fs);

    expect(fs.rename).toHaveBeenCalledTimes(5);
    expect(fs.copyFile).toHaveBeenCalledTimes(1);
    expect(fs.rm).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), { force: true });
  });

  it("does not hide non-locking filesystem errors", async () => {
    const fs = operations({ rename: vi.fn(async () => { throw operationError("ENOSPC"); }) });

    await expect(writeFileAtomically("C:\\workspace\\.workbench\\auto-run.json", "{}\n", fs))
      .rejects.toMatchObject({ code: "ENOSPC" });
    expect(fs.copyFile).not.toHaveBeenCalled();
  });
});
