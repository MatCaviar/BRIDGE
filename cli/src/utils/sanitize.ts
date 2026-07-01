/** Shared sanitizers for code generators. Prevents analysis string fields from breaking the
 *  generated TypeScript when they contain quotes, backslashes, newlines, or non-identifier chars. */

const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

/** Assert a string is a valid TS identifier (for const/enum/type/object-export names).
 *  Fail-loud with a clear error — far better than emitting syntactically-invalid code that fails
 *  `tsc` at a point far from its root cause. */
export function assertIdent(name: string, kind: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(
      `Invalid ${kind} identifier ${JSON.stringify(name)} — must match ${IDENT_RE.source}. ` +
      `Fix the offending value in analysis.json (use ASCII letters/digits/_ and don't start with a digit).`
    );
  }
  return name;
}

/** Make a string safe to embed in a single-line `//` comment by collapsing newlines. */
export function escapeComment(s: string): string {
  return s.replace(/[\r\n]+/g, " ");
}
