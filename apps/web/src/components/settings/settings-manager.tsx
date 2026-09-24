"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { THEMES, useTheme, type ThemeKey } from "@/components/theme-provider";

export type CompanySettingsValues = {
  name: string;
  default_theme: string;
  timezone: string;
  weekly_cost_report: boolean;
  require_approval_note: boolean;
  allow_user_theme: boolean;
};

export type NotificationSettingsValues = {
  email_digest: boolean;
  approval_email: boolean;
  task_updates: boolean;
  mention_only: boolean;
};

export type SessionRow = {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
};

export type IntegrationView = {
  key: string;
  name: string;
  description: string;
  status: "ok" | "warning" | "planned";
  detail?: string;
};

type Tab = "company" | "preferences" | "security" | "integrations";

const TABS: { key: Tab; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "preferences", label: "Preferensi" },
  { key: "security", label: "Keamanan" },
  { key: "integrations", label: "Integrasi" },
];

const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "UTC"];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function statusBadge(status: IntegrationView["status"]) {
  if (status === "ok") return <Badge variant="success">Aktif</Badge>;
  if (status === "warning") return <Badge variant="warning">Perlu atensi</Badge>;
  return <Badge variant="info">Fase 6</Badge>;
}

export function SettingsManager({
  canEditCompany,
  initialCompany,
  initialPreferences,
  initialSessions,
  currentSessionId,
  integrations,
}: {
  canEditCompany: boolean;
  initialCompany: CompanySettingsValues;
  initialPreferences: { theme_key: string; locale: "id" | "en"; notifications: NotificationSettingsValues };
  initialSessions: SessionRow[];
  currentSessionId: string;
  integrations: IntegrationView[];
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [tab, setTab] = useState<Tab>("company");

  // Company
  const [company, setCompany] = useState(initialCompany);
  const [companySaved, setCompanySaved] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);

  // Preferensi
  const [locale, setLocale] = useState<"id" | "en">(initialPreferences.locale);
  const [notifications, setNotifications] = useState(initialPreferences.notifications);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Keamanan
  const [sessions, setSessions] = useState(initialSessions);

  async function saveCompany() {
    setCompanySaving(true);
    setCompanySaved(false);
    try {
      const res = await fetch("/api/v1/company/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: company.name,
          default_theme: company.default_theme,
          settings: {
            timezone: company.timezone,
            weekly_cost_report: company.weekly_cost_report,
            require_approval_note: company.require_approval_note,
            allow_user_theme: company.allow_user_theme,
          },
        }),
      });
      if (res.ok) {
        setCompanySaved(true);
        router.refresh();
      }
    } finally {
      setCompanySaving(false);
    }
  }

  const savePreferences = useCallback(
    async (patch: { theme_key?: ThemeKey; locale?: "id" | "en"; notification_settings?: NotificationSettingsValues }) => {
      setPrefsSaving(true);
      setPrefsSaved(false);
      try {
        const res = await fetch("/api/v1/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) setPrefsSaved(true);
      } finally {
        setPrefsSaving(false);
      }
    },
    [],
  );

  function changeTheme(next: ThemeKey) {
    setTheme(next); // langsung apply + cookie
    void savePreferences({ theme_key: next }); // persist ke DB
  }

  function toggleNotification(key: keyof NotificationSettingsValues) {
    const next = { ...notifications, [key]: !notifications[key] };
    setNotifications(next);
    void savePreferences({ notification_settings: next });
  }

  async function revokeSession(sessionId?: string, all = false) {
    const res = await fetch("/api/v1/security/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { all: true } : sessionId ? { session_id: sessionId } : {}),
    });
    if (!res.ok) return;
    if (all) {
      // Semua sesi (termasuk yang ini) mati — paksa ke halaman login.
      window.location.href = "/login";
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Tab nav */}
      <div className="flex flex-wrap gap-1 border-b border-line pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t.key ? "bg-surface-raised font-medium text-fg" : "text-fg-muted hover:bg-surface-raised/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== COMPANY ===== */}
      {tab === "company" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pengaturan Company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEditCompany ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="company-name">Nama company</Label>
                    <Input
                      id="company-name"
                      value={company.name}
                      onChange={(e) => setCompany({ ...company, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company-theme">Tema default (anggota baru)</Label>
                    <select
                      id="company-theme"
                      value={company.default_theme}
                      onChange={(e) => setCompany({ ...company, default_theme: e.target.value })}
                      className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg"
                    >
                      {THEMES.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company-tz">Zona waktu</Label>
                    <select
                      id="company-tz"
                      value={company.timezone}
                      onChange={(e) => setCompany({ ...company, timezone: e.target.value })}
                      className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2.5 border-t border-line pt-4">
                  {(
                    [
                      ["weekly_cost_report", "Laporan biaya mingguan", "Kirim ringkasan AI cost tiap Senin."],
                      ["require_approval_note", "Wajib catatan saat approval", "Keputusan approve/reject harus menyertakan catatan."],
                      ["allow_user_theme", "Izinkan anggota memilih tema sendiri", "Kalau mati, semua anggota memakai tema default company."],
                    ] as const
                  ).map(([key, title, desc]) => (
                    <label key={key} className="flex cursor-pointer items-start justify-between gap-4">
                      <span>
                        <span className="block text-sm text-fg">{title}</span>
                        <span className="block text-xs text-fg-faint">{desc}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={company[key]}
                        onChange={(e) => setCompany({ ...company, [key]: e.target.checked })}
                        className="mt-0.5 h-4 w-4"
                      />
                    </label>
                  ))}
                </div>

                <div className="flex items-center gap-3 border-t border-line pt-4">
                  <Button onClick={saveCompany} disabled={companySaving}>
                    {companySaving ? "Menyimpan…" : "Simpan pengaturan"}
                  </Button>
                  {companySaved ? <span className="text-sm text-fg-success">Tersimpan ✓</span> : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-fg-muted">
                Hanya owner/admin yang bisa mengubah pengaturan company. Kamu bisa lihat ringkasannya di panel kanan.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ===== PREFERENSI ===== */}
      {tab === "preferences" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tampilan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pref-theme">Tema</Label>
                  <select
                    id="pref-theme"
                    value={theme}
                    onChange={(e) => changeTheme(e.target.value as ThemeKey)}
                    className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg"
                  >
                    {THEMES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pref-locale">Bahasa</Label>
                  <select
                    id="pref-locale"
                    value={locale}
                    onChange={(e) => {
                      const next = e.target.value as "id" | "en";
                      setLocale(next);
                      void savePreferences({ locale: next });
                    }}
                    className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg"
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
              {prefsSaved ? <p className="text-sm text-fg-success">Tersimpan ✓</p> : null}
              {prefsSaving ? <p className="text-sm text-fg-faint">Menyimpan…</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notifikasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {(
                [
                  ["email_digest", "Digest email harian", "Ringkasan aktivitas agent & task tiap pagi."],
                  ["approval_email", "Email permintaan approval", "Email langsung saat agent butuh persetujuan."],
                  ["task_updates", "Pembaruan task", "Notifikasi saat task yang melibatkanmu berubah."],
                  ["mention_only", "Hanya mention", "Redam semua kecuali penyebutan nama kamu."],
                ] as const
              ).map(([key, title, desc]) => (
                <label key={key} className="flex cursor-pointer items-start justify-between gap-4">
                  <span>
                    <span className="block text-sm text-fg">{title}</span>
                    <span className="block text-xs text-fg-faint">{desc}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={notifications[key]}
                    onChange={() => toggleNotification(key)}
                    className="mt-0.5 h-4 w-4"
                  />
                </label>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ===== KEAMANAN ===== */}
      {tab === "security" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Sesi aktif</CardTitle>
              <Button variant="outline" size="sm" onClick={() => void revokeSession(undefined, true)}>
                Logout semua perangkat
              </Button>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-line">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-fg">{s.ip_address ?? "IP tidak diketahui"}</span>
                        {s.id === currentSessionId ? <Badge variant="success">Sesi ini</Badge> : null}
                      </div>
                      <p className="truncate text-xs text-fg-faint">{s.user_agent ?? "Perangkat tidak dikenal"}</p>
                      <p className="text-xs text-fg-faint">
                        Login {formatDate(s.created_at)} · terakhir {formatDate(s.last_seen_at)}
                      </p>
                    </div>
                    {s.id !== currentSessionId ? (
                      <Button variant="outline" size="sm" onClick={() => void revokeSession(s.id)}>
                        Cabut
                      </Button>
                    ) : null}
                  </li>
                ))}
                {sessions.length === 0 ? <li className="py-3 text-sm text-fg-faint">Tidak ada sesi aktif.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ===== INTEGRASI ===== */}
      {tab === "integrations" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integrasi</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {integrations.map((it) => (
                <li key={it.key} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fg">{it.name}</span>
                      {statusBadge(it.status)}
                    </div>
                    <p className="text-xs text-fg-muted">{it.description}</p>
                    {it.detail ? <p className="text-xs text-fg-faint">{it.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
