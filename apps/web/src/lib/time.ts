import { APP_TIMEZONE } from "./env";

/**
 * Format tanggal/waktu dalam WIB (Asia/Jakarta).
 * Semua timestamp disimpan sebagai momen absolut (UTC); tampilan dikonversi di sini.
 * Lihat docs/ARCHITECTURE.md §10.4.
 */

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(value: DateInput, locale = "id-ID"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(toDate(value));
}

export function formatDate(value: DateInput, locale = "id-ID"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIMEZONE,
    dateStyle: "medium",
  }).format(toDate(value));
}

export function formatTime(value: DateInput, locale = "id-ID"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIMEZONE,
    timeStyle: "short",
  }).format(toDate(value));
}

/** ISO-8601 untuk kontrak API/event. */
export function toISO(value: DateInput): string {
  return toDate(value).toISOString();
}

export const TIMEZONE = APP_TIMEZONE;
