import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { newId } from "../ids";

// ============================================================
// ENUMS
// ============================================================
export const memberRole = pgEnum("member_role", [
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
]);

export const agentStatus = pgEnum("agent_status", [
  "idle",
  "thinking",
  "working",
  "waiting_approval",
  "error",
  "disabled",
]);

export const roomType = pgEnum("room_type", [
  "general",
  "department",
  "incident",
  "project",
  "war_room",
  "direct",
]);

export const messageAuthorType = pgEnum("message_author_type", [
  "human",
  "agent",
  "system",
  "tool",
  "event",
]);

export const messageKind = pgEnum("message_kind", [
  "text",
  "approval",
  "decision",
  "task",
  "document",
  "alert",
  "tool_call",
]);

export const providerKind = pgEnum("provider_kind", [
  "openai",
  "anthropic",
  "gemini",
  "openai_compatible",
  "local",
]);

// ============================================================
// IDENTITY
// ============================================================
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("usr")),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"),
    isActive: boolean("is_active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const companies = pgTable("companies", {
  id: text("id").primaryKey().$defaultFn(() => newId("cmp")),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  defaultTheme: text("default_theme").notNull().default("corporate_gray"),
  settings: jsonb("settings").notNull().default({}),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const companyMembers = pgTable(
  "company_members",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("cm")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    invitedBy: text("invited_by").references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("company_members_uq").on(t.companyId, t.userId),
    index("company_members_user_idx").on(t.userId),
  ],
);

// ============================================================
// PROVIDER & CREDENTIAL
// ============================================================
export const aiProviders = pgTable(
  "ai_providers",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("prv")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    kind: providerKind("kind").notNull(),
    label: text("label").notNull(),
    baseUrl: text("base_url"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("ai_providers_company_idx").on(t.companyId)],
);

export const aiCredentials = pgTable(
  "ai_credentials",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("crd")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    secretCipher: text("secret_cipher").notNull(),
    secretIv: text("secret_iv").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    last4: text("last4"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("ai_credentials_company_idx").on(t.companyId)],
);

export const aiModels = pgTable(
  "ai_models",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("mdl")),
    providerId: text("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "cascade" }),
    modelKey: text("model_key").notNull(),
    displayName: text("display_name").notNull(),
    capabilities: text("capabilities").array().notNull().default([]),
    contextWindow: integer("context_window"),
    inputCostPer1k: numeric("input_cost_per_1k", { precision: 12, scale: 6 }),
    outputCostPer1k: numeric("output_cost_per_1k", { precision: 12, scale: 6 }),
    isDefault: boolean("is_default").notNull().default(false),
    isEnabled: boolean("is_enabled").notNull().default(true),
  },
  (t) => [uniqueIndex("ai_models_uq").on(t.providerId, t.modelKey)],
);

// ============================================================
// SKILLS & AGENTS
// ============================================================
export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("skl")),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
    description: text("description"),
    promptHint: text("prompt_hint"),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("skills_company_idx").on(t.companyId)],
);

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("agt")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    role: text("role"),
    description: text("description"),
    objective: text("objective"),
    systemPrompt: text("system_prompt"),
    status: agentStatus("status").notNull().default("idle"),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    providerId: text("provider_id").references(() => aiProviders.id),
    modelId: text("model_id").references(() => aiModels.id),
    credentialId: text("credential_id").references(() => aiCredentials.id),
    fallbackCredentialId: text("fallback_credential_id").references(() => aiCredentials.id),
    modelParams: jsonb("model_params").notNull().default({}),
    maxSteps: integer("max_steps").notNull().default(8),
    dailyCostLimit: numeric("daily_cost_limit", { precision: 12, scale: 4 }),
    settings: jsonb("settings").notNull().default({}),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agents_company_name_uq").on(t.companyId, t.name),
    index("agents_company_idx").on(t.companyId),
  ],
);

export const agentSkills = pgTable(
  "agent_skills",
  {
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.skillId] })],
);

// ============================================================
// TEAMS
// ============================================================
export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("tm")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    avatarUrl: text("avatar_url"),
    defaults: jsonb("defaults").notNull().default({}),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("teams_company_name_uq").on(t.companyId, t.name)],
);

export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey().$defaultFn(() => newId("tmm")),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// ROOMS & MESSAGES
// ============================================================
export const rooms = pgTable(
  "rooms",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("rm")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: roomType("type").notNull().default("general"),
    topic: text("topic"),
    projectId: text("project_id"),
    incidentMeta: jsonb("incident_meta"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("rooms_company_idx").on(t.companyId)],
);

export const roomMembers = pgTable(
  "room_members",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("rmm")),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [index("room_members_room_idx").on(t.roomId)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("msg")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    threadRootId: text("thread_root_id"),
    authorType: messageAuthorType("author_type").notNull(),
    authorUserId: text("author_user_id").references(() => users.id),
    authorAgentId: text("author_agent_id").references(() => agents.id),
    authorRunId: text("author_run_id"),
    kind: messageKind("kind").notNull().default("text"),
    content: text("content"),
    contentJson: jsonb("content_json"),
    mentions: text("mentions").array().notNull().default([]),
    replyToId: text("reply_to_id"),
    meta: jsonb("meta").notNull().default({}),
    isEdited: boolean("is_edited").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("messages_room_time_idx").on(t.roomId, t.createdAt.desc())],
);

// ============================================================
// ACTIVITY & NOTIFICATIONS
// ============================================================
export const activityLogs = pgTable(
  "activity_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("act")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id),
    actorAgentId: text("actor_agent_id").references(() => agents.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    projectId: text("project_id"),
    summary: text("summary"),
    metadata: jsonb("metadata").notNull().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_company_time_idx").on(t.companyId, t.createdAt.desc())],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("ntf")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkUrl: text("link_url"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.isRead)],
);

// ============================================================
// THEMES & PREFERENCES
// ============================================================
export const themes = pgTable(
  "themes",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("thm")),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    tokens: jsonb("tokens").notNull().default({}),
    isBuiltin: boolean("is_builtin").notNull().default(false),
  },
  (t) => [index("themes_company_idx").on(t.companyId)],
);

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  activeCompanyId: text("active_company_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  themeId: text("theme_id").references(() => themes.id, { onDelete: "set null" }),
  themeKey: text("theme_key").notNull().default("corporate_gray"),
  locale: text("locale").notNull().default("id"),
  notificationSettings: jsonb("notification_settings").notNull().default({}),
  uiState: jsonb("ui_state").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
