# Deployment dan operasi

Perluasan MVP autonomous: [struktur divisi, koordinasi multi-agent, kontrak tambahan, dan kontrol owner](09-autonomous-company.md). Aturan dasar di bawah tetap berlaku untuk setiap parent/child run.


## Target awal

Satu server Ubuntu dengan Docker Compose. Konfigurasi aktual menunggu pemeriksaan CPU, RAM, disk, port yang terpakai, dan layanan lain. Single-server deployment memiliki satu titik kegagalan; bukan arsitektur high availability.

Layanan usulan: `proxy`, `web`, `worker`, `postgres`, `redis`; dispatcher/reconciler dapat menjadi role proses worker dengan koordinasi yang jelas. Migration berjalan sebagai one-off job sebelum versi aplikasi baru diaktifkan.

## Jaringan dan penyimpanan

- Publish hanya port proxy 80/443 sesuai kebutuhan TLS. PostgreSQL dan Redis berada di network internal tanpa port publik.
- Persistenkan data PostgreSQL dan Redis pada volume. Atur persistence Redis dan kebijakan `noeviction` untuk queue; PostgreSQL tetap menyimpan run/outbox agar dispatch dapat direkonsiliasi.
- Container aplikasi berjalan sebagai non-root, tanpa Docker socket, dengan resource limits yang ditetapkan setelah pengukuran.
- Object storage untuk dokumen dipilih pada fase fitur dokumen; jangan menyimpan upload hanya di filesystem container sementara.

## Konfigurasi environment usulan

| Variabel | Fungsi |
|---|---|
| `DATABASE_URL` | Koneksi database internal |
| `REDIS_URL` | Koneksi queue |
| `APP_ORIGIN` | Origin publik untuk URL dan validasi aplikasi |
| `AUTH_SECRET` | Secret auth sesuai library terpilih |
| `CREDENTIAL_ENCRYPTION_KEY` | Kunci enkripsi credential, terpisah dari database |
| `WORKER_CONCURRENCY` | Batas job paralel per worker |
| `LOG_LEVEL` | Verbositas log tanpa membocorkan data sensitif |

Nama final mengikuti implementasi/library. `.env.example` hanya berisi placeholder. Secret disuntikkan pada runtime melalui mekanisme deployment yang aksesnya dibatasi; jangan di-commit atau ditanam di image.

## Alur deployment

1. CI memvalidasi kode dan membangun image immutable yang ditag commit SHA.
2. Catat image/version sebelumnya dan cek backup yang dapat dipulihkan.
3. Jalankan migrasi yang kompatibel dengan versi aplikasi dalam masa transisi.
4. Aktifkan web/worker baru, periksa readiness, lalu lakukan smoke test.
5. Worker menerima SIGTERM, berhenti mengambil job baru, dan melakukan shutdown terkontrol. Recovery menangani job yang terputus.
6. Rollback aplikasi ke image sebelumnya jika kompatibel dengan schema. Migrasi destruktif membutuhkan rencana terpisah; rollback image tidak otomatis membalik database.

Graph/checkpoint diberi versi. Run lama harus diselesaikan dengan graph yang kompatibel atau dimigrasikan secara eksplisit; jangan menjalankan checkpoint lama memakai graph baru tanpa pengujian.

## Backup dan recovery

Backup PostgreSQL mencakup data domain, outbox, dan checkpoint. Salinan terenkripsi disimpan di luar server aplikasi. Kunci enkripsi credential dicadangkan secara aman dan terpisah; backup database tanpa kunci tidak cukup untuk pemulihan koneksi provider.

Usulan awal: backup harian, retensi 14 hari, dan latihan restore bulanan. Ini belum target RPO/RTO yang disepakati. Tentukan kebutuhan PITR jika toleransi kehilangan data lebih kecil daripada interval backup.

Saat pemulihan: hentikan dispatch → restore database/kunci → validasi schema dan akses tenant → rekonsiliasi status layanan eksternal dan job → bangun kembali pekerjaan dari state/outbox yang relevan → aktifkan worker. Jangan mengulang otomatis tindakan eksternal dengan hasil ambigu.

## Monitoring

Pantau HTTP error/latency, koneksi DB, disk, memori, queue lag, heartbeat worker, run macet, approval kedaluwarsa, failure rate provider, dan penggunaan biaya. Health endpoint tidak mengungkap secret/config. Bedakan liveness proses dari readiness dependency.

Nginx mengatur TLS, request body limit, timeout, dan rate limit dasar; route SSE membutuhkan buffering off dan timeout/heartbeat yang sesuai. Rate limit bisnis tetap diterapkan per pengguna/workspace di aplikasi.

## Insiden umum

| Gejala | Tindakan awal |
|---|---|
| Run antre terus | Cek Redis, heartbeat worker, concurrency, dan outbox tertunda |
| Run macet | Periksa claim/heartbeat dan checkpoint; rekonsiliasi sebelum retry |
| Provider error | Periksa error code, credential tersamarkan, quota, dan backoff |
| Approval tidak lanjut | Cek expiry, state, action hash, dan outbox resume |
| Stream berhenti | Cek proxy buffering/timeout; client reconnect dan ambil snapshot |
| Biaya melonjak | Hentikan dispatch workspace terkait, periksa limits dan run aktif |

Logging harus melakukan redaction untuk cookie, API key, authorization header, dan payload sensitif. Hak akses operator dan audit perubahan produksi didokumentasikan sebelum peluncuran.
