import { FormatError, check, format, type Diagnostic } from "@kruton/moo-lsp";

export interface CheckMooCodeResult {
  diagnostics: Diagnostic[];
}

export interface FormatMooCodeResult {
  formatted: string | null;
  diagnostics: Diagnostic[];
}

export async function checkMooCode(code: string): Promise<CheckMooCodeResult> {
  return { diagnostics: await check(code) };
}

export async function formatMooCode(code: string): Promise<FormatMooCodeResult> {
  try {
    return { formatted: await format(code), diagnostics: [] };
  } catch (error) {
    if (error instanceof FormatError) {
      return { formatted: null, diagnostics: error.diagnostics };
    }
    throw error;
  }
}

export function presentDiagnostics(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return "No LambdaMOO syntax diagnostics were found.";
  return diagnostics.map((diagnostic) => {
    const line = diagnostic.range.start.line + 1;
    const character = diagnostic.range.start.character + 1;
    const severity = diagnosticSeverity(diagnostic.severity);
    const code = diagnostic.code === undefined ? "" : `[${diagnostic.code}]`;
    return `${line}:${character}: ${severity}${code}: ${diagnostic.message}`;
  }).join("\n");
}

function diagnosticSeverity(severity: Diagnostic["severity"]): string {
  switch (severity) {
    case 1: return "error";
    case 2: return "warning";
    case 3: return "information";
    case 4: return "hint";
    default: return "diagnostic";
  }
}
