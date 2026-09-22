# Contributing to Orvexa

Terima kasih sudah mau berkontribusi! 🎉 Orvexa adalah proyek open-source yang dibangun untuk dipakai semua orang, jadi kontribusi dari komunitas sangat berarti.

---

## 1. Sebelum Mulai

- Baca [README.md](./README.md) dan [docs/README.md](./docs/README.md) untuk memahami produk & arsitektur.
- Cek [TASKLIST.md](./TASKLIST.md) untuk tahu progres dan task yang tersedia.
- Untuk perubahan besar (fitur/arsitektur), **buka issue dulu** untuk diskusi sebelum coding.
- Baca [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) & [docs/SECURITY.md](./docs/SECURITY.md) — keputusan di sana mengikat.

---

## 2. Setup Development

### Prasyarat

```text
- Node.js 22+ (npm 10+)
- Python 3.12+
- Docker + Docker Compose
- Git
```

### Langkah

```bash
# 1. Fork & clone
git clone https://github.com/<user>/orvexa.git
cd orvexa

# 2. Copy env
cp .env.example .env

# 3. Jalankan dependency (postgres + redis)
docker compose up -d postgres redis

# 4. Install dependency web
npm install

# 5. Migrasi + seed
npm run db:migrate
npm run db:seed

# 6. Setup worker
cd worker && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cd ..

# 7. Jalankan dev
npm run dev          # web
npm run dev:worker   # worker (terminal terpisah)
```

Akses web di `http://localhost:3000`.

### Semua via Docker

```bash
docker compose up --build
```

---

## 3. Struktur Project

```text
orvexa/
├── apps/web/            Next.js 16 (UI + BFF API)
├── worker/              Python agent runtime
├── packages/shared/     Tipe & util yang dipakai bersama
├── docs/                Dokumentasi teknis
├── docker-compose.yml
├── TASKLIST.md
└── README.md
```

Detail pembagian tanggung jawab ada di [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) §4.

---

## 4. Alur Kerja Git

```text
1. Buat branch dari main:
   feature/<deskripsi>   → fitur
   fix/<deskripsi>       → bug
   docs/<deskripsi>      → dokumentasi
   chore/<deskripsi>     → maintenance

2. Commit kecil & fokus. Tulis pesan yang jelas.

3. Push & buka Pull Request ke main.
```

### Konvensi Commit (Conventional Commits)

```text
feat: tambah SSE gateway untuk room events
fix: cek permission sebelum trigger agent
docs: perjelas konvensi timezone Asia/Jakarta
refactor: pisahkan provider abstraction
test: tambah test untuk approval resume
chore: update dependency
```

### Pull Request

- Deskripsi PR harus menjelaskan **apa** & **mengapa**.
- Sertakan cara uji / screenshot bila relevan.
- Ukuran PR kecil lebih cepat direview.
- Wajib lolos CI: typecheck, lint, test.
- Minimal 1 approval reviewer.

---

## 5. Standar Kode

### Umum

- Ikuti gaya yang sudah ada; jangan reformat file yang tidak terkait.
- Kode & komentar dalam **Inggris**; dokumen boleh Indonesia.
- Tidak ada secret/API key di kode atau commit.

### TypeScript / Next.js

- TypeScript strict. Hindari `any` tanpa alasan jelas.
- Komponen React fungsional + hooks.
- Validasi input dengan Zod.
- Query DB lewat ORM (Drizzle) — hindari string SQL mentah.
- A11y: label, focus ring, keyboard support.

### Python / Worker

- Python 3.12, type hints wajib.
- Format & lint: `ruff` + `black`.
- Pydantic untuk validasi data.
- Async I/O; jangan blocking event loop.

### Database

- Semua perubahan schema lewat migrasi (Drizzle), bukan edit manual.
- Setiap tabel ber-`company_id` wajib RLS.
- Semua kolom waktu pakai `timestamptz`; timezone `Asia/Jakarta`.

### Keamanan (wajib dibaca)

- Secret hanya di server; **jangan pernah** kirim ke client.
- Aksi sensitif default `approval_required`; destruktif `disabled`.
- Semua aksi penting harus tercatat di audit log.
- Jangan pernah log nilai secret/token.

Detail: [docs/SECURITY.md](./docs/SECURITY.md).

---

## 6. Test

```bash
npm run typecheck     # TypeScript
npm run lint          # ESLint
npm run test          # unit test
npm run test:e2e      # end-to-end
cd worker && pytest    # test worker
```

- Tambahkan test untuk fitur/bugfix baru.
- Perubahan security-relevant **wajib** ada test.

---

## 7. Melaporkan Bug

Buka issue dengan:

```text
- Deskripsi singkat
- Langkah reproduksi
- Perilaku yang diharapkan vs aktual
- Versi / commit / environment
- Log relevan (tanpa secret!)
```

## 8. Melaporkan Kerentanan Keamanan

⚠️ **Jangan** buka issue publik untuk kerentanan keamanan.
Ikuti panduan di [`SECURITY.md`](./SECURITY.md) (kebijakan disclosure) dan lapor secara privat.

---

## 9. Menambah Fitur Baru

- Catat ide di [TASKLIST.md](./TASKLIST.md) §9 (Backlog) dulu.
- Diskusikan di issue; setelah disetujui, pindahkan ke fase yang sesuai.
- Update dokumentasi terkait (arsitektur/API/schema) bila fitur mengubahnya.

---

## 10. Kode Etik

Bersikap sopan, inklusif, dan profesional. Kita membangun alat untuk semua orang — jaga komunitas tetap ramah.

---

## 11. Lisensi Kontribusi

Dengan berkontribusi, Anda setuju bahwa kontribusi Anda dilisensikan di bawah [MIT License](./LICENSE).

Terima kasih sudah berkontribusi! 🚀
