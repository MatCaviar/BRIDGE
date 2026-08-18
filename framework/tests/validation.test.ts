import { describe, it, expect } from "vitest";
import { validateNonEmptyString, validatePath, validateRange } from "../src/utils/validation.js";

describe("validateNonEmptyString", () => {
  it("accepts non-empty strings", () => {
    expect(validateNonEmptyString("hello", "field")).toEqual({ valid: true, value: "hello" });
  });
  it("rejects empty string", () => {
    const r = validateNonEmptyString("", "field");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toContain("field");
  });
  it("rejects whitespace-only string", () => {
    const r = validateNonEmptyString("  ", "field");
    expect(r.valid).toBe(false);
  });
  it("rejects non-string input", () => {
    const r = validateNonEmptyString(123 as unknown, "field");
    expect(r.valid).toBe(false);
  });
});

describe("validatePath", () => {
  it("accepts normal paths", () => {
    expect(validatePath("/data/photos/img.png").valid).toBe(true);
  });
  it("rejects empty path", () => {
    expect(validatePath("").valid).toBe(false);
  });
  it("rejects path traversal", () => {
    expect(validatePath("../../etc/passwd").valid).toBe(false);
    expect(validatePath("../../../etc/shadow").valid).toBe(false);
  });
  it("rejects paths with null bytes", () => {
    expect(validatePath("file\0.txt").valid).toBe(false);
  });
});

describe("validateRange", () => {
  it("accepts value within range", () => {
    expect(validateRange(5, 1, 10, "fps").valid).toBe(true);
  });
  it("rejects value below minimum", () => {
    const r = validateRange(0, 1, 60, "fps");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toContain("fps");
  });
  it("rejects value above maximum", () => {
    expect(validateRange(100, 1, 60, "fps").valid).toBe(false);
  });
  it("accepts boundary values", () => {
    expect(validateRange(1, 1, 60, "fps").valid).toBe(true);
    expect(validateRange(60, 1, 60, "fps").valid).toBe(true);
  });
  it("rejects non-number input", () => {
    expect(validateRange("5" as unknown, 1, 10, "val").valid).toBe(false);
  });
});
