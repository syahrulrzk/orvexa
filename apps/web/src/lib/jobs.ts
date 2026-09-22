import { getRedis } from "./redis";
import { newId } from "./ids";

/**
 * Jembatan Next.js → Python worker lewat **Redis Streams** (`agent.jobs`).
 * Lihat ARCHITECTURE.md §8.1 dan API_SPEC.md §7.
 *
 * Next.js hanya *memproduksi* job (cepat, non-blocking). Worker yang
 * mengonsumsi memakai consumer group sehingga job tidak hilang kalau
 * worker restart.
 */

export const JOB_STREAM = process.env.WORKER_JOB_STREAM ?? "agent.jobs";

export type AgentTriggerKind =
  | "room.mention"
  | "room.message"
  | "task.assigned"
  | "schedule"
  | "manual"
  | "delegation";

export type AgentJob = {
  job_id: string;
  type: "agent.run";
  company_id: string;
  agent_id: string;
  room_id: string | null;
  trigger: {
    kind: AgentTriggerKind;
    message_id?: string;
    user_id?: string | null;
    text?: string;
    [key: string]: unknown;
  };
  budget: { max_steps: number; max_tokens: number };
  trace_id: string;
  enqueued_at: string;
};

/** Enqueue satu run agent. Mengembalikan `job_id`. */
export async function enqueueAgentJob(input: {
  companyId: string;
  agentId: string;
  roomId?: string | null;
  trigger: AgentJob["trigger"];
  budget?: Partial<AgentJob["budget"]>;
  traceId?: string;
}): Promise<string> {
  const job: AgentJob = {
    job_id: newId("job"),
    type: "agent.run",
    company_id: input.companyId,
    agent_id: input.agentId,
    room_id: input.roomId ?? null,
    trigger: input.trigger,
    budget: {
      max_steps: input.budget?.max_steps ?? 8,
      max_tokens: input.budget?.max_tokens ?? 12000,
    },
    trace_id: input.traceId ?? newId("trc"),
    enqueued_at: new Date().toISOString(),
  };

  await getRedis().xadd(JOB_STREAM, "*", "data", JSON.stringify(job));
  return job.job_id;
}
