import type {
  MooHelpSearchResult,
  MooSymbolLookupResult,
  MooVerbSearchResult,
} from "../../core/src/types.js";

export function presentVerbResults(results: MooVerbSearchResult[]): string {
  if (results.length === 0) return "No matching LambdaMOO verbs were found.";
  return results.map((result, index) => [
    `## ${index + 1}. ${result.symbol ?? result.name}`,
    `**Arguments:** ${result.args || "unspecified"}`,
    `**Purpose:** ${result.description || "No description available."}`,
    `**Dependencies:** ${result.dependencies.join(", ") || "none detected"}`,
    `**Vector distance:** ${result.distance.toFixed(4)} (lower is more relevant)`,
    "```moo",
    result.code,
    "```",
  ].join("\n\n")).join("\n\n---\n\n");
}

export function presentHelpResults(results: MooHelpSearchResult[]): string {
  if (results.length === 0) return "No matching LambdaMOO help topics were found.";
  return results.map((result, index) => [
    `## ${index + 1}. ${result.topic}`,
    result.database_symbol ? `**Help database:** ${result.database_symbol}` : undefined,
    `**Vector distance:** ${result.distance.toFixed(4)} (lower is more relevant)`,
    result.text,
  ].filter((part): part is string => part !== undefined).join("\n\n")).join("\n\n---\n\n");
}

export function presentSymbolResults(results: MooSymbolLookupResult[]): string {
  if (results.length === 0) return "No exact LambdaMOO canonical symbol or registry alias was found.";
  return results.map((result) => [
    `## ${result.symbol}`,
    `**Type:** ${result.type}`,
    `**Name:** ${result.name}`,
    `**Aliases:** ${result.aliases.join(", ") || "none"}`,
    result.args ? `**Arguments:** ${result.args}` : undefined,
    result.description ? `**Purpose:** ${result.description}` : undefined,
    result.code ? `\`\`\`moo\n${result.code}\n\`\`\`` : undefined,
  ].filter((part): part is string => part !== undefined).join("\n\n")).join("\n\n---\n\n");
}
