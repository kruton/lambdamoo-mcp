import { setTimeout as delay } from "node:timers/promises";

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error)) throw error;
      const backoff = Math.min(10_000, 250 * 2 ** (attempt - 1));
      await delay(backoff + Math.floor(Math.random() * 250));
    }
  }
  throw lastError;
}
