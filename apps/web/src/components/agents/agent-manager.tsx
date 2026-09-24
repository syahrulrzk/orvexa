"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AgentOption = {
  id: string;
  name: string;
  displayName: string | null;
  role: string | null;
  status: string;
  isBuiltin: boolean;
  providerId: string | null;
  skillCount: number;
  toolCount: number;
};

export type ProviderOption = { id: string; kind: string; label: string };
export type SkillOption = { id: string; name: string };
export type ToolOption = { key: string; description: string; requiresApproval: boolean };

const STATUS_DOT: Record<string, string> = {
  idle: "bg-success",
  thinking: "bg-info",
  working: "bg-info",
  waiting_approval: "bg-warning",
  error: "bg-danger",
  disabled: "bg-neutral",
};

type AgentDetail = {
  agent: {
    id: string;
    name: string;
    displayName: string | null;
    role: string | null;
    description: string | null;
    objective: string | null;
    systemPrompt: string | null;
    status: string;
    isBuiltin: boolean;
    providerId: string | null;
    maxSteps: number;
    dailyCostLimit: string | null;
  };
  skills: { skillId: string; name: string }[];
  tools: { toolKey: string; isEnabled: boolean }[];
  permissions: { permission: string; effect: string }[];
};

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function Chip({
  active,
  onClick,
  children,
  title,
  mono,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        mono ? "font-mono" : "",
        active
          ? "border-brand bg-brand text-brand-fg"
          : "border-line bg-canvas text-fg-muted hover:border-line-strong hover:text-fg",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function AgentManager({
  agents,
  providers,
  skills,
  tools,
}: {
  agents: AgentOption[];
  providers: ProviderOption[];
  skills: SkillOption[];
  tools: ToolOption[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  // F5-01: efek permission per tool — "default" berarti ikut matrix.
  const [permissionEffects, setPermissionEffects] = useState<Record<string, string>>({});

  function toggle(list: string[], value: string, setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function loadDetail(agentId: string) {
    if (editingId === agentId && detail) {
      setEditingId(null);
      setDetail(null);
      return;
    }
    setEditingId(agentId);
    setLoadingDetail(true);
    setError(null);
    const res = await fetch(`/api/v1/agents/${agentId}`);
    setLoadingDetail(false);
    if (!res.ok) {
      setError("Gagal memuat detail agent.");
      return;
    }
    const body = (await res.json()) as { data: AgentDetail };
    setDetail(body.data);
    setSelectedSkills(body.data.skills.map((s) => s.skillId));
    setSelectedTools(body.data.tools.filter((t) => t.isEnabled).map((t) => t.toolKey));
    const effects: Record<string, string> = {};
    for (const p of body.data.permissions ?? []) effects[p.permission] = p.effect;
    setPermissionEffects(effects);
  }

  async function createAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        display_name: String(form.get("display_name") ?? "") || undefined,
        role: String(form.get("role") ?? "") || undefined,
        provider_id: String(form.get("provider") ?? "") || null,
        skill_ids: selectedSkills,
        tool_keys: selectedTools,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal membuat agent.");
      return;
    }
    setCreating(false);
    setSelectedSkills([]);
    setSelectedTools([]);
    router.refresh();
  }

  async function saveAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch(`/api/v1/agents/${detail.agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: String(form.get("display_name") ?? "") || null,
        role: String(form.get("role") ?? "") || null,
        description: String(form.get("description") ?? "") || null,
        system_prompt: String(form.get("system_prompt") ?? "") || null,
        provider_id: String(form.get("provider") ?? "") || null,
        max_steps: Number(form.get("max_steps") ?? 8) || 8,
        daily_cost_limit: String(form.get("daily_cost_limit") ?? "") || null,
        status: String(form.get("status") ?? "idle"),
        skill_ids: selectedSkills,
        tool_keys: selectedTools,
        permission_overrides: Object.entries(permissionEffects)
          .filter(([, effect]) => effect !== "default")
          .map(([tool_key, effect]) => ({ tool_key, effect })),
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal menyimpan agent.");
      return;
    }
    setEditingId(null);
    setDetail(null);
    setPermissionEffects({});
    router.refresh();
  }

  async function deleteAgent(agentId: string) {
    if (!confirm("Hapus agent ini?")) return;
    const res = await fetch(`/api/v1/agents/${agentId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal menghapus agent.");
      return;
    }
    if (editingId === agentId) {
      setEditingId(null);
      setDetail(null);
    }
    router.refresh();
  }

  const skillPicker = (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <Chip key={s.id} active={selectedSkills.includes(s.id)} onClick={() => toggle(selectedSkills, s.id, setSelectedSkills)}>
          {s.name}
        </Chip>
      ))}
    </div>
  );

  const toolPicker = (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((t) => (
        <Chip
          key={t.key}
          mono
          active={selectedTools.includes(t.key)}
          title={t.description + (t.requiresApproval ? " (butuh approval)" : "")}
          onClick={() => toggle(selectedTools, t.key, setSelectedTools)}
        >
          {t.key}
          {t.requiresApproval ? " ⚑" : ""}
        </Chip>
      ))}
    </div>
  );

  const providerSelect = (id: string, name: string, defaultValue: string | null) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Provider</Label>
      <select id={id} name="provider" className={inputCls} defaultValue={defaultValue ?? ""}>
        <option value="">— ikut kredensial company / env —</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} ({p.kind})
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-fg-faint">
          {agents.length} agent · {agents.filter((a) => a.status !== "disabled").length} aktif
        </p>
        {creating ? null : (
          <Button size="sm" onClick={() => setCreating(true)}>
            + Agent Baru
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {creating && (
        <form onSubmit={createAgent} className="space-y-4 rounded-lg border border-line bg-surface-raised p-5">
          <p className="text-overline uppercase text-fg-faint">Agent baru</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agent-name">Nama unik (slug)</Label>
              <Input id="agent-name" name="name" required placeholder="network-agent" />
              <p className="text-xs text-fg-faint">Dipakai untuk mention @nama di room.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-display">Nama tampilan</Label>
              <Input id="agent-display" name="display_name" placeholder="Network Agent" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-role">Role</Label>
              <Input id="agent-role" name="role" placeholder="Network Engineer" />
            </div>
            {providerSelect("agent-provider", "provider", null)}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Skills</Label>
              {skillPicker}
            </div>
            <div className="space-y-1.5">
              <Label>Tools</Label>
              {toolPicker}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Buat Agent"}
            </Button>
          </div>
        </form>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {agents.map((agent) => (
          <Card key={agent.id} className={editingId === agent.id ? "border-brand" : undefined}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[agent.status] ?? "bg-neutral"}`} aria-hidden />
                  <CardTitle className="truncate">{agent.displayName ?? agent.name}</CardTitle>
                  {agent.isBuiltin && (
                    <Badge variant="outline" className="shrink-0">
                      builtin
                    </Badge>
                  )}
                </div>
                <span className="shrink-0 font-mono text-xs text-fg-faint">@{agent.name}</span>
              </div>
              {agent.role && <p className="text-xs text-fg-muted">{agent.role}</p>}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                <span>{agent.skillCount} skill</span>
                <span>{agent.toolCount} tool</span>
                <span className={agent.providerId ? "text-success" : "text-fg-faint"}>
                  {agent.providerId ? "provider tersambung" : "provider default (env)"}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => loadDetail(agent.id)}>
                  {editingId === agent.id ? "Tutup" : "Konfigurasi"}
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => deleteAgent(agent.id)}>
                  Hapus
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editingId && loadingDetail && <p className="text-sm text-fg-muted">Memuat konfigurasi...</p>}

      {editingId && detail && !loadingDetail && (
        <form onSubmit={saveAgent} className="space-y-4 rounded-lg border border-brand bg-surface-raised p-5">
          <p className="text-overline uppercase text-fg-faint">
            Konfigurasi — {detail.agent.displayName ?? detail.agent.name}
          </p>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-display">Nama tampilan</Label>
              <Input id="edit-display" name="display_name" defaultValue={detail.agent.displayName ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <Input id="edit-role" name="role" defaultValue={detail.agent.role ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Deskripsi</Label>
              <Input id="edit-desc" name="description" defaultValue={detail.agent.description ?? ""} />
            </div>
            {providerSelect("edit-provider", "provider", detail.agent.providerId)}
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-status">Status</Label>
              <select id="edit-status" name="status" className={inputCls} defaultValue={detail.agent.status}>
                {["idle", "disabled", "error"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-steps">Max steps</Label>
              <Input id="edit-steps" name="max_steps" type="number" min={1} max={64} defaultValue={detail.agent.maxSteps} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-cost">Limit biaya harian (USD)</Label>
              <Input
                id="edit-cost"
                name="daily_cost_limit"
                type="number"
                step="0.01"
                min={0}
                defaultValue={detail.agent.dailyCostLimit ?? ""}
              />
            </div>
          </section>

          <section className="space-y-1.5">
            <Label htmlFor="edit-prompt">System prompt</Label>
            <textarea
              id="edit-prompt"
              name="system_prompt"
              rows={5}
              defaultValue={detail.agent.systemPrompt ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Skills ({selectedSkills.length} dipilih)</Label>
              {skillPicker}
            </div>
            <div className="space-y-1.5">
              <Label>Tools ({selectedTools.length} dipilih)</Label>
              {toolPicker}
              <p className="text-xs text-fg-faint">⚑ = eksekusi butuh approval manusia.</p>
            </div>
          </section>

          <section className="space-y-1.5">
            <Label>Permission matrix (F5-01)</Label>
            <p className="text-xs text-fg-faint">
              &quot;Default&quot; mengikuti matrix company: tool sensitif (⚑) wajib approval, tool biasa allow.
              Override di sini menang atas default; kondisi yang gagal jatuh ke approval (fail-closed).
            </p>
            <div className="divide-y divide-line rounded-md border border-line">
              {tools.map((t) => {
                const selected = selectedTools.includes(t.key);
                const current = permissionEffects[t.key] ?? "default";
                return (
                  <div
                    key={t.key}
                    className={`flex items-center justify-between gap-3 px-3 py-2 ${selected ? "" : "opacity-50"}`}
                  >
                    <span className="min-w-0 font-mono text-xs text-fg" title={t.description}>
                      {t.key}
                      {t.requiresApproval ? " ⚑" : ""}
                    </span>
                    <select
                      aria-label={`Efek permission untuk ${t.key}`}
                      className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs"
                      value={current}
                      onChange={(e) =>
                        setPermissionEffects((prev) => ({ ...prev, [t.key]: e.target.value }))
                      }
                    >
                      <option value="default">Default matrix</option>
                      <option value="allow">Selalu izinkan</option>
                      <option value="approval_required">Wajib approval</option>
                      <option value="disabled">Nonaktif</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setDetail(null); }}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
