import ts from "typescript";
import type { RpcEvidence, SourceEdge, SourceNode } from "@bridge/workbench-contracts";

export interface TypeScriptExtraction {
  readonly nodes: SourceNode[];
  readonly edges: SourceEdge[];
  readonly evidence: RpcEvidence[];
}

function visibility(node: ts.Node): "public" | "protected" | "private" {
  const flags = ts.getCombinedModifierFlags(node as ts.Declaration);
  if (flags & ts.ModifierFlags.Private) return "private";
  if (flags & ts.ModifierFlags.Protected) return "protected";
  return "public";
}

function lineOf(file: ts.SourceFile, node: ts.Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

function declarationName(node: ts.NamedDeclaration): string | undefined {
  return node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
}

export function extractTypeScript(path: string, source: string, fileId: string): TypeScriptExtraction {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const nodes: SourceNode[] = [];
  const edges: SourceEdge[] = [];
  const evidence: RpcEvidence[] = [];

  const addDeclaration = (node: ts.NamedDeclaration, symbolKind: NonNullable<SourceNode["symbolKind"]>, owner?: string): string | undefined => {
    const label = declarationName(node);
    if (!label) return undefined;
    const line = lineOf(file, node);
    nodes.push({
      id: `${fileId}:${symbolKind}:${owner ? `${owner}.` : ""}${label}:${line}`,
      path,
      kind: "symbol",
      label,
      parentId: fileId,
      symbolKind,
      owner,
      visibility: visibility(node),
      line,
    });
    return label;
  };

  const visit = (node: ts.Node, owner?: string): void => {
    let nextOwner = owner;
    if (ts.isClassDeclaration(node)) nextOwner = addDeclaration(node, "class") ?? owner;
    else if (ts.isInterfaceDeclaration(node)) nextOwner = addDeclaration(node, "interface") ?? owner;
    else if (ts.isFunctionDeclaration(node)) addDeclaration(node, "function", owner);
    else if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) addDeclaration(node, "method", owner);

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({ from: fileId, to: node.moduleSpecifier.text, kind: "imports" });
    }
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "createMethodCallMessage"
      && node.arguments[0]
      && ts.isStringLiteralLike(node.arguments[0])) {
      const operation = node.arguments[0].text;
      const line = lineOf(file, node);
      evidence.push({ id: `${fileId}:dbus:${operation}:${line}`, path, line, operation, transport: "dbus" });
    }
    if (ts.isPropertyAssignment(node)
      && ((ts.isIdentifier(node.name) && node.name.text === "funcName") || (ts.isStringLiteral(node.name) && node.name.text === "funcName"))
      && ts.isStringLiteralLike(node.initializer)) {
      const operation = node.initializer.text;
      const line = lineOf(file, node);
      evidence.push({ id: `${fileId}:dbus:${operation}:${line}`, path, line, operation, transport: "dbus" });
    }
    ts.forEachChild(node, (child) => visit(child, nextOwner));
  };

  visit(file);
  return { nodes, edges, evidence };
}
