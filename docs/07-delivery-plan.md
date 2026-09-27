# Tahapan implementasi dan validasi

Status pelaksanaan setiap fase dilacak di [Tasklist ORVEXA](TASKLIST.md). Dokumen ini menjelaskan roadmap dan standar validasinya.

Tidak ada estimasi kalender sebelum kapasitas tim, server, dan pekerjaan agent pertama diketahui. Setiap fase memiliki hasil yang dapat ditinjau dan kriteria keluar.

| Fase | Hasil | Kriteria keluar |
|---|---|---|
| 0 — Validasi stack | Repo workspace, versi terkunci, spike SvelteKit/Bun/DB/queue/LangGraph | Build Docker, streaming, checkpoint, interrupt/resume, dan restart berhasil; fallback dicatat jika perlu |
| 1 — Fondasi | Auth, workspace, members, DB migrations, app shell | Login/logout berfungsi dan uji akses lintas tenant ditolak |
| 2 — Pekerjaan | Projects, tasks, agents, provider connection | CRUD, validasi, izin role, secret encryption, dan snapshot run benar |
| 3 — Alur agent | Queue, worker, graph, tools, approval, cancel, hasil | Satu pekerjaan nyata selesai termasuk approval dan pemulihan restart |
| 3B — Perusahaan autonomous | Divisi, objectives, pesan/delegasi, policy, scheduler, Rooms dan Virtual Office dasar | Objective lintas divisi selesai tanpa interaksi manusia pada policy allow; batas, recovery dan kontrol owner diuji |
| 4 — Monitoring | Activity, dashboard, usage/cost, SSE | Metrik sesuai data dan refresh/reconnect tidak kehilangan status |
| 5 — Siap operasi | Compose, HTTPS, backup/restore, monitoring, runbook | Deployment staging dan restore database/checkpoint teruji |
| 6 — Perluasan | Rooms lanjutan, knowledge, documents, skills, MCP, Virtual Office 3D | Scope dan acceptance criteria dibuat per fitur sebelum coding |

## Validasi yang bermakna

- Unit: policy approval, transisi status, budget calculation, dan redaction.
- Integrasi memakai PostgreSQL/Redis nyata: constraint tenant, outbox dispatch ulang, queue duplicate, claim concurrency, checkpoint, dan resume.
- E2E: login → workspace → project/task → run → approval → hasil, termasuk reload browser dan SSE reconnect.
- Failure injection: worker mati saat queued/running/waiting approval; provider timeout/429; approve ganda; approval kedaluwarsa; cancel saat tool berjalan; Redis restart.
- Side-effect test: simulasi layanan eksternal sukses lalu worker mati sebelum commit lokal; buktikan replay ditahan atau dideduplikasi.
- UI: tinjau terhadap PNG pada desktop, tablet, dan ponsel; keyboard navigation, loading, empty state, dan error form.
- Operasi: restore backup ke lingkungan terisolasi dan verifikasi data workspace, checkpoint, serta dekripsi credential dengan kunci yang benar.

CI minimum: dependency install terkunci, lint, typecheck, tes terkait, dan build. Tes tidak boleh menggunakan production credential; live provider smoke test terpisah dan memakai budget kecil yang ditetapkan.

## Checklist sebelum implementasi fitur

Scope, role, kontrak input/output, status domain, data model, UI states, dan acceptance criteria tersedia. Review semua PNG terkait; desain yang belum diperiksa tidak diasumsikan sudah memiliki spesifikasi lengkap.

## Checklist sebelum produksi

Auth library sudah dipilih dan diuji; domain/TLS siap; resource limits berdasarkan pengukuran; backup dan restore teruji; owner awal dibuat melalui proses aman; secret tidak ada di image/repo; batas agent aktif; monitoring dan prosedur rollback tersedia. Target retensi/RPO/RTO sudah diputuskan.
