const SOURCE_EXTENSIONS = new Set([
  ".aidl", ".c", ".cc", ".cpp", ".gradle", ".h", ".hpp", ".java", ".json",
  ".kt", ".kts", ".md", ".properties", ".toml", ".ts", ".tsx", ".xml", ".yaml", ".yml",
]);
const SOURCE_NAMES = new Set(["android.bp", "gradlew"]);
const SKIP_SEGMENTS = new Set([".git", ".gradle", ".idea", "build", "coverage", "dist", "node_modules"]);

function valueEnd(text: string, start: number): number {
  const opener = text[start];
  if (opener !== "{" && opener !== "[") throw new Error(`Target schema value must start with an object or array at offset ${start}`);
  const stack: string[] = [opener];
  let quoted = false;
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack.pop() !== expected) throw new Error(`Mismatched target schema delimiter at offset ${index}`);
      if (stack.length === 0) return index + 1;
    }
  }
  throw new Error(`Unterminated target schema value at offset ${text.length}`);
}

function normalize(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { format: "mcp-tool-list", tools: value };
  if (value && typeof value === "object") return value as Record<string, unknown>;
  throw new Error("Target schema must contain a JSON object, array, or object stream");
}

export function parseTargetSchema(raw: string): Record<string, unknown> {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("Target schema is empty");
  try { return normalize(JSON.parse(text)); } catch { /* accept a stream of adjacent JSON objects below */ }

  const values: unknown[] = [];
  let offset = 0;
  while (offset < text.length) {
    while (offset < text.length && /[\s,]/.test(text[offset]!)) offset += 1;
    if (offset >= text.length) break;
    const end = valueEnd(text, offset);
    try { values.push(JSON.parse(text.slice(offset, end))); }
    catch (error) { throw new Error(`Invalid target schema near offset ${offset}: ${error instanceof Error ? error.message : String(error)}`); }
    offset = end;
  }
  if (!values.length) throw new Error("Target schema does not contain a JSON value");
  return values.length === 1 ? normalize(values[0]) : { format: "mcp-tool-list", tools: values };
}

export function filterSourceFiles(files: readonly File[]): { included: File[]; excluded: File[] } {
  const included: File[] = [];
  const excluded: File[] = [];
  for (const file of files) {
    const relative = (file.webkitRelativePath || file.name).replaceAll("\\", "/");
    const segments = relative.toLowerCase().split("/");
    const name = segments.at(-1) ?? "";
    const extensionIndex = name.lastIndexOf(".");
    const extension = extensionIndex >= 0 ? name.slice(extensionIndex) : "";
    const accepted = !segments.some((segment) => SKIP_SEGMENTS.has(segment))
      && (SOURCE_EXTENSIONS.has(extension) || SOURCE_NAMES.has(name));
    (accepted ? included : excluded).push(file);
  }
  return { included, excluded };
}
