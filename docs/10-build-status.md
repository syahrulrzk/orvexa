# Status build ORVEXA v0.1

Diperbarui: 27 September 2026. Status: preview fungsional di jaringan lokal, belum rilis SaaS publik.

## Arah produk yang sudah dikonfirmasi

ORVEXA membantu UMKM memiliki karyawan AI. Fondasi bersifat umum untuk berbagai usaha: perusahaan memberikan profil, produk/jasa, knowledge, organisasi, dan tugas. CRM penawaran jasa/email adalah use case lanjutan, bukan pembatas struktur aplikasi. UI mendukung Indonesia dan English; bahasa kerja perusahaan diatur terpisah.

## Yang sudah tersedia

- Signup/login email dan password menggunakan Better Auth, session, serta pembatasan akses workspace di server.
- Onboarding perusahaan, pilihan starter team, switch workspace, profil bisnis, bahasa kerja dan timezone.
- Company Knowledge berbasis teks dengan kategori dan status draft/published; published knowledge masuk snapshot pekerjaan.
- Data divisi, konfigurasi agent, proyek, serta tugas; form edit, pencarian, dan status Kanban tersimpan di PostgreSQL.
- Konfigurasi OpenAI model/key terenkripsi. Secret tidak dikembalikan ke browser.
- Kode worker BullMQ + LangGraph, checkpoint PostgreSQL, brief → maksimum dua kontribusi specialist → hasil akhir. Maksimum empat panggilan model per run, masing-masing maksimal 1.800 output tokens.
- Approval sebelum pekerjaan AI, resume, cancel, workspace pause, cache hasil per step dan event Rooms.
- Tugas berulang setiap 24 jam atau 7 hari; dedupe occurrence diuji. Start run menerima header `Idempotency-Key`: retry dengan key sama membalas run yang sama tanpa membuat run baru, termasuk saat run sudah terminal. Worker harus dijalankan agar antrean/jadwal diproses.
- Dashboard berbasis data nyata, Activity, Rooms, penggunaan token, Virtual Office dasar, SSE dan polling fallback.
- Preview LAN memakai `http://172.16.19.235:3000` saat server dijalankan; saat ini server dihentikan atas permintaan owner. Akun administrator adalah owner workspace, bukan global superadmin lintas tenant.

## Bukti validasi

| Pemeriksaan | Hasil | Sumber |
|---|---|---|
| Svelte + TypeScript | 0 error, 0 warning | `bun run check` |
| Production build | Lulus; warning dependency bundler tidak menghalangi build | `bun run build` |
| Unit | 4 lulus | `tests/unit.test.ts` |
| PostgreSQL/Redis/LangGraph integration | 11 lulus (termasuk 2 uji idempotency) | `tests/integration.test.ts` |
| Chromium E2E lewat IP LAN | Skenario dasar pernah lulus; run terbaru berhenti di signup sebelum assertion logout/origin | `tests/browser/app.spec.ts` |

Skenario browser mencakup daftar akun, onboarding, starter team, CRUD knowledge/project/task, persistence setelah reload, perubahan status, error provider belum dikonfigurasi, pergantian bahasa, navigasi halaman, mobile tanpa overflow, dan dialog Escape.

Integration menguji isolasi tenant, referensi silang, secret masking, concurrent start dedupe, graph multi-agent, hasil tidak dieksekusi ulang, interrupt/resume pada instance graph baru, duplicate approval, cancel, pause, queue Redis, jadwal atomic, serta replay/klaim Idempotency-Key dan penolakan key tidak valid. Panggilan model menggunakan stub yang diinjeksi oleh tes; tidak ada bukti keberhasilan provider/model berbayar nyata.

## Batas yang masih nyata

- Belum ada email verification/reset password, undangan anggota, pengelolaan role lengkap atau global admin panel.
- Workflow agent masih graph konsultasi terbatas dalam satu run. Belum child-run delegation, hierarki manager, policy per tool, hard budget biaya bersama atau self-directed loop.
- Agent menghasilkan teks. Belum mengirim email, menjalankan shell, memindahkan uang, atau memakai tool eksternal/MCP.
- Usage biaya belum dihitung; harga provider tidak ditetapkan. UI menandai biaya belum tersedia.
- Scheduler memakai interval sejak penyimpanan, bukan cron timezone; belum menangani seluruh kondisi missed schedule.
- Belum pengujian lengkap retry/recovery/fencing, SSE replay/revocation, load, dan accessibility.
- Database memakai tabel domain inti serta `entities` JSONB tervalidasi untuk lima jenis entitas. Bukan seluruh model logis pada dokumen perencanaan yang sudah dinormalisasi.
- Migrasi awal berupa SQL idempotent; strategi versioned migrations belum lengkap.
- PostgreSQL dan Redis berjalan di Docker. Web preview berjalan sebagai proses Bun; packaging web/worker, auto-start setelah reboot, reverse proxy, TLS, CI, backup/restore, dan production rollout belum selesai.
- Source memiliki worker, tetapi layanan worker persisten belum dipasang. Jalankan `bun run worker` ketika siap memakai provider.

Jika dokumen roadmap menggambarkan target yang lebih luas, file ini dan status per task menjelaskan kondisi implementasi saat ini. Task hanya DONE jika kriteria pada barisnya terpenuhi; banyak fitur yang terlihat di UI masih IN_PROGRESS karena scope lengkapnya lebih luas.

## Publikasi GitHub

Target repository: `https://github.com/syahrulrzk/orvexa.git`, branch `main`. Atas instruksi owner, snapshot aplikasi SvelteKit/Bun menggantikan isi lama Next.js/Python melalui commit baru yang melanjutkan `9ec10ef`. Riwayat Git tetap dipertahankan tanpa force-push.
