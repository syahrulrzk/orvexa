import { and, eq, isNull } from "drizzle-orm";

import { DEFAULT_BASE_URLS } from "./credentials";
import { decryptSecret, hasMasterKey } from "./crypto";
import { db } from "./db";
import { aiCredentials, aiProviders } from "./db/schema";

/**
 * Resolver model embedding (F4-04/F4-05).
 *
 * Keputusan OQ-05: default OpenAI `text-embedding-3-small` (1536 dim,
 * sesuai kolom pgvector di schema). Kredensial diambil dari
 * `ai_providers`/`ai_credentials` company (kind openai/openai_compatible)
 * lalu fallback ke env — sama seperti resolusi provider chat.
 */

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

export type Embedder = {
  model: string;
  dim: number;
  source: string;
  embed(texts: string[]): Promise<number[][]>;
};

class EmbeddingError extends Error {}

function envEmbeddingKey(): string | null {
  for (const key of ["OPENAI_API_KEY", "OPENAI_COMPATIBLE_API_KEY"]) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export async function resolveEmbedder(companyId: string): Promise<Embedder> {
  let baseUrl = DEFAULT_BASE_URLS.openai ?? "https://api.openai.com/v1";
  let apiKey: string | null = null;
  let source = "env";

  const providers = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.companyId, companyId),
        isNull(aiProviders.deletedAt),
        eq(aiProviders.isEnabled, true),
      ),
    );

  const embedProvider = providers.find(
    (p) => p.kind === "openai" || p.kind === "openai_compatible" || p.kind === "local",
  );

  if (embedProvider) {
    baseUrl = embedProvider.baseUrl ?? baseUrl;
    if (hasMasterKey()) {
      const [cred] = await db
        .select()
        .from(aiCredentials)
        .where(
          and(
            eq(aiCredentials.providerId, embedProvider.id),
            eq(aiCredentials.isEnabled, true),
            isNull(aiCredentials.deletedAt),
          ),
        )
        .limit(1);
      if (cred) {
        try {
          apiKey = decryptSecret({ cipher: cred.secretCipher, iv: cred.secretIv });
          source = "company_credential";
        } catch {
          // jatuh ke env
        }
      }
    }
  }

  if (!apiKey) {
    apiKey = envEmbeddingKey();
    source = "env";
  }
  if (!apiKey) {
    throw new EmbeddingError(
      "Tidak ada API key untuk embedding. Set OPENAI_API_KEY di .env atau simpan kredensial provider.",
    );
  }

  const url = `${baseUrl.replace(/\/$/, "")}/embeddings`;

  return {
    model: EMBEDDING_MODEL,
    dim: EMBEDDING_DIM,
    source,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new EmbeddingError(`Embedding API gagal (HTTP ${res.status}): ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
      const data = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
      if (data.length !== texts.length) {
        throw new EmbeddingError("Jumlah embedding tidak sesuai input.");
      }
      return data.map((d) => d.embedding);
    },
  };
}
