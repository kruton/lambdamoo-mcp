import { createHash } from "node:crypto";

export function codeSha256(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}
