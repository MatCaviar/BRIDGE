type ValidResult<T> = { readonly valid: true; readonly value: T };
type InvalidResult = { readonly valid: false; readonly error: string };
export type ValidationResult<T> = ValidResult<T> | InvalidResult;

export function validateNonEmptyString(
  input: unknown,
  fieldName: string,
): ValidationResult<string> {
  if (typeof input !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (input.trim().length === 0) {
    return { valid: false, error: `${fieldName} must not be empty` };
  }
  return { valid: true, value: input };
}

export function validatePath(input: string): ValidationResult<string> {
  if (!input || input.trim().length === 0) {
    return { valid: false, error: "Path must not be empty" };
  }
  if (input.includes("\0")) {
    return { valid: false, error: "Path must not contain null bytes" };
  }
  if (input.includes("..")) {
    return { valid: false, error: "Path must not contain traversal sequences (..)" };
  }
  return { valid: true, value: input };
}

export function validateRange(
  value: unknown,
  min: number,
  max: number,
  fieldName: string,
): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { valid: false, error: `${fieldName} must be a finite number` };
  }
  if (value < min || value > max) {
    return { valid: false, error: `${fieldName} must be between ${min} and ${max}` };
  }
  return { valid: true, value };
}
