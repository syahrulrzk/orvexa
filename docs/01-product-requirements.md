# Kebutuhan produk

## Tujuan

ORVEXA adalah virtual office autonomous: pengguna menjadi Owner, dengan karyawan AI di divisi IT, Finance, Marketing, Sales, dan divisi lain yang dapat dikonfigurasi. Agent dapat berdiskusi, mendelegasikan pekerjaan, dan menjalankan mandat dalam izin serta budget owner. Lihat [rancangan perusahaan AI](09-autonomous-company.md).

Skenario MVP: owner menetapkan objective; coordinator membagi subtask kepada specialist lintas divisi, agent berdiskusi dan menyelesaikan tindakan yang diizinkan tanpa balasan manusia setiap langkah. Jadwal dapat memulai objective berikutnya. Owner memantau hasil, biaya, dan pengecualian yang membutuhkan approval.

## Aktor

| Role | Tanggung jawab awal |
|---|---|
| Owner | Kepemilikan workspace, role, credential provider, pengaturan |
| Admin | Anggota, konfigurasi agent, project, dan operasi workspace |
| Member | Membuat dan mengelola pekerjaan yang diizinkan |
| Viewer | Membaca data yang diizinkan tanpa melakukan perubahan |

Hak approval merupakan permission eksplisit `approvals:decide`, bukan otomatis melekat pada semua anggota. Kebijakan awal member boleh mengakses project workspace; akses privat per project merupakan perluasan berikutnya dan tidak boleh ditampilkan sebelum tersedia.

## Ruang lingkup MVP

- Login, session, workspace, undangan anggota, dan pemeriksaan role di server.
- CRUD project, task, dan konfigurasi agent.
- Satu integrasi provider model yang bisa dikembangkan melalui adapter.
- Coordinator dan specialist agents dengan tools terdaftar, checkpoint persisten, delegasi, dan budget bersama.
- Divisi, Rooms percakapan kerja, scheduled objectives, policy autonomous, dan tampilan dasar Virtual Office.
- Kontrol owner untuk pause/resume/cancel beserta propagasi ke child run.
- Antrean pekerjaan, pembatalan kooperatif, status, hasil, dan pemulihan setelah restart.
- Approval yang mengikat ke tindakan tertentu dan memiliki masa berlaku.
- Activity/audit log, dashboard berdasarkan data nyata, penggunaan token dan estimasi biaya.
- Deployment Docker Compose, backup, dan prosedur restore yang diuji.

## Tahap berikutnya

Chat lanjutan, teams lintas divisi lanjutan, katalog skills, knowledge retrieval, dokumen/upload, keputusan perusahaan, integrasi MCP, banyak provider, serta visual Virtual Office 3D/isometrik lengkap. Billing langganan, marketplace tools, voice/video, dan eksekusi shell bebas tidak termasuk MVP.

## Aturan bisnis utama

1. Semua data tenant terikat workspace. Membership pengguna diperiksa pada setiap operasi.
2. Task adalah pekerjaan bisnis; run adalah percobaan eksekusi agent. Satu task dapat memiliki banyak run.
3. Agent adalah konfigurasi, bukan proses yang selalu hidup. Status bekerja berasal dari run aktif.
4. Run menyimpan snapshot konfigurasi agent dan referensi versi graph agar perubahan konfigurasi tidak mengubah pekerjaan yang sedang berjalan.
5. Model mengusulkan tindakan; server menentukan izin, approval, dan batas biaya.
6. Tidak ada output sukses palsu jika provider atau tool gagal. UI menampilkan error yang dapat ditindaklanjuti tanpa membocorkan credential.
7. Statistik dan grafik dihitung dari sumber data yang didefinisikan, bukan angka dari PNG.

## Kriteria keberhasilan MVP

Objective terjadwal melibatkan minimal dua divisi dan selesai tanpa interaksi manusia ketika policy mengizinkan; owner dapat memantau diskusi dan menghentikan dispatch; batas delegasi/budget diuji. Pengguna dapat menyelesaikan alur task hingga hasil; restart worker tidak menghilangkan state persisten; approval yang sama tidak memicu dua tindakan; pengguna workspace A tidak dapat membaca atau mengubah data workspace B; biaya yang belum diketahui ditampilkan sebagai tidak diketahui, bukan nol.

Target latency, jumlah pengguna bersamaan, availability, dan anggaran infrastruktur akan ditetapkan setelah spesifikasi server dan kebutuhan operasional tersedia.
