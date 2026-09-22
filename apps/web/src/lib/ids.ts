import { randomUUID } from "node:crypto";

/**
 * ID ber-prefix sesuai konvensi docs/DATABASE_SCHEMA.md §1.1.
 * Contoh: newId("agt") → "agt_0f3a...".
 */
export function newId(prefix: string): string {
  const raw = randomUUID().replace(/-/g, "").slice(0, 26);
  return `${prefix}_${raw}`;
}

export const idPrefix = {
  company: "cmp",
  user: "usr",
  team: "tm",
  agent: "agt",
  room: "rm",
  message: "msg",
  skill: "skl",
  provider: "prv",
  credential: "crd",
  model: "mdl",
  theme: "thm",
  activity: "act",
  notification: "ntf",
} as const;
