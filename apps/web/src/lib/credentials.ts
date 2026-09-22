import { and, eq, isNull } from "drizzle-orm";

import { decryptSecret, hasMasterKey } from "./crypto";
import { db } from "./db";
import { aiCredentials, aiModels, aiProviders, agents } from "./db/schema";

/**
 * Resolusi konfigurasi provider untuk sebuah agent (Fase 3).
 *
 * Urutan sumber kredensial:
 *  1. `ai_credentials` milik agent (didekripsi AES-256-GCM)
 *  2. fallback `ai_credentials` milik company dengan provider sama
 *  3. environment variable (paling praktis untuk dev / self-host)
 *
 * Model diambil dari `ai_models` bila agent menunjuk `model_id`,
 * kalau tidak dari `provider.config.default_model`, lalu default bawaan.
 */

export type ProviderKind = "openai" | "anthropic" | "gemini" | "openai_compatible" | "local";

export type ResolvedProvider = {
  kind: ProviderKind;
  baseUrl: string | null;
  apiKey: string | null;
  model: string;
  params: Record<string, unknown>;
  /** Dari mana kredensial diperoleh (untuk audit/log). */
  source: "agent_credential" | "company_credential" | "env" | "none";
  /** Harga model (USD per 1K token) dari `ai_models`, bila terdaftar. */
  pricing: { input_per_1k: number | null; output_per_1k: number | null };
};

const ENV_KEYS: Record<ProviderKind, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  openai_compatible: ["OPENAI_COMPATIBLE_API_KEY", "OPENAI_API_KEY"],
  local: ["LOCAL_LLM_API_KEY", "OPENAI_COMPATIBLE_API_KEY"],
};

export const DEFAULT_MODELS: Record<ProviderKind, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-1.5-flash",
  openai_compatible: "gpt-4o-mini",
  local: "llama3.1",
};

export const DEFAULT_BASE_URLS: Partial<Record<ProviderKind, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openai_compatible: "https://api.openai.com/v1",
  local: "http://localhost:11434/v1",
};

function envKey(kind: ProviderKind): string | null {
  for (const key of ENV_KEYS[kind] ?? []) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export class NoProviderError extends Error {
  constructor(agentName: string) {
    super(
      `Agent "${agentName}" belum punya provider/kredensial. ` +
        `Set salah satu API key provider di .env (mis. OPENAI_API_KEY) atau simpan kredensial di menu Providers.`,
    );
    this.name = "NoProviderError";
  }
}

export type AgentProviderRow = typeof agents.$inferSelect;

export async function resolveAgentProvider(agent: AgentProviderRow): Promise<ResolvedProvider> {
  let kind: ProviderKind = "openai";
  let baseUrl: string | null = null;
  let defaultModel: string | null = null;
  const providerId: string | null = agent.providerId ?? null;

  if (agent.providerId) {
    const [provider] = await db
      .select()
      .from(aiProviders)
      .where(and(eq(aiProviders.id, agent.providerId), isNull(aiProviders.deletedAt)))
      .limit(1);
    if (provider) {
      kind = provider.kind as ProviderKind;
      baseUrl = provider.baseUrl ?? null;
      const cfg = (provider.config ?? {}) as Record<string, unknown>;
      if (typeof cfg.default_model === "string") defaultModel = cfg.default_model;
    }
  }

  let model = defaultModel ?? DEFAULT_MODELS[kind];
  let pricing: ResolvedProvider["pricing"] = { input_per_1k: null, output_per_1k: null };
  if (agent.modelId) {
    const [m] = await db
      .select({
        modelKey: aiModels.modelKey,
        inputCostPer1k: aiModels.inputCostPer1k,
        outputCostPer1k: aiModels.outputCostPer1k,
      })
      .from(aiModels)
      .where(eq(aiModels.id, agent.modelId))
      .limit(1);
    if (m?.modelKey) model = m.modelKey;
    if (m) {
      pricing = {
        input_per_1k: m.inputCostPer1k ? Number(m.inputCostPer1k) : null,
        output_per_1k: m.outputCostPer1k ? Number(m.outputCostPer1k) : null,
      };
    }
  }

  const pickCredential = async (id: string | null) => {
    if (!id || !hasMasterKey()) return null;
    const [cred] = await db
      .select()
      .from(aiCredentials)
      .where(and(eq(aiCredentials.id, id), eq(aiCredentials.isEnabled, true), isNull(aiCredentials.deletedAt)))
      .limit(1);
    if (!cred) return null;
    try {
      return decryptSecret({ cipher: cred.secretCipher, iv: cred.secretIv });
    } catch {
      return null;
    }
  };

  let apiKey = await pickCredential(agent.credentialId);
  let source: ResolvedProvider["source"] = apiKey ? "agent_credential" : "none";

  if (!apiKey && providerId) {
    const [cred] = await db
      .select()
      .from(aiCredentials)
      .where(
        and(
          eq(aiCredentials.companyId, agent.companyId),
          eq(aiCredentials.providerId, providerId),
          eq(aiCredentials.isEnabled, true),
          isNull(aiCredentials.deletedAt),
        ),
      )
      .limit(1);
    if (cred && hasMasterKey()) {
      try {
        apiKey = decryptSecret({ cipher: cred.secretCipher, iv: cred.secretIv });
        source = "company_credential";
      } catch {
        // jatuh ke env
      }
    }
  }

  if (!apiKey) {
    const fromEnv = envKey(kind);
    if (fromEnv) {
      apiKey = fromEnv;
      source = "env";
    }
  }

  if (!apiKey) throw new NoProviderError(agent.displayName ?? agent.name);

  return {
    kind,
    baseUrl: baseUrl ?? DEFAULT_BASE_URLS[kind] ?? null,
    apiKey,
    model,
    params: (agent.modelParams ?? {}) as Record<string, unknown>,
    source,
    pricing,
  };
}

/** Provider default yang terpasang (dipakai endpoint `/api/internal/providers`). */
export async function listAvailableProviderKinds(companyId: string): Promise<ProviderKind[]> {
  const rows = await db
    .select({ kind: aiProviders.kind })
    .from(aiProviders)
    .where(and(eq(aiProviders.companyId, companyId), isNull(aiProviders.deletedAt)));

  const kinds = new Set<ProviderKind>(rows.map((r) => r.kind as ProviderKind));
  for (const kind of Object.keys(ENV_KEYS) as ProviderKind[]) {
    if (envKey(kind)) kinds.add(kind);
  }
  return [...kinds];
}
