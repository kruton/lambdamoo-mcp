import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import type { MooSearchRepository } from "./repository.js";
import { checkMooCode, formatMooCode, presentDiagnostics } from "./language-tools.js";
import { LAMBDAMOO_SERVER_INSTRUCTIONS, LAMBDAMOO_SYNTAX_PRIMER, SYNTAX_PRIMER_URI } from "./primer.js";
import { presentHelpResults, presentSymbolResults, presentVerbResults } from "./presentation.js";

const limitSchema = z.number().int().min(1).max(20).optional();
const verbResultSchema = z.object({
  symbol: z.string().nullable(),
  name: z.string(),
  args: z.string(),
  description: z.string(),
  code: z.string(),
  dependencies: z.array(z.string()),
  distance: z.number(),
});
const helpResultSchema = z.object({
  topic: z.string(),
  database_symbol: z.string().nullable(),
  text: z.string(),
  distance: z.number(),
});
const symbolResultSchema = z.object({
  symbol: z.string(),
  aliases: z.array(z.string()),
  type: z.enum(["verb", "object", "property", "help"]),
  name: z.string(),
  args: z.string(),
  description: z.string().nullable(),
  code: z.string().nullable(),
});
const positionSchema = z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() });
const rangeSchema = z.object({ start: positionSchema, end: positionSchema });
const diagnosticSchema = z.object({
  range: rangeSchema,
  severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  code: z.union([z.number(), z.string()]).optional(),
  source: z.string().optional(),
  message: z.string(),
}).passthrough();
const codeSchema = z.string().max(1_000_000);

export type DiagnosticWriter = (message: string) => void;

export function createMcpServer(
  repository: MooSearchRepository,
  diagnostic: DiagnosticWriter = (message) => console.error(message),
): McpServer {
  const server = new McpServer(
    { name: "lambdamoo-mcp", version: "0.1.0" },
    { instructions: LAMBDAMOO_SERVER_INSTRUCTIONS },
  );

  server.registerResource(
    "lambdamoo-syntax-primer",
    SYNTAX_PRIMER_URI,
    {
      title: "LambdaMOO syntax primer",
      description: "A compact guide to LambdaMOO syntax rules commonly missed by coding models.",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: LAMBDAMOO_SYNTAX_PRIMER }] }),
  );

  server.registerTool(
    "check_moo_code",
    {
      title: "Check LambdaMOO code",
      description: "Parse LambdaMOO source and return precise syntax diagnostics.",
      inputSchema: { code: codeSchema },
      outputSchema: { diagnostics: z.array(diagnosticSchema) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ code }): Promise<CallToolResult> => {
      try {
        const result = await checkMooCode(code);
        return {
          content: [{ type: "text", text: presentDiagnostics(result.diagnostics) }],
          structuredContent: { diagnostics: result.diagnostics },
        };
      } catch (error) {
        return languageToolError("check_moo_code", diagnostic, error);
      }
    },
  );

  server.registerTool(
    "format_moo_code",
    {
      title: "Format LambdaMOO code",
      description: "Format valid LambdaMOO source. Invalid source is returned with syntax diagnostics instead.",
      inputSchema: { code: codeSchema },
      outputSchema: { formatted: z.string().nullable(), diagnostics: z.array(diagnosticSchema) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ code }): Promise<CallToolResult> => {
      try {
        const result = await formatMooCode(code);
        const text = result.formatted ?? `Unable to format invalid LambdaMOO source:\n${presentDiagnostics(result.diagnostics)}`;
        return {
          content: [{ type: "text", text }],
          structuredContent: { formatted: result.formatted, diagnostics: result.diagnostics },
          ...(result.formatted === null ? { isError: true } : {}),
        };
      } catch (error) {
        return languageToolError("format_moo_code", diagnostic, error);
      }
    },
  );

  server.registerTool(
    "search_moo_verbs",
    {
      title: "Search LambdaMOO verbs",
      description: "Find LambdaMOO verb implementations by technical intent. Read moo://syntax-primer before writing code.",
      inputSchema: { query: z.string().trim().min(1).max(2_000), limit: limitSchema },
      outputSchema: { results: z.array(verbResultSchema) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit }): Promise<CallToolResult> => toolResult(
      "search_moo_verbs",
      diagnostic,
      async () => {
        const results = await repository.searchVerbs({ query, ...(limit === undefined ? {} : { limit }) });
        return { text: presentVerbResults(results), structuredContent: { results } };
      },
    ),
  );

  server.registerTool(
    "search_moo_help",
    {
      title: "Search LambdaMOO help",
      description: "Find extracted LambdaMOO help topics by meaning. Read moo://syntax-primer before writing code.",
      inputSchema: { query: z.string().trim().min(1).max(2_000), limit: limitSchema },
      outputSchema: { results: z.array(helpResultSchema) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit }): Promise<CallToolResult> => toolResult(
      "search_moo_help",
      diagnostic,
      async () => {
        const results = await repository.searchHelp({ query, ...(limit === undefined ? {} : { limit }) });
        return { text: presentHelpResults(results), structuredContent: { results } };
      },
    ),
  );

  server.registerTool(
    "lookup_moo_symbol",
    {
      title: "Look up a LambdaMOO symbol",
      description: "Resolve an exact stable $registry symbol, verb, property, or help topic without semantic search.",
      inputSchema: { symbol: z.string().trim().startsWith("$").max(256) },
      outputSchema: { results: z.array(symbolResultSchema) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ symbol }): Promise<CallToolResult> => toolResult(
      "lookup_moo_symbol",
      diagnostic,
      async () => {
        const results = await repository.lookupSymbol(symbol);
        return { text: presentSymbolResults(results), structuredContent: { results } };
      },
    ),
  );

  return server;
}

function languageToolError(name: string, diagnostic: DiagnosticWriter, error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  diagnostic(`${name}: ${message}`);
  return { content: [{ type: "text", text: `Unable to complete ${name}: ${message}` }], isError: true };
}

async function toolResult(
  name: string,
  diagnostic: DiagnosticWriter,
  operation: () => Promise<{ text: string; structuredContent: { results: unknown[] } }>,
): Promise<CallToolResult> {
  try {
    const result = await operation();
    return {
      content: [
        { type: "text", text: result.text },
        {
          type: "resource_link",
          uri: SYNTAX_PRIMER_URI,
          name: "LambdaMOO syntax primer",
          description: "Read before generating LambdaMOO code.",
          mimeType: "text/markdown",
        },
      ],
      structuredContent: result.structuredContent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostic(`${name}: ${message}`);
    return { content: [{ type: "text", text: `Unable to complete ${name}: ${message}` }], isError: true };
  }
}
