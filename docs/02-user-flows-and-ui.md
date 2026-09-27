# Alur pengguna dan spesifikasi UI

## Referensi desain

Sumber: folder `Menu Picture/`. Dashboard, Rooms, Projects, Tasks, dan Virtual Office telah dibuka untuk tinjauan visual awal. Halaman lain baru diinventarisasi berdasarkan nama file; detail interaksinya harus ditinjau sebelum implementasi.

| PNG | Route usulan | Tahap |
|---|---|---|
| `01.MENU DASBOARD.png` | `/w/[workspaceId]/dashboard` | MVP |
| `02.MENU ROOMS.png` | `/w/[workspaceId]/rooms` | MVP percakapan agent |
| `03.MENU PROJECT.png` | `/w/[workspaceId]/projects` | MVP |
| `04.MENU TASK.png` | `/w/[workspaceId]/tasks` | MVP |
| `05.MENU APPROVAL.png` | `/w/[workspaceId]/approvals` | MVP |
| `06.TEAMS.png` | `/w/[workspaceId]/teams` | MVP divisi; teams lanjutan berikutnya |
| `07.AGENT.png` | `/w/[workspaceId]/agents` | MVP |
| `08.MENU SKILL.png` | `/w/[workspaceId]/skills` | Berikutnya |
| `09.MENU KNOWLAGE.png` | `/w/[workspaceId]/knowledge` | Berikutnya |
| `10.MENU ACTIVITY.png` | `/w/[workspaceId]/activity` | MVP |
| `11.MENU VIRTUALOFFICE.png` | `/w/[workspaceId]/virtual-office` | MVP dasar; visual 3D berikutnya |
| `12.MENU DECISION.png` | `/w/[workspaceId]/decisions` | Berikutnya |
| `13. MENU DOCUMENT.png` | `/w/[workspaceId]/documents` | Berikutnya |
| `14.MENU MEMBER.png` | `/w/[workspaceId]/members` | MVP |
| `15.MENU AI PROVIEDER.png` | `/w/[workspaceId]/ai-providers` | MVP |
| `16.MENU AI COST.png` | `/w/[workspaceId]/ai-costs` | MVP |
| `17.MENU MCP.png` | `/w/[workspaceId]/mcp` | Berikutnya |
| `18.MENU SETTING.png` | `/w/[workspaceId]/settings` | MVP dasar |

Menu di luar scope tidak boleh terlihat seolah berfungsi. Sembunyikan melalui feature flag atau tandai jelas belum tersedia sesuai keputusan produk.

## Alur autonomous

Owner mengatur divisi dan agent → membuat objective/policy/jadwal → coordinator mendelegasikan ke specialist → diskusi dan hasil tampil di Rooms → Virtual Office memperlihatkan status → owner meninjau hasil atau melakukan pause/cancel. Jalur allow selesai tanpa approval manusia; alur approval di bawah berlaku untuk pengecualian policy. Detail ada di [rancangan autonomous](09-autonomous-company.md).

## Alur utama

1. Login → pilih/buat workspace → masuk dashboard.
2. Owner/admin menambah koneksi provider; aplikasi mengenkripsi secret dan hanya mengembalikan tampilan tersamarkan.
3. Admin membuat agent: model, instruksi, tools yang diizinkan, dan batas run.
4. Member membuat project dan task, lalu memilih agent.
5. Tombol Run membuat run baru dan menampilkan status antrean serta progress.
6. Jika perlu approval, halaman task menautkan permintaan dengan tindakan, alasan, input, dan masa berlaku.
7. Pengguna berizin menyetujui/menolak. Setelah disetujui, sistem memeriksa kembali izin dan melanjutkan run.
8. UI menampilkan hasil, riwayat langkah, penggunaan model, dan estimasi biaya; kegagalan dapat memicu run baru melalui Retry.

Menutup browser tidak membatalkan run. Tombol Cancel mengirim permintaan pembatalan; UI tidak menyatakan selesai dibatalkan sebelum worker mengonfirmasi.

## Sistem tampilan

- Sidebar navy, konten terang, aksen biru, kartu dengan border tipis mengikuti referensi.
- Gunakan design tokens untuk warna, jarak, radius, typography, dan status; nilai final ditentukan saat meninjau semua PNG.
- Komponen bersama: app shell, page header, metric card, table, filter bar, status badge, dialog, form, pagination, empty state, dan activity feed.
- Desktop menampilkan sidebar; layar kecil memakai drawer. Tabel dapat scroll horizontal, panel sekunder berpindah ke bawah, Kanban dapat scroll per kolom.
- Semua halaman memiliki loading, empty, error, forbidden, dan success state yang relevan.
- Form memiliki label, error per field, dan focus management. Status tidak disampaikan hanya melalui warna; navigasi keyboard wajib berfungsi.
- PNG bukan asset latar seluruh halaman. Bangun UI interaktif; ilustrasi/avatar dapat diganti asset yang sesuai hak penggunaannya.

## Definisi dashboard MVP

| Metrik | Sumber/arti |
|---|---|
| Total agents | Agent aktif, tidak diarsipkan, pada workspace |
| Running tasks | Jumlah task unik yang memiliki run berstatus running |
| Projects | Project tidak diarsipkan |
| Awaiting approval | Approval pending dan belum kedaluwarsa |
| Usage/cost | Penggunaan model dalam rentang tanggal terpilih |
| Recent activity | Audit/activity event terbaru yang boleh dibaca pengguna |

System health dan security alerts pada PNG baru ditampilkan jika ada sumber telemetry yang benar. Cuaca, avatar 3D, dan Virtual Office bukan prasyarat MVP. Persentase grafik harus memakai denominator yang konsisten; teks dan angka contoh PNG tidak menjadi aturan bisnis.
