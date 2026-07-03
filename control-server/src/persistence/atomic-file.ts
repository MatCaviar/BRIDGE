import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AtomicFileOperations {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  writeFile(path: string, data: string): Promise<unknown>;
  rename(from: string, to: string): Promise<unknown>;
  copyFile(from: string, to: string): Promise<unknown>;
  rm(path: string, options: { force: true }): Promise<unknown>;
  wait(milliseconds: number): Promise<unknown>;
}

const defaultOperations: AtomicFileOperations = {
  mkdir: async (path, options) => mkdir(path, options),
  writeFile: async (path, data) => writeFile(path, data),
  rename: async (from, to) => rename(from, to),
  copyFile: async (from, to) => copyFile(from, to),
  rm: async (path, options) => rm(path, options),
  wait: async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

const transientWindowsErrors = new Set(["EACCES", "EBUSY", "EPERM"]);
const retryDelays = [10, 25, 50, 100] as const;
const pendingWrites = new Map<string, Promise<void>>();
let temporarySequence = 0;

function isTransientWindowsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
    && typeof (error as NodeJS.ErrnoException).code === "string"
    && transientWindowsErrors.has((error as NodeJS.ErrnoException).code!);
}

async function retryTransient(operation: () => Promise<unknown>, fs: AtomicFileOperations): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      if (!isTransientWindowsError(error) || attempt >= retryDelays.length) throw error;
      await fs.wait(retryDelays[attempt]);
    }
  }
}

async function performAtomicWrite(path: string, data: string, fs: AtomicFileOperations): Promise<void> {
  const sequence = temporarySequence++;
  const temporary = `${path}.${process.pid}.${Date.now()}.${sequence}.tmp`;
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(temporary, data);

  try {
    try {
      await retryTransient(() => fs.rename(temporary, path), fs);
    } catch (error) {
      if (!isTransientWindowsError(error)) throw error;
      // Windows scanners and editors can keep the destination open long enough
      // that rename-over-existing never succeeds. Copying still preserves the
      // new state and is safer than deleting the old file first.
      await retryTransient(() => fs.copyFile(temporary, path), fs);
    }
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export function writeFileAtomically(
  path: string,
  data: string,
  fs: AtomicFileOperations = defaultOperations,
): Promise<void> {
  const previous = pendingWrites.get(path) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => performAtomicWrite(path, data, fs));
  pendingWrites.set(path, current);

  return current.finally(() => {
    if (pendingWrites.get(path) === current) pendingWrites.delete(path);
  });
}
