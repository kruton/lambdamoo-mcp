import { createRequire } from "node:module";
import Parser from "tree-sitter";
import { PipelineError } from "@lambdamoo-mcp/core/errors";
import type { AstMetadata } from "@lambdamoo-mcp/core/types";

const require = createRequire(import.meta.url);
const LambdaMoo = require("tree-sitter-lambdamoo") as Parser.Language;

export const DOCSTRING_QUERY = `
(source_file
  .
  (statement
    (expression_statement
      (expression
        (string) @docstring)))+)
`;

export const DEPENDENCY_QUERY = `
[
  (verb_call)
  (call_expression)
] @dependency
`;

export const BARE_STRING_COMMENT_QUERY = `
(statement
  (expression_statement
    (expression
      (string)))) @comment
`;

export interface AstEnrichment {
  docstring: string;
  semanticCode: string;
  metadata: AstMetadata;
}

export class MooAstParser {
  readonly #parser: Parser;
  readonly #docstrings: Parser.Query;
  readonly #dependencies: Parser.Query;
  readonly #comments: Parser.Query;

  constructor() {
    this.#parser = new Parser();
    this.#parser.setLanguage(LambdaMoo);
    this.#docstrings = new Parser.Query(LambdaMoo, DOCSTRING_QUERY);
    this.#dependencies = new Parser.Query(LambdaMoo, DEPENDENCY_QUERY);
    this.#comments = new Parser.Query(LambdaMoo, BARE_STRING_COMMENT_QUERY);
  }

  enrich(code: string, id = "verb"): AstEnrichment {
    const tree = this.#parser.parse(code);
    if (tree.rootNode.hasError) {
      throw new PipelineError(`${id}: LambdaMOO parse failed near ${firstErrorLocation(tree.rootNode)}`);
    }

    const seenDocstrings = new Set<string>();
    const docstrings: string[] = [];
    for (const capture of this.#docstrings.captures(tree.rootNode)) {
      const key = `${capture.node.startIndex}:${capture.node.endIndex}`;
      if (seenDocstrings.has(key)) continue;
      seenDocstrings.add(key);
      const text = capture.node.text;
      docstrings.push(text.length >= 2 ? text.slice(1, -1) : text);
    }

    const seenDependencies = new Set<string>();
    const dependencies: string[] = [];
    for (const capture of this.#dependencies.captures(tree.rootNode)) {
      const callee = extractCallee(capture.node).trim();
      if (callee !== "" && !seenDependencies.has(callee)) {
        seenDependencies.add(callee);
        dependencies.push(callee);
      }
    }
    const commentNodes = this.#comments.captures(tree.rootNode).map((capture) => capture.node);
    return {
      docstring: docstrings.join("\n"),
      semanticCode: removeBareStringComments(code, commentNodes),
      metadata: { dependencies },
    };
  }
}

function removeBareStringComments(code: string, nodes: Parser.SyntaxNode[]): string {
  const source = Buffer.from(code, "utf8");
  const chunks: Buffer[] = [];
  let cursor = 0;
  for (const node of nodes.sort((left, right) => left.startIndex - right.startIndex)) {
    if (node.startIndex < cursor) continue;
    chunks.push(source.subarray(cursor, node.startIndex));
    cursor = node.endIndex;
  }
  chunks.push(source.subarray(cursor));
  return Buffer.concat(chunks)
    .toString("utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

function extractCallee(node: Parser.SyntaxNode): string {
  const argumentsNode = node.namedChildren.find((child) => child.type === "arg_list");
  if (argumentsNode) {
    const relativeEnd = argumentsNode.startIndex - node.startIndex;
    return node.text.slice(0, relativeEnd).replace(/\($/, "").trim();
  }
  return node.text.replace(/\([^()]*\)\s*$/, "").trim();
}

function firstErrorLocation(node: Parser.SyntaxNode): string {
  if (node.isError || node.isMissing) return `${node.startPosition.row + 1}:${node.startPosition.column + 1}`;
  for (const child of node.namedChildren) {
    if (child.hasError || child.isMissing) return firstErrorLocation(child);
  }
  return `${node.startPosition.row + 1}:${node.startPosition.column + 1}`;
}
