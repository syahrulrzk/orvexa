import { and, eq, isNull } from "drizzle-orm";

import { db } from "./db";
import { agents, documents, messages, rooms, tasks } from "./db/schema";
import { saveMemory, type MemoryScope } from "./memory";
import { publishRoomEvent } from "./events";
import { enqueueAgentJob } from "./jobs";
import { newId } from "./ids";

/**
 * Tool builtin yang dieksekusi **di sisi web** (Fase 3).
 *
 * Worker hanya menerima spesifikasi tool (lewat `/api/internal/agents/:id/context`)
 * lalu memanggil `/api/internal/tools/execute`. Dengan begitu validasi,
 * permission, audit, dan event realtime tetap satu pintu di Next.js.
 */

export type ToolSpec = {
  key: string;
  description: string;
  parameters: Record<string, unknown>;
  permission: string;
  requires_approval: boolean;
};

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({ type: "object", properties, required, additionalProperties: false });

export const BUILTIN_TOOLS: ToolSpec[] = [
  {
    key: "room.post",
    description:
      "Kirim pesan ke room tempat agent berada. Pakai untuk memberi update singkat ke tim.",
    parameters: objectSchema(
      {
        content: { type: "string", description: "Isi pesan (markdown ringkas)." },
        kind: { type: "string", enum: ["text", "alert"], description: "Default text." },
      },
      ["content"],
    ),
    permission: "room.write",
    requires_approval: false,
  },
  {
    key: "task.create",
    description: "Buat task baru yang bisa dikerjakan manusia atau agent lain.",
    parameters: objectSchema(
      {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        project_id: { type: "string", description: "Opsional." },
        assignee_agent_id: { type: "string", description: "Opsional." },
      },
      ["title"],
    ),
    permission: "task.create",
    requires_approval: false,
  },
  {
    key: "agent.delegate",
    description:
      "Delegasikan sub-tugas ke agent spesialis lain. Agent yang didelegasi akan " +
      "menjalankan run sendiri dan memposting hasilnya di room ini.",
    parameters: objectSchema(
      {
        agent_id: { type: "string", description: "ID agent tujuan (lihat daftar member room)." },
        task: { type: "string", description: "Instruksi spesifik yang didelegasikan." },
        context: { type: "string", description: "Opsional: konteks tambahan." },
      },
      ["agent_id", "task"],
    ),
    permission: "agent.delegate",
    requires_approval: false,
  },
  {
    key: "kb.search",
    description:
      "Cari informasi di Knowledge Base company (dokumen yang sudah diindex). " +
      "Gunakan sebelum menjawab pertanyaan yang butuh fakta internal.",
    parameters: objectSchema(
      {
        query: { type: "string", description: "Pertanyaan atau kata kunci pencarian." },
        limit: { type: "number", description: "Jumlah hasil, default 5, maks 10." },
      },
      ["query"],
    ),
    permission: "knowledge.read",
    requires_approval: false,
  },
  {
    key: "memory.save",
    description:
      "Simpan fakta, keputusan, atau preferensi penting sebagai ingatan jangka panjang " +
      "agar bisa diingat di run berikutnya.",
    parameters: objectSchema(
      {
        scope: {
          type: "string",
          enum: ["conversation", "project", "company", "agent"],
          description: "conversation=room ini, project, company, atau agent.",
        },
        content: { type: "string", description: "Fakta ringkas satu-dua kalimat." },
        importance: {
          type: "number",
          description: "0.0-1.0, default 0.5. Makna penting → muncul lebih dulu.",
        },
      },
      ["scope", "content"],
    ),
    permission: "memory.write",
    requires_approval: false,
  },
  {
    key: "doc.generate",
    description:
      "Simpan dokumen hasil kerja (MOP, SOP, RCA, laporan investigasi) sebagai draft.",
    parameters: objectSchema(
      {
        title: { type: "string" },
        doc_type: {
          type: "string",
          enum: ["mop", "sop", "rca", "report", "runbook", "other"],
          description: "Jenis dokumen.",
        },
        content_md: { type: "string", description: "Isi dokumen dalam markdown." },
      },
      ["title", "content_md"],
    ),
    permission: "document.create",
    requires_approval: false,
  },
];

export function getToolSpec(key: string): ToolSpec | undefined {
  return BUILTIN_TOOLS.find((t) => t.key === key);
}

export type ToolContext = {
  companyId: string;
  agentId: string;
  roomId: string | null;
  runId: string | null;
};

export type ToolResult = {
  ok: boolean;
  key: string;
  result?: unknown;
  error?: string;
  requires_approval?: boolean;
};

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const MEMORY_SCOPES_VALID: readonly string[] = ["conversation", "project", "company", "agent"];

/**
 * Eksekusi tool. `agent_permissions` diperiksa pemanggil (worker) lewat
 * `requires_approval`, sedangkan pembatasan tipe argumen dilakukan di sini.
 */
export async function executeTool(
  key: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const spec = getToolSpec(key);
  if (!spec) return { ok: false, key, error: `Tool "${key}" tidak dikenal.` };

  if (spec.requires_approval) {
    return { ok: false, key, requires_approval: true, error: "Tool ini butuh approval manusia." };
  }

  try {
    switch (key) {
      case "room.post": {
        if (!ctx.roomId) return { ok: false, key, error: "Tool room.post butuh room_id." };
        const content = asString(args.content);
        if (!content) return { ok: false, key, error: "Argumen `content` wajib diisi." };

        const kind = args.kind === "alert" ? "alert" : "text";
        const [row] = await db
          .insert(messages)
          .values({
            id: newId("msg"),
            companyId: ctx.companyId,
            roomId: ctx.roomId,
            authorType: "agent",
            authorAgentId: ctx.agentId,
            authorRunId: ctx.runId,
            kind,
            content,
            mentions: [],
            meta: { via: "tool:room.post" },
          })
          .returning();

        await db.update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, ctx.roomId));
        await publishRoomEvent(
          ctx.roomId,
          "message.created",
          {
            message: {
              id: row.id,
              room_id: row.roomId,
              author_type: row.authorType,
              author_agent_id: row.authorAgentId,
              author_run_id: row.authorRunId,
              kind: row.kind,
              content: row.content,
              mentions: row.mentions,
              meta: row.meta,
              created_at: row.createdAt,
            },
          },
          { agentId: ctx.agentId, runId: ctx.runId ?? undefined },
        );

        return { ok: true, key, result: { message_id: row.id } };
      }

      case "task.create": {
        const title = asString(args.title);
        if (!title) return { ok: false, key, error: "Argumen `title` wajib diisi." };

        const priority =
          typeof args.priority === "string" &&
          ["low", "medium", "high", "critical"].includes(args.priority)
            ? (args.priority as "low" | "medium" | "high" | "critical")
            : "medium";

        const [row] = await db
          .insert(tasks)
          .values({
            id: newId("tsk"),
            companyId: ctx.companyId,
            projectId: asString(args.project_id),
            roomId: ctx.roomId,
            createdByType: "agent",
            createdByAgentId: ctx.agentId,
            assignedAgentId: asString(args.assignee_agent_id),
            title,
            description: asString(args.description),
            priority,
            status: "backlog",
          })
          .returning();

        if (ctx.roomId) {
          await publishRoomEvent(
            ctx.roomId,
            "task.created",
            { task: { id: row.id, title: row.title, priority: row.priority, status: row.status } },
            { agentId: ctx.agentId, runId: ctx.runId ?? undefined },
          );
        }

        return { ok: true, key, result: { task_id: row.id, title: row.title } };
      }

      case "kb.search": {
        // F4-05: RAG dengan pre-filter permission. Query di-embed lalu
        // dicari via pgvector; ACL agent dievaluasi di SQL.
        const query = asString(args.query);
        if (!query) return { ok: false, key, error: "Argumen `query` wajib diisi." };
        const limit =
          typeof args.limit === "number" ? Math.min(10, Math.max(1, Math.round(args.limit))) : 5;

        try {
          const { retrieveChunks } = await import("./retrieval");
          const results = await retrieveChunks({
            companyId: ctx.companyId,
            agentId: ctx.agentId,
            query,
            limit,
            roomId: ctx.roomId,
          });
          return {
            ok: true,
            key,
            result: results.length > 0 ? { chunks: results } : { chunks: [], note: "Tidak ada hasil." },
          };
        } catch (err) {
          return {
            ok: false,
            key,
            error: err instanceof Error ? err.message : "Pencarian KB gagal.",
          };
        }
      }

      case "memory.save": {
        // F4-03: ingatan jangka panjang agent. scope conversation/project
        // otomatis terikat room/project saat ini.
        const scope = MEMORY_SCOPES_VALID.includes(args.scope as MemoryScope)
          ? (args.scope as MemoryScope)
          : null;
        const content = asString(args.content);
        if (!scope || !content) {
          return { ok: false, key, error: "Argumen `scope` dan `content` wajib diisi." };
        }

        const importance =
          typeof args.importance === "number" ? Math.min(1, Math.max(0, args.importance)) : 0.5;

        let scopeId: string | null = null;
        if (scope === "conversation") scopeId = ctx.roomId;
        else if (scope === "project") {
          if (!ctx.roomId) {
            return { ok: false, key, error: "Scope `project` butuh room yang terikat project." };
          }
          const [r] = await db
            .select({ projectId: rooms.projectId })
            .from(rooms)
            .where(eq(rooms.id, ctx.roomId))
            .limit(1);
          if (!r?.projectId) {
            return { ok: false, key, error: "Room ini tidak terikat ke project mana pun." };
          }
          scopeId = r.projectId;
        }

        const memory = await saveMemory({
          companyId: ctx.companyId,
          agentId: ctx.agentId,
          scope,
          scopeId,
          content,
          importance,
        });
        return { ok: true, key, result: { memory_id: memory.id, scope, importance } };
      }

      case "agent.delegate": {
        // F4-01: delegasi antar agent. Web yang enqueue job (karena Redis
        // hanya diakses dari web); worker cukup memanggil tool ini.
        const delegateeId = asString(args.agent_id);
        const taskText = asString(args.task);
        if (!delegateeId || !taskText) {
          return { ok: false, key, error: "Argumen `agent_id` dan `task` wajib diisi." };
        }
        if (delegateeId === ctx.agentId) {
          return { ok: false, key, error: "Tidak bisa mendelegasikan ke diri sendiri." };
        }

        const [delegatee] = await db
          .select({ id: agents.id, name: agents.name, displayName: agents.displayName })
          .from(agents)
          .where(
            and(
              eq(agents.id, delegateeId),
              eq(agents.companyId, ctx.companyId),
              isNull(agents.deletedAt),
            ),
          )
          .limit(1);
        if (!delegatee) {
          return { ok: false, key, error: "Agent tujuan tidak ditemukan." };
        }

        const job = await enqueueAgentJob({
          companyId: ctx.companyId,
          agentId: delegateeId,
          roomId: ctx.roomId,
          trigger: {
            kind: "delegation",
            parent_run_id: ctx.runId,
            task: taskText,
            delegator_agent_id: ctx.agentId,
            user_id: null,
          },
        });

        return {
          ok: true,
 key,
          result: { job_id: job, agent_id: delegateeId, agent_name: delegatee.displayName ?? delegatee.name },
        };
      }

      case "doc.generate": {
        const title = asString(args.title);
        const contentMd = asString(args.content_md);
        if (!title || !contentMd) {
          return { ok: false, key, error: "Argumen `title` dan `content_md` wajib diisi." };
        }

        const docType = asString(args.doc_type) ?? "report";
        const [row] = await db
          .insert(documents)
          .values({
            id: newId("doc"),
            companyId: ctx.companyId,
            roomId: ctx.roomId,
            authorAgentId: ctx.agentId,
            docType,
            title,
            contentMd,
            status: "draft",
            generatedByRunId: ctx.runId,
          })
          .returning();

        if (ctx.roomId) {
          await publishRoomEvent(
            ctx.roomId,
            "document.created",
            { document: { id: row.id, title: row.title, doc_type: row.docType, status: row.status } },
            { agentId: ctx.agentId, runId: ctx.runId ?? undefined },
          );
        }

        return { ok: true, key, result: { document_id: row.id, title: row.title } };
      }

      default:
        return { ok: false, key, error: `Handler untuk "${key}" belum diimplementasikan.` };
    }
  } catch (err) {
    return { ok: false, key, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Tool yang benar-benar boleh dipakai agent: builtin ∩ agent_tools (bila diatur). */
export async function resolveAgentTools(
  agentId: string,
  enabledKeys: string[] | null,
): Promise<ToolSpec[]> {
  void agentId;
  return BUILTIN_TOOLS.filter((t) => {
    if (t.requires_approval) return false;
    if (!enabledKeys) return true;
    return enabledKeys.includes(t.key);
  });
}
