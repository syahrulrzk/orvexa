# ORVEXA — Security Document

**Produk:** Orvexa — AI Workforce Platform
**Versi:** 1.0
**Klasifikasi:** Internal / Public (open-source)
**Dokumen terkait:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) · [DESIGN.md](./DESIGN.md)

---

## 1. Prinsip Keamanan

Orvexa menjalankan **agent otonom** yang bisa mengakses sistem nyata (server, network, firewall). Karena itu keamanan bukan fitur tambahan — ini fondasi. Prinsipnya:

1. **Human in Control** — aksi berdampak tinggi butuh persetujuan manusia.
2. **Least Privilege** — agent hanya dapat akses yang eksplisit diberikan.
3. **Deny by Default** — kalau tidak diizinkan, artinya tidak boleh.
4. **Defense in Depth** — validasi di UI, BFF, dan runtime.
5. **Secrets Never Touch the Client** — API key provider dan kredensial integrasi tidak pernah sampai browser.
6. **Everything Auditable** — aksi penting tercatat dengan aktor, target, dan waktu.
7. **Secure by Default untuk self-host** — instalasi default tidak boleh insecure.

---

## 2. Model Ancaman (Threat Model)

### 2.1 Aset yang dilindungi

| Aset | Dampak jika bocor |
|---|---|
| API key provider LLM | Penyalahgunaan biaya, pencurian token |
| Kredensial MCP/integrasi (SSH, firewall, DB) | Kompromi infrastruktur nyata |
| Data room/message & dokumen | Kebocoran informasi perusahaan |
| Knowledge base & embedding | Kebocoran SOP/policy |
| Sesi user | Impersonasi |
| Audit log | Kehilangan kemampuan forensik |

### 2.2 Aktor ancaman

- **Attacker eksternal** — menyerang endpoint publik.
- **Insider dengan role rendah** — mencoba eskalasi privilege.
- **Agent jahat / prompt injection** — agent yang diprovokasi untuk keluar dari batasnya.
- **Integrasi pihak ketiga** — webhook/API yang dipalsukan.

### 2.3 Skenario & mitigasi

| Skenario | Mitigasi |
|---|---|
| Prompt injection lewat konten knowledge yang di-upload | Treat retrieved content sebagai data, bukan instruksi; filter output; batasi tool |
| Agent dipaksa panggil tool sensitif | Approval gate + permission effect `approval_required`/`disabled` |
| Token LLM dicuri dari browser | Kredensial hanya di server; worker memakai langsung |
| Webhook dipalsukan | HMAC signature verification + replay protection |
| SQL injection | Prepared statement/ORM + RLS |
| Cross-tenant data leak | `company_id` scope + RLS di DB |
| Credential bocor di log | Redaksi otomatis secret di logger |
| SSRF lewat tool URL fetch | Allowlist domain, blokir IP privat |

---

## 3. Autentikasi

### 3.1 Mekanisme

- **Auth.js (NextAuth v5)** sebagai penyedia sesi.
- Metode: **email + password** (wajib) dan **OAuth (Google/GitHub)** otomatis aktif bila env diisi.
- **Sesi revocable:** cookie JWT `httpOnly; SameSite=Lax` (12 jam) **+ row di tabel `sessions`**. JWT menyimpan `sid`, dan setiap request divalidasi ke database (ada, belum direvokasi, belum kedaluwarsa). Logout & "force logout semua device" merevokasi row tersebut.
- Password: **Argon2id** (`@node-rs/argon2`), dengan fallback verifikasi **scrypt** untuk hash lama.

### 3.2 Persyaratan

```text
- Password minimal 12 karakter, dicek terhadap daftar password bocor (opsional HIBP)
- Rate limit login: 5 percobaan / 15 menit / IP+email
- Lockout progresif + CAPTCHA setelah threshold
- MFA (TOTP) — disarankan untuk role owner/admin (roadmap cepat)
- Session idle timeout 12 jam, absolute 30 hari
- Rotasi session token saat privilege berubah
```

### 3.3 Alur login

```text
User → /login
  ↓
Rate limit check (Redis)
  ↓
Verify Argon2id hash
  ↓
Buat session (DB) + set cookie httpOnly
  ↓
Redirect ke dashboard dengan company aktif
```

---

## 4. Otorisasi

Otorisasi berlapis: **Company Role (RBAC) → Agent Permission (ABAC) → Approval Gate**.

### 4.1 Peran tingkat company

```text
owner    → akses penuh, termasuk billing, hapus company
admin    → kelola user, agent, provider, credential, settings
manager  → kelola project, team, task, room
member   → kerja di room/project yang diizinkan
viewer   → read-only
```

### 4.2 Permission key (contoh)

```text
room.read          room.write
task.create        task.assign        task.delete
knowledge.read     knowledge.write    knowledge.delete
document.create    document.approve
agent.create       agent.configure    agent.delete
provider.configure credential.manage
approval.decide
server.read        server.restart
firewall.read      firewall.modify
database.read      database.write
production.deploy
member.invite      settings.manage
```

### 4.3 Efek permission (default aman)

```text
Operasi baca normal       → allow
Operasi sensitif          → approval_required (DEFAULT)
Operasi destruktif        → disabled (DEFAULT)
```

Contoh default:

```text
server.read          = allow
server.restart       = approval_required
firewall.read        = allow
firewall.modify      = approval_required
database.read        = allow
database.write       = approval_required
database.drop        = disabled
production.deploy    = approval_required
data.delete          = disabled
```

### 4.4 Enforcement berlapis

1. **UI** — sembunyikan/nonaktifkan aksi yang tidak diizinkan.
2. **BFF (Next.js)** — cek ulang permission sebelum meneruskan request.
3. **DB (RLS)** — isolasi tenant otomatis.
4. **Runtime (Python)** — guardrail terakhir sebelum tool/integrasi dipanggil.

> Validasi di UI **tidak pernah** cukup. BFF + runtime wajib mengecek kembali.

---

## 5. Manajemen Kredensial (Secrets)

Ini bagian paling kritis. Prinsip: **kredensial disimpan terenkripsi, hanya bisa dipakai server-side, dan tidak pernah kembali ke client.**

### 5.1 Penyimpanan

- **Enkripsi at rest: AES-256-GCM** (authenticated encryption).
- Format: `iv` (12 byte) + ciphertext + auth tag, disimpan base64.
- **Envelope encryption**: master key (`ORVEXA_MASTER_KEY`) tidak dipakai langsung ke semua secret besar; idealnya master key mengenkripsi Data Encryption Key (DEK), dan DEK mengenkripsi secret. Untuk MVP, single master key + `key_version` sudah cukup, dengan jalur rotasi disiapkan.

```text
Env (rahasia, di luar repo):
  ORVEXA_MASTER_KEY=<32-byte base64>

Tabel ai_credentials:
  secret_cipher, secret_iv, key_version
```

### 5.2 Aturan

```text
- API key TIDAK pernah dikirim ke browser (tidak di SSR props, tidak di API response).
- API hanya mengembalikan metadata: label, last4, status, last_used_at.
- Masking: tampilkan "sk-...ABCD" (4 karakter terakhir saja).
- Kredensial hanya didekripsi di memori proses saat dipakai (Python worker / BFF).
- Tidak pernah ditulis ke log. Logger punya filter redaksi pola secret.
- Rotasi master key didukung lewat key_version (re-encrypt bertahap).
- Enable/disable credential tanpa menghapus.
- Audit setiap penggunaan & perubahan kredensial.
```

### 5.3 Alur penggunaan kredensial

```text
Agent butuh panggil LLM
  ↓
Python worker: SELECT secret_cipher FROM ai_credentials WHERE id=...
  ↓
Decrypt di memori (AES-256-GCM, master key dari env)
  ↓
Pakai untuk panggilan provider
  ↓
Buang dari memori (tidak disimpan di state/log)
  ↓
Catat ai_usage (token/cost) + activity_log (credential.used)
```

### 5.4 Rotasi & siklus hidup

| Aksi | Siapa | Audit |
|---|---|---|
| Tambah credential | admin/owner | ya |
| Edit/rotasi secret | admin/owner | ya (tanpa mencatat nilai) |
| Disable | admin/owner | ya |
| Hapus (soft delete) | owner | ya |
| Rotasi master key | operator | ya |

---

## 6. Isolasi Agent

Agent **bukan** user — mereka subjek yang dibatasi. Setiap agent hanya boleh:

```text
✓ room yang di-assign (room_members dengan agent_id)
✓ project yang di-assign (project_members)
✓ knowledge base dengan ACL yang mengizinkan
✓ tool internal yang ada di agent_tools (is_enabled)
✓ MCP server & tool yang ada di agent_mcp_access + allowlist
✗ akses ke room/agent/company lain
✗ akses data agent lain kecuali lewat mekanisme delegasi eksplisit
```

### 6.1 Delegasi antar agent

- Hanya boleh ke agent yang ada di **allowed agents** (relasi permintaan delegasi).
- Delegasi terekam (`agent_runs.parent_run_id`) → traceable.
- Tidak ada "agent super" yang bisa bypass permission kecuali diberi eksplisit.

### 6.2 Guardrails runtime (Python)

```text
1. Cek permission key sebelum eksekusi tool.
2. Cek budget (max_steps, token, cost harian).
3. Cek apakah tool butuh approval → jika ya, buat approval & STOP.
4. Validasi input tool terhadap schema.
5. Timeout per tool call.
6. Validasi output; jangan teruskan instruksi mencurigakan dari retrieved content.
```

### 6.3 Prompt injection defense

- Konten dari knowledge/dokumen/tool **selalu** dianggap data, dipisah jelas dari instruksi.
- Gunakan penanda eksplisit untuk blok retrieved content.
- Tool yang menarik URL tidak boleh mengakses IP privat/metadata cloud (SSRF guard).
- Output agent difilter untuk kebocoran secret sebelum dikirim ke room.

---

## 7. Approval Workflow (Control Gate)

### 7.1 Kapan dibutuhkan

Semua aksi dengan effect `approval_required`, sesuai PRD §25:

```text
Production deployment
Firewall/network changes
Server restart
Database modification
External communication
Financial commitment
Data deletion
Security policy changes
```

### 7.2 Lifecycle

```text
Agent request → approvals(status=pending) → run=waiting_approval
   ↓
Notifikasi ke approver (role ≥ manager)
   ↓
Human: Approve / Reject (+ note)
   ↓
UPDATE approval + INSERT decision + activity_log
   ↓
PUBLISH approval.resolved → worker resume job (dari checkpoint)
```

### 7.3 Prinsip

- Approval **expire** setelah waktu tertentu (`expires_at`) → otomatis `expired`.
- Aksi **destruktif** (`disabled`) tidak bisa di-approve — harus ubah permission dulu (jejak audit).
- Setiap keputusan approval menghasilkan record `decisions` permanen.
- Approver tidak boleh sama dengan requester jika requester adalah human (separation of duties); untuk agent requester selalu manusia yang memutuskan.

---

## 8. Audit & Logging

### 8.1 Yang wajib dicatat

```text
Login / logout / login gagal
Perubahan role & keanggotaan
CRUD agent, team, provider, credential, permission
Setiap penggunaan credential
Setiap tool call (internal & MCP)
Setiap request approval & keputusan
Setiap delegasi antar agent
Setiap eksekusi agent (run + status)
Perubahan pengaturan company & theme
Akses knowledge (read) untuk data sensitif (opsional, configurable)
```

### 8.2 Struktur log

- Semua ke `activity_logs` dengan: aktor (human/agent/system), action, target, `trace_id`, IP, user-agent.
- **Redaksi**: logger membersihkan field bernama `*secret*`, `*token*`, `*key*`, `*password*`.
- Log **append-only** (tidak ada UPDATE/DELETE dari role aplikasi).
- Retensi audit ≥ 1 tahun.

### 8.3 Traceability

Satu `trace_id` mengalir: Next.js → Redis → Python worker → tool call → hasil. Ini memudahkan investigasi insiden ("siapa yang mengubah firewall jam 02:14?").

---

## 9. Keamanan Web & API

| Area | Kontrol |
|---|---|
| Transport | HTTPS wajib, HSTS, TLS 1.2+ |
| CSRF | Token / SameSite cookie untuk mutasi |
| CORS | Allowlist origin eksplisit |
| Rate limiting | Per IP, per user, per credential (Redis token bucket) |
| Input validation | Schema validation (Zod di TS, Pydantic di Python) |
| Output encoding | Escape HTML; sanitasi markdown |
| Headers | CSP ketat, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Upload | Batas ukuran, allowlist MIME, scan malware (opsional ClamAV), simpan di luar webroot |
| Webhook | HMAC signature + timestamp (anti-replay) |
| API error | Jangan bocorkan stack trace/detail internal ke client |

### 9.1 CSP (arah)

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self';
frame-ancestors 'none';
```

### 9.2 Internal API (Next.js ↔ Python)

- Tidak diekspos ke publik (hanya network internal).
- Dilindungi shared secret `X-Internal-Token` (constant-time compare) + mTLS opsional.
- Hanya menerima job dari Redis Streams untuk operasi async (envelope terpercaya).

---

## 10. Keamanan Database

- **RLS aktif** di semua tabel ber-`company_id` (lihat [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) §14).
- Role aplikasi **bukan** superuser; tidak bisa `BYPASSRLS`.
- Koneksi DB hanya dari network internal; tidak pernah diekspos.
- Backup terenkripsi (at-rest) + uji restore berkala.
- Secret DB di env, bukan di repo.
- Prepared statement/ORM untuk semua query (anti SQL injection).
- Least privilege per service: worker hanya butuh akses tabel yang relevan (opsional granular role).

---

## 11. Keamanan Kredensial & Konfigurasi Deploy

### 11.1 Environment variables (contoh)

```text
# Wajib
DATABASE_URL=postgres://...
REDIS_URL=redis://...
ORVEXA_MASTER_KEY=<base64 32 bytes>
AUTH_SECRET=<random 32+ bytes>
INTERNAL_API_TOKEN=<random>
TZ=Asia/Jakarta                 # waktu Jakarta (WIB) untuk seluruh service

# Opsional
OAUTH_GOOGLE_ID / OAUTH_GOOGLE_SECRET
OAUTH_GITHUB_ID / OAUTH_GITHUB_SECRET
S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY
```

### 11.2 Aturan

```text
- .env TIDAK pernah di-commit; sediakan .env.example tanpa nilai asli.
- Secret di-generate acak kuat; jangan pakai nilai default.
- Docker: gunakan secret/variable, jangan baked ke image.
- Rotasi AUTH_SECRET → invalidasi sesi.
- Jalankan container sebagai non-root user.
- Update dependency rutin (Dependabot) & audit (npm audit / pip-audit).
```

### 11.3 Hardening default self-host

- Default password/token tidak ada; instalasi gagal jika master key lemah.
- Port hanya yang perlu diekspos (web + proxy). Postgres/Redis internal saja.
- Caddy/Nginx menangani TLS otomatis (Let's Encrypt).

---

## 12. Secure Development Lifecycle

```text
Pre-commit   : secret scanning (gitleaks), lint
CI           : typecheck, test, dependency audit, SAST
Review       : minimal 1 reviewer untuk perubahan security-relevant
Dependency   : Dependabot, lockfile ter-commit
Disclosure   : SECURITY.md (policy) + private reporting channel
```

### 12.1 Pelaporan kerentanan

Sediakan `SECURITY.md` root untuk kebijakan disclosure (bukan file ini), dengan jalur lapor privat dan target respons. Jangan minta peneliti membuka issue publik untuk kerentanan belum diperbaiki.

---

## 13. Checklist Keamanan MVP (Acceptance)

```text
[ ] Secret provider terenkripsi AES-256-GCM, tidak pernah ke browser
[ ] RLS aktif & tenant terisolasi
[ ] RBAC di BFF + runtime, deny by default
[ ] Approval gate untuk aksi sensitif, destruktif default disabled
[ ] Audit log append-only + redaksi secret
[ ] Rate limiting login & API
[ ] Webhook signature verification
[ ] SSRF guard untuk tool URL
[ ] Upload validation + storage di luar webroot
[ ] CSP & security headers aktif
[ ] .env.example ada, tidak ada secret di repo
[ ] Internal API tidak publik + token internal
[ ] Backfill/rotasi credential & master key terdokumentasi
```

---

## 14. Roadmap Keamanan

| Fase | Item |
|---|---|
| MVP | Enkripsi kredensial, RBAC, RLS, audit, approval, rate limit |
| +1 | MFA (TOTP), SSO (SAML/OIDC), session management UI |
| +2 | Scan malware upload, secret scanning CI, SAST otomatis |
| +3 | Envelope encryption penuh + KMS opsional, audit export |
| +4 | Sandbox eksekusi tool (isolasi proses/container), policy engine (OPA-style) |
