# ORVEXA — Design Document

**Produk:** Orvexa — AI Workforce Platform
**Gaya Visual:** Corporate Gray Enterprise SaaS
**Versi:** 1.0
**Dokumen terkait:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [SECURITY.md](./SECURITY.md) · [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

---

## 1. Prinsip Desain

Orvexa harus terasa seperti **tool enterprise yang serius**, bukan chatbot konsumer. Panel-panel seperti Slack + Jira + Grafana, tetapi dengan identitas gray/charcoal yang tenang.

1. **Calm & Professional** — netral, tidak ramai warna, fokus ke konten.
2. **Dense but Breathable** — informasi padat (enterprise) tapi spacing rapi.
3. **Hierarchy over Decoration** — bedakan level lewat tipografi & kontras, bukan warna norak.
4. **Status is Color** — warna dipakai hemat hanya untuk status/alert/agent state.
5. **Predictable** — layout konsisten di semua halaman.
6. **Accessible** — kontras AA, keyboard navigable, fokus terlihat.
7. **Dark-first friendly** — tema gelap setara kualitasnya dengan terang.

**Hindari:** gradient neon, warna pastel berlebihan, emoji besar, animasi berlebihan, gaya "AI consumer".

---

## 2. Design Tokens

Semua token didefinisikan sebagai **CSS variables** dan di-override per theme. Format: `--orv-{kategori}-{nama}`.

### 2.1 Palet Warna Inti — Corporate Gray

```text
Neutral (gray scale)
--orv-gray-0    #FFFFFF
--orv-gray-50   #F8F9FA
--orv-gray-100  #F1F3F5
--orv-gray-200  #E9ECEF
--orv-gray-300  #DEE2E6
--orv-gray-400  #CED4DA
--orv-gray-500  #ADB5BD
--orv-gray-600  #868E96
--orv-gray-700  #495057
--orv-gray-800  #343A40
--orv-gray-900  #212529
--orv-gray-950  #16191C

Charcoal (brand dark)
--orv-charcoal-700 #2B2F33
--orv-charcoal-800 #202428
--orv-charcoal-900 #17191C
```

### 2.2 Semantic Tokens (theme-aware)

```text
--orv-bg           surface utama halaman
--orv-bg-subtle    latar section
--orv-surface      kartu/panel
--orv-surface-raised  elemen mengambang (popover, dialog)
--orv-border       garis pemisah
--orv-border-strong garis tegas
--orv-text         teks utama
--orv-text-muted   teks sekunder
--orv-text-faint   teks tersier/placeholder
--orv-primary      aksi utama
--orv-primary-hover
--orv-primary-fg   teks di atas primary
--orv-focus-ring   warna fokus keyboard
```

### 2.3 Warna Status / Aksi

```text
--orv-success   #2F9E44   (hijau redup, tidak neon)
--orv-warning   #F08C00   (oranye amber)
--orv-danger    #C92A2A   (merah tua)
--orv-info      #1C7ED6   (biru tenang)
--orv-neutral   #868E96
```

> Warna status dipakai **hanya** untuk status/alert, bukan dekorasi.

### 2.4 Agent Status Colors (PRD §36)

| Status | Emoji | Warna token |
|---|---|---|
| Idle | 🟢 | `--orv-success` |
| Thinking | 🔵 | `--orv-info` |
| Working | 🟡 | `--orv-warning` |
| Waiting Approval | 🟠 | `--orv-warning` (lebih gelap) |
| Error | 🔴 | `--orv-danger` |
| Disabled | ⚫ | `--orv-neutral` |

### 2.5 Spacing (skala 4px)

```text
--orv-space-1  4px
--orv-space-2  8px
--orv-space-3  12px
--orv-space-4  16px
--orv-space-5  20px
--orv-space-6  24px
--orv-space-8  32px
--orv-space-10 40px
--orv-space-12 48px
```

### 2.6 Radius & Shadow

```text
--orv-radius-sm  4px
--orv-radius-md  6px
--orv-radius-lg  8px
--orv-radius-xl  12px

--orv-shadow-sm  0 1px 2px rgba(16,20,24,.06)
--orv-shadow-md  0 2px 8px rgba(16,20,24,.08)
--orv-shadow-lg  0 8px 24px rgba(16,20,24,.12)
```

> Shadow **minimal** sesuai arahan PRD. Lebih sering pakai border tipis daripada shadow.

### 2.7 Typography

```text
Font UI:      Inter (fallback: system-ui, -apple-system, Segoe UI)
Font mono:    JetBrains Mono / ui-monospace (untuk log, kode, run detail)

--orv-font-ui
--orv-font-mono

Skala:
display   28px / 600 / 1.2
h1        22px / 600 / 1.25
h2        18px / 600 / 1.3
h3        16px / 600 / 1.4
body      14px / 400 / 1.5
body-sm   13px / 400 / 1.5
caption   12px / 500 / 1.4
overline  11px / 600 / letter-spacing .04em
```

> Base **14px** (bukan 16px) untuk kepadatan enterprise. Konten panjang (dokumen) boleh pakai 15–16px.

### 2.8 Layout Metrics

```text
Sidebar nav width     240px (collapsible → 64px)
Context panel width   320px (collapsible)
Topbar height         56px
Content max width     fluid (full-width, enterprise)
```

---

## 3. Tema (Theme System)

Theme = set nilai untuk token semantic. Preferensi disimpan per user (`user_preferences.theme_id`).

### 3.1 Tema bawaan

```text
1. Corporate Gray   → default. Surface abu terang, aksen charcoal/biru tenang.
2. Light            → putih bersih, kontras tinggi.
3. Dark             → charcoal gelap, teks terang.
4. Midnight         → biru-hitam pekat, aksen biru redup.
5. High Contrast    → untuk aksesibilitas, border tegas, kontras maksimum.
```

### 3.2 Contoh token

**Corporate Gray (default)**

```css
:root {
  --orv-bg:            #F8F9FA;
  --orv-bg-subtle:     #F1F3F5;
  --orv-surface:       #FFFFFF;
  --orv-surface-raised:#FFFFFF;
  --orv-border:        #DEE2E6;
  --orv-border-strong: #CED4DA;
  --orv-text:          #212529;
  --orv-text-muted:    #495057;
  --orv-text-faint:    #868E96;
  --orv-primary:       #343A40;
  --orv-primary-hover: #212529;
  --orv-primary-fg:    #FFFFFF;
  --orv-focus-ring:    #1C7ED6;
}
```

**Dark**

```css
[data-theme="dark"] {
  --orv-bg:            #17191C;
  --orv-bg-subtle:     #202428;
  --orv-surface:       #202428;
  --orv-surface-raised:#2B2F33;
  --orv-border:        #2B2F33;
  --orv-border-strong: #3A4047;
  --orv-text:          #F1F3F5;
  --orv-text-muted:    #ADB5BD;
  --orv-text-faint:    #868E96;
  --orv-primary:       #E9ECEF;
  --orv-primary-hover: #FFFFFF;
  --orv-primary-fg:    #17191C;
  --orv-focus-ring:    #4DABF7;
}
```

### 3.3 Implementasi

- Class `data-theme="..."` di `<html>`.
- Tailwind di-mapping ke token via config (mis. `bg-surface`, `text-muted`).
- Tidak ada hardcoded hex di komponen — selalu token.
- Tema custom (brand) = roadmap (PRD §29).

---

## 4. Layout Aplikasi

Mengikuti PRD §30.

```text
┌──────────────────────────────────────────────────────────────┐
│ ORVEXA                          ⌘K    🔔   👤 User ▼         │  Topbar 56px
├─────────────┬────────────────────────────────┬───────────────┤
│ Navigation  │        Collaboration Room       │ Context Panel │
│ 240px       │            flexible             │ 320px         │
│             │                                 │               │
│ WORKSPACE   │  #incident-server-001           │ Agent Team    │
│ • Dashboard │  ─────────────────────────────  │ • Infra Mgr   │
│ • Rooms     │  messages...                    │ • SysAdmin    │
│ • Projects  │                                 │ • Network     │
│ • Tasks     │                                 │ • Security    │
│ • Approvals │                                 │ • NOC         │
│ AI WORKFORCE│                                 │ ──────────    │
│ • Teams     │  ─────────────────────────────  │ Task Status   │
│ • Agents    │  [ Message...              📎 ] │ [Send]        │
│ • Skills    │                                 │               │
│ • Knowledge │                                 │               │
│ • Activity  │                                 │               │
│ COMPANY ... │                                 │               │
│ SYSTEM ...  │                                 │               │
└─────────────┴────────────────────────────────┴───────────────┘
```

### 4.1 Aturan responsif

| Breakpoint | Perilaku |
|---|---|
| ≥ 1280px | 3 kolom penuh |
| 1024–1279px | Context panel collapsible |
| 768–1023px | Sidebar collapse ke ikon; context panel jadi drawer |
| < 768px | Sidebar jadi drawer; context panel = tab; satu kolom |

---

## 5. Komponen

shadcn/ui sebagai basis, di-restyle ke token Orvexa.

### 5.1 Inventaris komponen

```text
Primitives     Button, Input, Textarea, Select, Checkbox, Radio, Switch,
               Slider, Combobox, DatePicker
Layout         AppShell, Sidebar, Topbar, ContextPanel, Tabs, Accordion,
               ResizablePanel, Card, Separator
Feedback       Toast, Alert, Badge, Progress, Spinner, Skeleton, EmptyState
Overlay        Dialog, Sheet/Drawer, Popover, Tooltip, DropdownMenu, CommandPalette
Data           Table, DataGrid, Pagination, FilterBar, StatCard
Domain         MessageBubble, MessageComposer, AgentAvatar, AgentStatusPill,
               RunTimeline, ApprovalCard, TaskCard, TaskBoard, DecisionCard,
               DocumentViewer, KnowledgeTree, ActivityFeed, ThemeSwitcher,
               ProviderCard, CredentialRow, PermissionMatrix
```

### 5.2 Spesifikasi komponen kunci

**Button** — varian `default | secondary | outline | ghost | danger`; size `sm | md | lg`; height 32/36/40px; radius `--orv-radius-md`.

**Card** — `bg-surface`, border `--orv-border`, radius `--orv-radius-lg`, shadow tipis/hilang, padding `--orv-space-4/6`.

**Badge/Status pill** — teks `overline`, radius pill, warna latar transparan + teks berwarna status.

**MessageBubble**

```text
Human : avatar kiri, nama + waktu, bubble surface, rata kiri
Agent : avatar kiri dengan ring warna status, nama + role, bubble surface,
        tampilkan "thinking" saat streaming, tool calls sebagai chip kecil
System: teks tengah, muted, italic
Alert : border kiri warna danger/warning
```

**AgentStatusPill** — dot warna status + teks status + tooltip "since ...".

**ApprovalCard**

```text
┌─────────────────────────────────────────────┐
│ ⚠ Approval Required   [Medium risk]          │
│ Production firewall change                   │
│ Change : Allow TCP 443 from approved source  │
│ Rollback : Available                         │
│ Requested by: Infra Manager · 09:21          │
│ [ Reject ]                        [ Approve ]│
└─────────────────────────────────────────────┘
```

**RunTimeline** — daftar step run (thinking → tool call → result), mono font untuk detail, bisa expand.

**ThemeSwitcher** — dropdown 5 tema dengan preview swatch.

### 5.3 State standar

Setiap komponen data harus punya: `loading` (skeleton), `empty` (EmptyState), `error` (Alert + retry), `success`.

---

## 6. Pola Interaksi

| Interaksi | Pola |
|---|---|
| Kirim pesan | Enter kirim, Shift+Enter baris baru |
| Mention agent | `@` → command palette agent |
| Slash command | `/` → aksi (task, doc, decision) |
| Command palette | `⌘K` / `Ctrl+K` |
| Navigasi cepat | `g` lalu `d` (dashboard), dst |
| Streaming agent | bubble muncul + dot "thinking" + token mengalir |
| Approval | drawer/dialog dengan detail + tombol jelas |
| Konfirmasi destruktif | dialog ketik nama resource |

### 6.1 Feedback

- Aksi < 400ms: tanpa spinner (optimistic).
- Aksi > 400ms: skeleton/inline spinner.
- Sukses/gagal: toast ringan.
- Error: pesan actionable, bukan "Something went wrong".

---

## 7. Konten & Bahasa

- Bahasa UI: **Inggris** (default OSS), siap i18n.
- Nada: ringkas, profesional, langsung. Hindari bahasa terlalu santai di UI.
- Istilah konsisten: Room, Agent, Team, Task, Approval, Decision, Knowledge, Run.
- **Waktu tampil dalam WIB (Asia/Jakarta).** Semua timestamp diformat via `Intl` dengan `timeZone: 'Asia/Jakarta'` (lihat [ARCHITECTURE.md](./ARCHITECTURE.md) §10.4). Contoh: `22 Sep 2026, 16.05`. Tooltip boleh menampilkan zona (`WIB`).

---

## 8. Aksesibilitas

```text
[ ] Kontras teks ≥ 4.5:1 (body), ≥ 3:1 (large)
[ ] Focus ring terlihat di semua elemen interaktif (--orv-focus-ring)
[ ] Semua aksi bisa via keyboard
[ ] ARIA roles untuk menu, dialog, tab, live region untuk streaming
[ ] Tidak mengandalkan warna saja untuk status (selalu + ikon/teks)
[ ] Hormati prefers-reduced-motion
[ ] Target sentuh ≥ 32px
[ ] Tema High Contrast tersedia
```

### 8.1 Live region untuk streaming

Pesan agent yang sedang streaming diumumkan lewat `aria-live="polite"` (di-throttle) supaya screen reader tidak spam.

---

## 9. Iconografi

- Library: **Lucide** (konsisten dengan shadcn).
- Ukuran: 16px (inline), 20px (nav), 24px (empty state).
- Stroke 1.5–2px, warna mengikuti `currentColor`.
- Agent & department boleh punya glyph/emoji sesuai PRD, dipakai hemat.

---

## 10. Motion

- Durasi: 120–200ms, easing `ease-out`.
- Animasi: fade/scale halus untuk overlay, slide untuk drawer.
- Tidak ada animasi dekoratif di area data (tabel, log, grafik).
- Hormati `prefers-reduced-motion`.

---

## 11. Halaman Kunci (Wireframe Ringkas)

### Dashboard

```text
[ StatCard: Projects ] [ Agents ] [ Running Tasks ] [ Pending Approvals ] [ Alerts ]
────────────────────────────────────────────────
AI Activity (feed realtime)         Needs Attention (list)
09:12 Infra Manager started…        ⚠ Approval: firewall change
09:14 NOC detected anomaly…         🔴 Incident: server-001
09:15 Network investigating…        ⚠ Task failed: backup
```

### Agents (list + detail)

```text
List: kartu per agent (avatar, nama, role, status, provider/model, skills count)
Detail tabs: Overview | Skills | Knowledge | Tools | Permissions | Runs
```

### Approvals

```text
Filter: status, risk, agent, project
List: ApprovalCard per item; detail drawer untuk review & decide
```

### Knowledge

```text
Tree folder (kiri) + document list/detail (kanan)
Upload modal: source type, KB tujuan, scope + ACL
Status indexing terlihat (pending/indexing/ready/failed)
```

---

## 12. Checklist Implementasi Design

```text
[ ] Semua warna via token, tidak ada hex hardcoded
[ ] 5 tema berfungsi & tersimpan per user
[ ] Layout 3 kolom responsif sesuai breakpoint
[ ] Komponen domain (Message, Approval, Task, Run) selesai
[ ] State loading/empty/error untuk tiap layar data
[ ] Kontras AA & focus ring
[ ] Command palette + shortcut
[ ] Streaming agent terasa mulus (throttle ~50ms)
[ ] Reduced motion dihormati
```
