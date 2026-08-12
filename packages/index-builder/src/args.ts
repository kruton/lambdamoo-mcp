import { PipelineError } from "@lambdamoo-mcp/core/errors";

export type CliArgs = Record<string, string | boolean>;

export function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new PipelineError(`Unexpected positional argument: ${token ?? ""}`);
    }
    const equals = token.indexOf("=");
    if (equals > 2) {
      result[token.slice(2, equals)] = token.slice(equals + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

export function stringArg(args: CliArgs, name: string, fallback?: string): string {
  const value = args[name];
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  throw new PipelineError(`Missing required option --${name}`);
}

export function booleanArg(args: CliArgs, name: string): boolean {
  return args[name] === true || args[name] === "true";
}

export function integerArg(args: CliArgs, name: string, fallback: number): number {
  const value = args[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new PipelineError(`--${name} must be a positive integer`);
  }
  return parsed;
}
