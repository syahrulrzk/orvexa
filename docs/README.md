# Dokumentasi ORVEXA

Tanggal baseline: 27 September 2026. Status: roadmap v0.2 dengan build awal tersedia; lihat status aktual di bawah.

Dokumen ini membedakan keputusan arah teknologi, usulan implementasi, dan pertanyaan produk. Draft ini belum merupakan bukti bahwa integrasi stack telah diuji.

**Pantau progres implementasi di [Tasklist ORVEXA](TASKLIST.md)**: status per pekerjaan, dependensi, kriteria selesai, dan log progres.

**Kondisi aplikasi saat ini:** [Status build v0.1](10-build-status.md). Target pengguna adalah UMKM dengan fondasi perusahaan umum dan UI Indonesia/English.

## Urutan baca

1. [Kebutuhan produk dan ruang lingkup](01-product-requirements.md)
2. [Alur pengguna dan spesifikasi UI](02-user-flows-and-ui.md)
3. [Stack dan arsitektur](03-architecture.md)
4. [Model data dan akses](04-data-model.md)
5. [Kontrak API dan event](05-api-and-events.md)
6. [Eksekusi agent dan approval](06-agent-execution.md)
7. [Tahapan implementasi dan validasi](07-delivery-plan.md)
8. [Deployment dan operasi](08-operations.md)
9. [Perusahaan AI autonomous](09-autonomous-company.md)
10. [Status implementasi aktual](10-build-status.md)

## Keputusan dan asumsi

| Topik | Status | Baseline |
|---|---|---|
| Referensi UI | Tersedia | 18 PNG dalam `Menu Picture/`; 5 halaman telah ditinjau visual |
| Bahasa aplikasi | Arah disepakati | TypeScript untuk web, API, dan worker |
| Framework web | Arah pembahasan | SvelteKit |
| Runtime | Target, perlu validasi | Bun; Node.js menjadi fallback jika dependency tidak kompatibel |
| Orkestrasi AI | Target, perlu validasi | LangGraph JS di worker terpisah |
| Infrastruktur | Diketahui dari pengguna | Ubuntu dan Docker tersedia; spesifikasi belum diperiksa |
| Arah produk | Dikonfirmasi pengguna | Virtual office autonomous; owner manusia dan karyawan AI dalam banyak divisi |
| Model tenancy | Asumsi | Banyak workspace dengan isolasi data sejak awal |
| Penyedia model | Asumsi MVP | API provider eksternal; model lokal belum masuk baseline |
| Eksekusi tools | Asumsi MVP | Tools terdaftar dan dibatasi; tidak ada akses shell umum |
| Auth | Usulan belum dipilih | Library auth terpelihara; hindari membangun kriptografi/session sendiri |
| Pembayaran | Belum ditentukan | Di luar MVP; pencatatan biaya AI tetap masuk MVP |

## Pertanyaan terbuka

- Peluncuran pertama untuk satu perusahaan atau pelanggan SaaS publik?
- Apa satu pekerjaan nyata agent yang harus berhasil pada MVP?
- Berapa CPU, RAM, disk, kapasitas pengguna, dan jumlah agent berjalan bersamaan?
- Provider/model apa yang dipakai dan apakah credential milik platform atau masing-masing workspace?
- Metode login, kebutuhan SSO, domain aplikasi, dan email delivery?
- Target retensi data, backup, waktu pemulihan, dan kebutuhan penyimpanan dokumen?

Pertanyaan ini tidak menghalangi rancangan awal. Jawabannya harus dicatat sebelum komponen terkait diimplementasikan atau deployment produksi dilakukan.

## Aturan pemeliharaan

Perubahan perilaku aplikasi harus memperbarui dokumen terkait. Setiap keputusan besar dicatat di bagian keputusan arsitektur dengan alasan dan konsekuensinya. Versi dependency dipilih dan dikunci setelah compatibility spike; tidak memakai tag `latest` untuk deployment produksi.
