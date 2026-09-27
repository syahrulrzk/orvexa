# Kontrak API dan event

Perluasan MVP autonomous: [struktur divisi, koordinasi multi-agent, kontrak tambahan, dan kontrol owner](09-autonomous-company.md). Aturan dasar di bawah tetap berlaku untuk setiap parent/child run.


Baseline: JSON REST pada `/api/v1/workspaces/{workspaceId}`. SvelteKit server routes menjadi implementasi awal. Schema request/response dibagi melalui `packages/contracts`; spesifikasi OpenAPI lengkap dibuat saat endpoint diimplementasikan.

## Endpoint MVP

| Method/path relatif | Perilaku |
|---|---|
| `GET /dashboard` | Agregat data workspace dengan filter tanggal |
| `GET, POST /projects` | Daftar dan membuat project |
| `GET, PATCH /projects/{id}` | Detail dan perubahan project |
| `GET, POST /tasks` | Daftar dan membuat task |
| `GET, PATCH /tasks/{id}` | Detail dan perubahan task |
| `POST /tasks/{id}/runs` | Membuat run; `202` dengan run ID |
| `GET /runs/{id}` | Snapshot status dan hasil yang boleh dibaca |
| `POST /runs/{id}/cancel` | Meminta pembatalan; `202`, bukan jaminan sudah berhenti |
| `GET /runs/{id}/events` | SSE, mendukung replay event |
| `GET /approvals` | Approval yang boleh dibaca pengguna |
| `POST /approvals/{id}/decision` | `{decision: "approve" | "reject", reason?: string}` |
| `GET, POST /agents` | Daftar dan membuat konfigurasi agent |
| `GET, PATCH /agents/{id}` | Membaca/mengubah agent untuk run berikutnya |
| `GET, POST /provider-connections` | Metadata tersamarkan dan menyimpan credential |
| `PATCH /provider-connections/{id}` | Rotasi credential atau menonaktifkan koneksi |
| `GET /members` | Daftar anggota |
| `POST /invitations` | Membuat undangan dengan role yang diizinkan |
| `PATCH /members/{userId}` | Mengubah role/status dengan pemeriksaan owner terakhir |
| `GET /activity` | Activity dengan pagination |
| `GET /usage` | Penggunaan token dan biaya per periode |
| `GET, PATCH /settings` | Pengaturan yang diizinkan role |

Endpoint auth, penerimaan invitation, serta pembuatan workspace ditentukan bersama library auth. Jangan mengklaim dukungan alur undangan selesai sebelum endpoint penerimaan dan email delivery tersedia.

## Semantik umum

- Session cookie `HttpOnly`, `Secure` pada HTTPS, dan `SameSite` yang sesuai. Terapkan pemeriksaan origin/CSRF untuk operasi mutasi berbasis cookie.
- Validasi semua input di server. Pagination cursor dengan default 25 dan maksimum 100; sort field memakai allowlist.
- Gunakan `Idempotency-Key` pada pembuatan run dan keputusan approval. Key sama + payload sama mengembalikan hasil semula; payload berbeda menghasilkan `409`.
- Simpan keputusan approval dan outbox resume secara atomik. Request bersamaan tidak boleh membuat dua keputusan efektif.
- Error: `{ "error": { "code": "APPROVAL_EXPIRED", "message": "Persetujuan sudah kedaluwarsa", "requestId": "..." } }`.
- Status: `400` input salah, `401` belum login, `403` tidak berizin, `404` resource tidak ditemukan/tidak terlihat, `409` konflik state, `429` limit, `503` dependency tidak tersedia.
- Jangan membocorkan keberadaan resource tenant lain melalui error detail.

## Event SSE

```text
id: 42
event: run.status_changed
data: {"version":1,"runId":"uuid","sequence":42,"status":"waiting_approval","occurredAt":"2026-09-27T08:00:00Z"}

```

Jenis awal: `run.status_changed`, `run.progress`, `approval.requested`, `tool.completed`, `usage.recorded`, `run.result_available`.

Event disimpan dengan urutan per run. `Last-Event-ID` melanjutkan replay; client mengabaikan sequence yang sudah diterima. Jika history sudah dibersihkan, client mengambil snapshot terbaru. Pengiriman dianggap at-least-once, bukan exactly-once.

Server memverifikasi akses ketika koneksi dibuka dan secara berkala/ketika izin berubah. SSE menggunakan heartbeat, reconnect backoff, dan batas koneksi. Nginx harus menonaktifkan buffering pada route stream. Token teks model boleh dikirim sebagai event sementara; hasil akhir tetap dipersistenkan. Jangan mengirim secret, raw tool credential, atau chain-of-thought internal ke UI.
