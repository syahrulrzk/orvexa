"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProviderRow = {
  id: string;
  kind: string;
  label: string;
  baseUrl: string | null;
  isEnabled: boolean;
  defaultModel: string | null;
  credentials: {
    id: string;
    label: string;
    last4: string | null;
    isEnabled: boolean;
    createdAt: Date;
  }[];
};

const KINDS = ["openai", "anthropic", "gemini", "openai_compatible", "local"] as const;

const KIND_HINT: Record<string, string> = {
  openai: "API key mulai dengan sk-...",
  anthropic: "API key dari Anthropic Console",
  gemini: "API key dari Google AI Studio",
  openai_compatible: "Endpoint kompatibel OpenAI (vLLM, OpenRouter, dsb)",
  local: "Ollama / llama.cpp — biasanya tanpa kunci",
};

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function ProviderManager({
  providers,
  masterKeyReady,
}: {
  providers: ProviderRow[];
  masterKeyReady: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  async function createProvider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/v1/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: String(form.get("kind") ?? "openai"),
        label: String(form.get("label") ?? ""),
        base_url: String(form.get("base_url") ?? "") || null,
        default_model: String(form.get("default_model") ?? "") || null,
        api_key: String(form.get("api_key") ?? "") || null,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal menambahkan provider.");
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function saveProvider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const apiKey = String(form.get("api_key") ?? "");
    const res = await fetch(`/api/v1/providers/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: String(form.get("label") ?? "") || undefined,
        base_url: String(form.get("base_url") ?? "") || null,
        default_model: String(form.get("default_model") ?? "") || null,
        ...(apiKey ? { api_key: apiKey } : {}),
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal menyimpan provider.");
      return;
    }
    setEditingId(null);
    setRotating(false);
    router.refresh();
  }

  async function toggleEnabled(provider: ProviderRow) {
    const res = await fetch(`/api/v1/providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !provider.isEnabled }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal mengubah status provider.");
      return;
    }
    router.refresh();
  }

  async function deleteProvider(providerId: string) {
    if (!confirm("Hapus provider ini? Kredensial tersimpan ikut dinonaktifkan.")) return;
    const res = await fetch(`/api/v1/providers/${providerId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal menghapus provider.");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-fg-faint">
          {providers.length} provider
          {!masterKeyReady && " · ORVEXA_MASTER_KEY belum diset: API key tidak bisa disimpan"}
        </p>
        {creating ? null : (
          <Button size="sm" onClick={() => setCreating(true)}>
            + Provider Baru
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {creating && (
        <form onSubmit={createProvider} className="space-y-4 rounded-lg border border-line bg-surface-raised p-5">
          <p className="text-overline uppercase text-fg-faint">Provider baru</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prov-kind">Jenis</Label>
              <select id="prov-kind" name="kind" className={inputCls} defaultValue="openai">
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <p className="text-xs text-fg-faint">{KIND_HINT.openai}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-label">Label</Label>
              <Input id="prov-label" name="label" required placeholder="OpenAI utama" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-base">Base URL (opsional)</Label>
              <Input id="prov-base" name="base_url" placeholder="https://api.openai.com/v1" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-model">Model default (opsional)</Label>
              <Input id="prov-model" name="default_model" placeholder="gpt-4o-mini" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prov-key">API key (disimpan terenkripsi AES-256-GCM)</Label>
            <Input id="prov-key" name="api_key" type="password" placeholder="sk-..." autoComplete="off" />
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Tambah Provider"}
            </Button>
          </div>
        </form>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {providers.map((provider) => (
          <Card key={provider.id} className={editingId === provider.id ? "border-brand" : undefined}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="truncate">{provider.label}</CardTitle>
                <Badge variant={provider.isEnabled ? "success" : "secondary"}>
                  {provider.isEnabled ? "enabled" : "disabled"}
                </Badge>
              </div>
              <p className="font-mono text-xs text-fg-muted">
                {provider.kind}
                {provider.defaultModel ? ` · ${provider.defaultModel}` : ""}
              </p>
            </CardHeader>
            <CardContent>
              {provider.baseUrl && (
                <p className="truncate font-mono text-xs text-fg-faint">{provider.baseUrl}</p>
              )}
              {provider.credentials.length > 0 ? (
                <div className="mt-1 space-y-0.5">
                  {provider.credentials.map((cred) => (
                    <p
                      key={cred.id}
                      className={`font-mono text-xs ${cred.isEnabled ? "text-fg-muted" : "text-fg-faint line-through"}`}
                    >
                      sk-••••{cred.last4 ?? "—"}
                      {cred.isEnabled ? "  · aktif" : "  · nonaktif"}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-fg-faint">Belum ada API key — memakai env / tanpa kunci.</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(editingId === provider.id ? null : provider.id);
                    setRotating(false);
                  }}
                >
                  {editingId === provider.id ? "Tutup" : "Konfigurasi"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleEnabled(provider)}>
                  {provider.isEnabled ? "Disable" : "Enable"}
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => deleteProvider(provider.id)}>
                  Hapus
                </Button>
              </div>

              {editingId === provider.id && (
                <form onSubmit={saveProvider} className="mt-3 space-y-4 border-t border-line pt-3">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`edit-label-${provider.id}`}>Label</Label>
                      <Input id={`edit-label-${provider.id}`} name="label" defaultValue={provider.label} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`edit-base-${provider.id}`}>Base URL</Label>
                      <Input id={`edit-base-${provider.id}`} name="base_url" defaultValue={provider.baseUrl ?? ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`edit-model-${provider.id}`}>Model default</Label>
                      <Input
                        id={`edit-model-${provider.id}`}
                        name="default_model"
                        defaultValue={provider.defaultModel ?? ""}
                        placeholder="gpt-4o-mini"
                      />
                    </div>
                    {rotating ? (
                      <div className="space-y-1.5">
                        <Label htmlFor={`edit-key-${provider.id}`}>API key baru</Label>
                        <Input
                          id={`edit-key-${provider.id}`}
                          name="api_key"
                          type="password"
                          placeholder="sk-..."
                          autoComplete="off"
                        />
                      </div>
                    ) : (
                      <div className="flex items-end">
                        <Button type="button" size="sm" variant="outline" onClick={() => setRotating(true)}>
                          Rotasi API key...
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 border-t border-line pt-3">
                    <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setRotating(false); }}>
                      Batal
                    </Button>
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? "Menyimpan..." : "Simpan"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
