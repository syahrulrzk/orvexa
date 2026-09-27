# ORVEXA

SaaS untuk membantu UMKM memiliki tim karyawan AI, dengan konteks bisnis, knowledge perusahaan, divisi, tugas, dan ruang kolaborasi. UI mendukung **Bahasa Indonesia dan English**.

**Status:** build awal yang dapat digunakan di LAN; belum production-ready. Lihat [status implementasi](docs/10-build-status.md), [tasklist](docs/TASKLIST.md), dan [dokumentasi arsitektur](docs/README.md).

## Stack

SvelteKit + TypeScript, Bun, Better Auth, PostgreSQL/Drizzle, Redis/BullMQ, dan LangGraph JS. `bun.lock` mengunci dependency yang diuji; gunakan frozen lockfile untuk reproduksi.

## Menjalankan secara lokal

Prasyarat: Bun 1.4.0, Docker dan Docker Compose.

1. Salin `.env.example` ke `.env`. Ganti password database, `BETTER_AUTH_SECRET` (minimal 32 karakter acak), dan `CREDENTIAL_ENCRYPTION_KEY` (64 karakter hex acak). Pastikan password dalam `DATABASE_URL` sama dengan `POSTGRES_PASSWORD`.
2. Jalankan:

```sh
bun install --frozen-lockfile
docker compose --env-file .env -f infra/compose.yaml up -d
bun run db:migrate
bun run dev
```

3. Buka `http://localhost:5173/register`, buat akun owner, dan isi profil perusahaan. Default `.env.example` menggunakan origin development tersebut.
4. Tambahkan knowledge dan karyawan AI. Untuk eksekusi nyata, isi API key/model di menu AI Provider lalu jalankan worker pada terminal terpisah:

```sh
bun run worker
```

Tanpa provider, data bisnis dan antarmuka tetap bisa digunakan; permintaan menjalankan AI akan ditolak dengan pesan yang jelas. Tidak ada password administrator yang disimpan di source. Script `scripts/create-admin.ts` digunakan untuk provisioning administrator lokal, menghasilkan password acak hanya saat akun belum ada.

## Preview LAN pada server ini

Alamat: `http://172.16.19.235:3000/login`.

```sh
bun run build
bash scripts/serve.sh
```

`serve.sh` menargetkan IP/port LAN server ini. Set `APP_ORIGIN` di `.env` ke alamat LAN yang sama. Untuk host lain, sesuaikan `ORIGIN`, `HOST`, dan `PORT` pada launcher. `.env`, runtime logs, dan hasil tes tidak masuk Git.

Preview belum memakai service manager dan tidak dijamin otomatis hidup setelah reboot. Mode production publik memerlukan pekerjaan lanjutan pada [tasklist](docs/TASKLIST.md).

## Validasi

```sh
bun run check
bun run test
bun run test:integration
bun run build
bunx playwright install chromium
E2E_BASE_URL=http://172.16.19.235:3000 bunx playwright test
```

Tes integrasi membutuhkan database hasil migrasi dan Redis lokal. Respons model menggunakan stub tanpa biaya API. Browser test membuat akun dan workspace fixture berlabel `Test Owner` dengan email `e2e-…@example.test`; fixture browser belum dibersihkan otomatis. Jalankan di lingkungan pengujian.

## Struktur

- `apps/web`: web, auth, server API, dan SSE.
- `apps/worker`: antrean, dispatch dan jadwal.
- `packages/core`: database, validasi, layanan domain, enkripsi dan graph agent.
- `scripts`: schema/migrasi, provisioning admin dan launcher LAN.
- `infra`: Compose PostgreSQL/Redis.
- `tests`: unit, integrasi dan browser.
- `Menu Picture`: 18 PNG referensi desain.
- `docs`: kebutuhan, roadmap, tasklist dan status aktual.
