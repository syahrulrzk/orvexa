# Perusahaan AI autonomous

Status: arah produk dikonfirmasi pengguna pada 27 September 2026. Detail implementasi di bawah merupakan rancangan awal. Dokumen ini memperluas baseline menjadi virtual office dengan owner manusia, divisi, dan karyawan AI yang dapat berkoordinasi tanpa interaksi manusia pada setiap langkah.

## Struktur organisasi

Workspace mewakili perusahaan. Pengguna adalah Owner yang menetapkan tujuan, struktur organisasi, izin, dan budget. Divisi dapat ditambah/diubah; IT, Finance, Marketing, dan Sales adalah contoh awal, bukan daftar tetap.

Rancangan awal: Owner → Company Coordinator → Division Lead → Specialist Agents. Jabatan ini adalah peran organisasi, bukan role keamanan aplikasi. Agent berjabatan manager tidak mendapat permission admin atau akses semua credential.

Owner dapat membuat/menonaktifkan karyawan AI, menugaskan ke divisi, mengatur tools, menetapkan tujuan dan jadwal, memantau diskusi/hasil, serta menghentikan operasi. Karyawan AI memiliki identitas, peran, instruksi, model, divisi, kemampuan dan izin. Mereka tidak perlu login seperti anggota manusia dan tidak menjadi proses LLM yang terus aktif saat idle.

## Mode autonomous

Owner memberi mandat awal dan kebijakan. Sistem dapat memulai pekerjaan melalui tujuan owner, jadwal, atau event terautentikasi; agent berkoordinasi dan menyelesaikan pekerjaan yang diizinkan tanpa meminta balasan manusia setiap langkah.

Policy gate mempunyai tiga hasil: `allow` (lanjut otomatis), `require_approval` (tunggu owner/pihak berizin), dan `deny` (jangan eksekusi). Owner mengatur kebijakan per tool/tindakan/resource, termasuk batas nilai jika relevan. Aksi yang tidak punya kebijakan tidak otomatis diizinkan. Approval hanya untuk pengecualian yang memang ditentukan policy; jalur normal autonomous harus dapat selesai tanpa approval manual.

Mode autonomous tidak mengizinkan agent menaikkan permission, menciptakan credential, mengubah budget sendiri, atau menyetujui tindakan yang mensyaratkan owner. Owner dapat memilih kewenangan rutin yang disetujui di awal. Seluruh child run mewarisi batas kewenangan mandat asal dan dibatasi lagi oleh izin agent penerima.

## Diskusi dan delegasi

1. Coordinator menerima objective dan membagi pekerjaan menjadi task/subtask dengan keluaran dan penanggung jawab jelas.
2. Agent dapat mengirim `request`, `reply`, `delegate`, `result`, atau `escalate` kepada agent yang diizinkan.
3. Panggilan agent diproses sebagai pesan/job persisten, bukan pemanggilan fungsi rekursif tanpa batas.
4. Agent penerima mendapat konteks minimum sesuai akses. Diskusi lintas divisi tidak memberikan akses otomatis ke seluruh data divisi lain.
5. Hasil ditautkan ke task dan percakapan. Coordinator menilai hasil terhadap kriteria objective dan dapat meminta revisi dalam batas putaran.
6. Objective selesai jika kriteria tercapai; jika tidak, laporkan kegagalan atau eskalasi setelah limit/deadline tercapai.

Envelope pesan minimal: `id`, `workspaceId`, `objectiveId`, `conversationId`, `senderAgentId`, `recipientAgentId`, `parentMessageId`, `type`, `taskId`, `payload`, `idempotencyKey`, `expiresAt`. Validasi pengirim/penerima, akses, ukuran dan expiry di server. Pesan agent adalah data; isinya bukan sumber otorisasi.

Rooms menampilkan ringkasan diskusi kerja, keputusan, hasil tools yang aman, dan status. Chain-of-thought internal tidak disimpan sebagai percakapan publik. Owner dapat mengamati atau masuk memberi instruksi; intervensi dicatat dan berlaku pada batas langkah yang aman.

## Orkestrasi dan batas

LangGraph mengelola alur coordinator/specialist dan checkpoint. BullMQ mendistribusikan pekerjaan. Setiap child run memiliki thread sendiri, parent/root run, serta relasi delegation yang persisten. Satu run aktif per task tetap berlaku; delegasi membuat subtask, bukan run paralel pada task yang sama.

Batasi depth delegasi, jumlah child task, jumlah pesan, putaran revisi, concurrency, deadline dan total token/biaya objective. Semua agent berbagi ledger budget root; reservasi atomik mencegah setiap child menganggap budget penuh masih tersedia. Catat biaya aktual dan keterbatasan estimasi panggilan in-flight.

Deteksi siklus delegasi dan respons pesan duplikat. Parent yang menunggu hasil melepas worker; penyelesaian child memicu resume melalui outbox. Definisikan timeout, child failed/cancelled, dan partial result agar parent tidak menunggu selamanya.

Owner dapat pause/resume objective atau seluruh workspace. Pause menghentikan dispatch dan tindakan baru; tindakan in-flight berhenti secara kooperatif jika didukung. Cancel menyebar ke child run. Resume memeriksa izin dan budget kembali.

Trigger mempunyai timezone, dedupe key, retry, batas frekuensi dan kebijakan jadwal terlewat. Event masuk harus terautentikasi dan tidak boleh memilih workspace/agent tanpa otorisasi. MVP membuktikan satu scheduled objective; webhook eksternal dapat ditambahkan setelah sumber event ditetapkan.

## Model data tambahan MVP

| Entitas | Isi utama |
|---|---|
| divisions | workspace, nama, lead_agent_id, status |
| agent_assignments | agent, division, jabatan, reporting_to; cegah siklus reporting |
| objectives | tujuan owner, success criteria, status, budget, deadline, root_run_id |
| conversations / messages | ruang objective/divisi, participant, envelope pesan, visibility |
| delegations | parent_run, child_run, subtask, sender/recipient, depth, status |
| autonomy_policies | scope, action/tool/resource, decision, limits, version |
| triggers | objective template, schedule/event source, timezone, dedupe state, enabled |
| budget_reservations | root objective/run, child run, amount/tokens, state, settlement |

Semua relasi tetap dibatasi workspace dengan constraint dan pemeriksaan server. Task memperoleh `objective_id` dan `parent_task_id`; run memperoleh `root_run_id` dan `parent_run_id`. Audit membedakan aktor manusia, agent, dan scheduler.

## Kontrak API tambahan

Di bawah `/api/v1/workspaces/{workspaceId}`: CRUD `/divisions`, `/objectives`, `/autonomy-policies`, `/triggers`; baca `/conversations` dan `/conversations/{id}/messages`; POST `/objectives/{id}/pause`, `/resume`, `/cancel`; GET `/virtual-office` sebagai proyeksi divisi dan status agent.

Pengiriman pesan/delegasi internal memakai identitas worker/agent yang diturunkan dari run, bukan sender ID bebas dari browser. Endpoint mutasi tetap memakai permission, idempotency, audit dan outbox. Event tambahan: `agent.message_created`, `delegation.created`, `delegation.completed`, `objective.status_changed`, `budget.limit_reached`.

## Virtual Office MVP

Tampilkan divisi, daftar karyawan AI, jabatan, pekerjaan aktif, status idle/working/waiting/error, dan akses ke Rooms serta hasil. Mulai dari denah atau kartu divisi yang responsif. Bentuk 3D/isometrik lengkap mengikuti referensi menjadi peningkatan visual berikutnya; kemampuan organisasi dan koordinasi masuk MVP.

Struktur mendukung banyak divisi sejak awal. Demonstrasi awal memakai minimal dua divisi dan satu delegasi lintas divisi untuk membuktikan alur. Contoh usulan: Marketing menyusun rencana kampanye, Sales menilai kebutuhan prospek, Finance memberikan analisis budget, lalu coordinator menyusun rekomendasi. Contoh ini bukan izin mengirim kampanye atau memindahkan uang; tools dan tindakan nyata ditentukan dalam PRE-01.

## Acceptance criteria

- Owner membuat divisi dan menempatkan agent tanpa perubahan kode.
- Satu objective melibatkan coordinator dan specialist lintas minimal dua divisi, dengan diskusi dan hasil terlihat di Rooms.
- Scheduled objective berjalan hingga hasil tanpa pesan/approval manusia ketika semua tindakan memenuhi policy allow.
- Jalur require_approval berhenti dan jalur deny ditolak; agent tidak dapat mengubah keputusan policy.
- Restart, pesan duplikat, delegasi melingkar, child timeout dan budget habis ditangani dengan state yang dapat diaudit.
- Pause/cancel owner berlaku untuk dispatch parent/child; data tenant dan akses divisi terisolasi sesuai policy.
- Virtual Office menampilkan status dari run nyata, bukan animasi aktivitas palsu.
