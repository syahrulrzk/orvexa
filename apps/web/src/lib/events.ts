import { newId } from "./ids";
import { publish, roomChannel } from "./redis";

/**
 * Tipe event realtime yang dikirim ke browser lewat SSE.
 * Lihat docs/API_SPEC.md §6.1 dan ARCHITECTURE.md §5.2.
 */
export type RoomEventType =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "reaction.added"
  | "reaction.removed"
  | "typing"
  | "agent.status"
  | "agent.run.started"
  | "agent.run.finished"
  | "agent.message.started"
  | "agent.token"
  | "agent.message.completed"
  | "agent.reasoning"
  | "tool.call"
  | "tool.result"
  | "task.created"
  | "task.updated"
  | "approval.requested"
  | "approval.resolved"
  | "decision.created"
  | "document.created"
  | "activity.logged"
  | "presence";

export type RoomEvent = {
  event_id: string;
  room_id: string;
  type: RoomEventType;
  agent_id: string | null;
  run_id: string | null;
  payload: unknown;
  ts: string;
};

/** Publikasikan event ke channel room. */
export async function publishRoomEvent(
  roomId: string,
  type: RoomEventType,
  payload: unknown,
  meta?: { agentId?: string; runId?: string },
): Promise<RoomEvent> {
  const event: RoomEvent = {
    event_id: newId("evt"),
    room_id: roomId,
    type,
    agent_id: meta?.agentId ?? null,
    run_id: meta?.runId ?? null,
    payload,
    ts: new Date().toISOString(),
  };
  await publish(roomChannel(roomId), event);
  return event;
}
