/**
 * RBAC tingkat company (lihat docs/SECURITY.md §4 dan docs/API_SPEC.md §17).
 *
 * Catatan: ini otorisasi KASAR di BFF. Enforcement final tetap di runtime
 * (worker) + RLS database.
 */

export type MemberRole = "owner" | "admin" | "manager" | "member" | "viewer";

export const PERMISSIONS = [
  "room.read",
  "room.write",
  "room.manage",
  "message.send",
  "message.delete",
  "task.create",
  "task.assign",
  "task.delete",
  "knowledge.read",
  "knowledge.write",
  "knowledge.delete",
  "document.create",
  "document.approve",
  "agent.create",
  "agent.configure",
  "agent.delete",
  "provider.configure",
  "credential.manage",
  "approval.decide",
  "server.read",
  "server.restart",
  "firewall.read",
  "firewall.modify",
  "database.read",
  "database.write",
  "production.deploy",
  "member.invite",
  "team.create",
  "team.update",
  "team.delete",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Peran baca-saja. */
const VIEWER: readonly Permission[] = [
  "room.read",
  "knowledge.read",
  "server.read",
  "firewall.read",
  "database.read",
];

/** Peran kerja harian. */
const MEMBER: readonly Permission[] = [
  ...VIEWER,
  "room.write",
  "message.send",
  "task.create",
  "document.create",
];

/** Peran pengelola project/room. */
const MANAGER: readonly Permission[] = [
  ...MEMBER,
  "room.manage",
  "message.delete",
  "task.assign",
  "knowledge.write",
  "document.approve",
  "approval.decide",
];

/** Peran pengelola platform. */
const ADMIN: readonly Permission[] = [
  ...MANAGER,
  "task.delete",
  "knowledge.delete",
  "agent.create",
  "agent.configure",
  "provider.configure",
  "credential.manage",
  "member.invite",
  "team.create",
  "team.update",
  "team.delete",
  "settings.manage",
  // Aksi sensitif tetap butuh approval dari agent; admin boleh menyetujui.
  "server.restart",
  "firewall.modify",
  "database.write",
  "production.deploy",
];

const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[] | "all"> = {
  owner: "all",
  admin: ADMIN,
  manager: MANAGER,
  member: MEMBER,
  viewer: VIEWER,
};

export function hasPermission(role: MemberRole, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[role];
  if (granted === "all") return true;
  return granted.includes(permission);
}

export function listPermissions(role: MemberRole): readonly Permission[] {
  const granted = ROLE_PERMISSIONS[role];
  return granted === "all" ? PERMISSIONS : granted;
}

export class PermissionDeniedError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`Akses ditolak: butuh permission "${permission}"`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}

export function assertPermission(role: MemberRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new PermissionDeniedError(permission);
  }
}
