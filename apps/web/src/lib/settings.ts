import { eq } from "drizzle-orm";

import { db } from "./db";
import { companies, userPreferences } from "./db/schema";
import { logActivity } from "./activity";

/**
 * Settings (Fase 5 — halaman Settings).
 *
 * Dua jsonb penting:
 *  - `userPreferences.notificationSettings` → toggle notifikasi per user
 *  - `companies.settings` → pengaturan per company (timezone, dsb.)
 * Keduanya di-merge (bukan replace) agar field yang tidak dikirim tetap utuh.
 */

export type NotificationSettings = {
  email_digest?: boolean;
  approval_email?: boolean;
  task_updates?: boolean;
  mention_only?: boolean;
};

export type CompanySettings = {
  timezone?: string;
  weekly_cost_report?: boolean;
  require_approval_note?: boolean;
  allow_user_theme?: boolean;
};

export async function getOrCreateUserPreferences(userId: string) {
  const [existing] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(userPreferences)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  // Race aman: kalau row sudah dibuat request lain, ambil lagi.
  if (created) return created;
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row;
}

export async function updateUserPreferences(
  userId: string,
  input: {
    theme_key?: string;
    locale?: "id" | "en";
    notification_settings?: NotificationSettings;
  },
) {
  const current = await getOrCreateUserPreferences(userId);

  const mergedNotifications: NotificationSettings = {
    ...(isRecord(current.notificationSettings) ? current.notificationSettings : {}),
    ...(input.notification_settings ?? {}),
  };

  const [updated] = await db
    .update(userPreferences)
    .set({
      ...(input.theme_key !== undefined ? { themeKey: input.theme_key } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      notificationSettings: mergedNotifications,
      updatedAt: new Date(),
    })
    .where(eq(userPreferences.userId, userId))
    .returning();
  return updated;
}

export async function updateCompanySettings(
  companyId: string,
  input: {
    name?: string;
    default_theme?: string;
    settings?: CompanySettings;
  },
  actor: { id: string },
) {
  const [company] = await db
    .select({ name: companies.name, settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) return null;

  const mergedSettings: CompanySettings = {
    ...(isRecord(company.settings) ? company.settings : {}),
    ...(input.settings ?? {}),
  };

  const [updated] = await db
    .update(companies)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.default_theme !== undefined ? { defaultTheme: input.default_theme } : {}),
      settings: mergedSettings,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId))
    .returning();

  await logActivity({
    companyId,
    actor: { type: "human", userId: actor.id },
    action: "settings.company_updated",
    targetType: "company",
    targetId: companyId,
    metadata: { changed: Object.keys(input) },
  });

  return updated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
