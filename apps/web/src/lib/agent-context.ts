import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { resolveAgentProvider } from "./credentials";
import { db } from "./db";
import {
  agentPermissions,
  agentSkills,
  agentTools,
  agents,
  messages,
  roomMembers,
  rooms,
  skills,
  users,
} from "./db/schema";
import { recallMemories, type MemoryItem } from "./memory";
import { listMcpToolsForAgent } from "./mcp-resolver";
import { resolveAgentTools, type ToolSpec } from "./tools";

/**
 * Memuat seluruh konteks yang dibutuhkan satu run agent (Fase 3).
 *
 * Dipakai oleh `GET /api/internal/agents/:id/context` — sumber tunggal
 * kebenaran untuk worker agar Python tidak perlu tahu detail schema.
 */

export type ContextHistoryItem = {
  id: string;
  author_type: string;
  author_name: string;
  role: string;
  content: string;
  created_at: string;
  is_trigger?: boolean;
};

/** Bentuk provider yang dikirim ke worker (snake_case mengikuti API_SPEC). */
export type ProviderPayload = {
  kind: string;
  base_url: string | null;
  api_key: string;
  model: string;
  params: Record<string, unknown>;
  source: string;
  pricing: { input_per_1k: number | null; output_per_1k: number | null };
};

export type AgentContext = {
  agent: {
    id: string;
    company_id: string;
    name: string;
    display_name: string;
    role: string | null;
    description: string | null;
    objective: string | null;
    system_prompt: string | null;
    max_steps: number;
    daily_cost_limit: number | null;
    settings: Record<string, unknown>;
  };
  provider: ProviderPayload;
  skills: { name: string; category: string | null; prompt_hint: string | null }[];
  tools: ToolSpec[];
  permissions: { permission: string; effect: string }[];
  room: { id: string; name: string; type: string; topic: string | null } | null;
  members: { kind: "agent" | "human"; id: string; name: string; role: string | null }[];
  history: ContextHistoryItem[];
  trigger: { kind: string; message_id: string | null; text: string | null; user_id: string | null };
  memories: MemoryItem[];
  budget: { max_steps: number; max_tokens: number };
};

const DEFAULT_HISTORY = 30;
const DEFAULT_MAX_TOKENS = 12000;

export class AgentNotFoundError extends Error {
  constructor(id: string) {
    super(`Agent "${id}" tidak ditemukan.`);
    this.name = "AgentNotFoundError";
  }
}

export async function loadAgentContext(
  agentId: string,
  options: { roomId?: string | null; triggerMessageId?: string | null; historyLimit?: number } = {},
): Promise<AgentContext> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
    .limit(1);
  if (!agent) throw new AgentNotFoundError(agentId);

  const provider = await resolveAgentProvider(agent);

  // --- Skills ---
  const skillRows = await db
    .select({
      name: skills.name,
      category: skills.category,
      promptHint: skills.promptHint,
    })
    .from(agentSkills)
    .innerJoin(skills, eq(skills.id, agentSkills.skillId))
    .where(eq(agentSkills.agentId, agentId));

  // --- Tools (agent_tools) ---
  const toolRows = await db
    .select({ toolKey: agentTools.toolKey, isEnabled: agentTools.isEnabled })
    .from(agentTools)
    .where(eq(agentTools.agentId, agentId));
  const enabledToolKeys = toolRows.filter((t) => t.isEnabled).map((t) => t.toolKey);
  const toolSpecs = await resolveAgentTools(
    agentId,
    toolRows.length > 0 ? enabledToolKeys : null,
  );

  // --- Tools MCP (F6-01): merge, gagal-toleran (KB MCP mati ≠ run mati) ---
  try {
    const mcpSpecs = await listMcpToolsForAgent(agent.companyId, agentId);
    toolSpecs.push(...mcpSpecs);
  } catch {
    // Tanpa MCP pun run harus tetap jalan.
  }

  // --- Permissions ---
  const permRows = await db
    .select({ permission: agentPermissions.permission, effect: agentPermissions.effect })
    .from(agentPermissions)
    .where(eq(agentPermissions.agentId, agentId));

  // --- Room + members + history ---
  let room: AgentContext["room"] = null;
  const members: AgentContext["members"] = [];
  let history: ContextHistoryItem[] = [];

  if (options.roomId) {
    const [roomRow] = await db
      .select({ id: rooms.id, name: rooms.name, type: rooms.type, topic: rooms.topic })
      .from(rooms)
      .where(
        and(eq(rooms.id, options.roomId), eq(rooms.companyId, agent.companyId), isNull(rooms.deletedAt)),
      )
      .limit(1);

    if (roomRow) {
      room = roomRow;

      const memberRows = await db
        .select({
          agentId: roomMembers.agentId,
          userId: roomMembers.userId,
          role: roomMembers.role,
          agentName: agents.displayName,
          userName: users.displayName,
        })
        .from(roomMembers)
        .leftJoin(agents, eq(agents.id, roomMembers.agentId))
        .leftJoin(users, eq(users.id, roomMembers.userId))
        .where(eq(roomMembers.roomId, roomRow.id));

      for (const m of memberRows) {
        if (m.agentId) {
          members.push({ kind: "agent", id: m.agentId, name: m.agentName ?? "Agent", role: m.role });
        } else if (m.userId) {
          members.push({ kind: "human", id: m.userId, name: m.userName ?? "User", role: m.role });
        }
      }

      const limit = options.historyLimit ?? DEFAULT_HISTORY;
      const historyRows = await db
        .select({
          id: messages.id,
          authorType: messages.authorType,
          authorUserId: messages.authorUserId,
          authorAgentId: messages.authorAgentId,
          content: messages.content,
          createdAt: messages.createdAt,
          userName: users.displayName,
          agentName: agents.displayName,
        })
        .from(messages)
        .leftJoin(users, eq(users.id, messages.authorUserId))
        .leftJoin(agents, eq(agents.id, messages.authorAgentId))
        .where(
          and(
            eq(messages.roomId, roomRow.id),
            eq(messages.isDeleted, false),
            isNull(messages.threadRootId),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      history = historyRows.reverse().map((h) => ({
        id: h.id,
        author_type: h.authorType,
        author_name: h.agentName ?? h.userName ?? "Unknown",
        role: h.authorType === "agent" ? "assistant" : "user",
        content: h.content ?? "",
        created_at: h.createdAt.toISOString(),
        is_trigger: h.id === options.triggerMessageId,
      }));
    }
  }

  // --- Trigger ---
  let trigger: AgentContext["trigger"] = {
    kind: "room.mention",
    message_id: options.triggerMessageId ?? null,
    text: null,
    user_id: null,
  };
  if (options.triggerMessageId) {
    const [t] = await db
      .select({
        content: messages.content,
        authorUserId: messages.authorUserId,
        authorType: messages.authorType,
      })
      .from(messages)
      .where(eq(messages.id, options.triggerMessageId))
      .limit(1);
    if (t) {
      trigger = {
        kind: "room.mention",
        message_id: options.triggerMessageId,
        text: t.content ?? null,
        user_id: t.authorUserId ?? null,
      };
    }
  }

  const settings = (agent.settings ?? {}) as Record<string, unknown>;
  const maxTokens =
    typeof settings.max_tokens === "number" ? settings.max_tokens : DEFAULT_MAX_TOKENS;

  // --- Memories (F4-03) — kegagalan recall tidak boleh mematikan run ---
  let memories: MemoryItem[] = [];
  try {
    memories = await recallMemories({
      companyId: agent.companyId,
      agentId: agent.id,
      roomId: options.roomId ?? null,
      limit: 10,
    });
  } catch {
    memories = [];
  }

  const providerPayload: ProviderPayload = {
    kind: provider.kind,
    base_url: provider.baseUrl,
    api_key: provider.apiKey ?? "",
    model: provider.model,
    params: provider.params,
    source: provider.source,
    pricing: provider.pricing,
  };

  return {
    agent: {
      id: agent.id,
      company_id: agent.companyId,
      name: agent.name,
      display_name: agent.displayName ?? agent.name,
      role: agent.role,
      description: agent.description,
      objective: agent.objective,
      system_prompt: agent.systemPrompt,
      max_steps: agent.maxSteps,
      daily_cost_limit: agent.dailyCostLimit ? Number(agent.dailyCostLimit) : null,
      settings,
    },
    provider: providerPayload,
    skills: skillRows.map((s) => ({
      name: s.name,
      category: s.category,
      prompt_hint: s.promptHint,
    })),
    tools: toolSpecs,
    permissions: permRows,
    room,
    members,
    history,
    trigger,
    memories,
    budget: { max_steps: agent.maxSteps, max_tokens: maxTokens },
  };
}

/** Ringkas nama agent untuk pesan sistem. */
export async function agentNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: agents.id, name: agents.displayName })
    .from(agents)
    .where(inArray(agents.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.name ?? r.id]));
}
