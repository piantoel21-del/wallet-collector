# 📋 Changelog — Wallet Collector

> File ini mencatat fitur-fitur yang ditambahkan/diubah setiap update.
> Update tiap kali ada perubahan kode, biar gak lupa riwayatnya.

---

## [Unreleased] — Ide / Rencana

- TBD

---

## [v2.1] — 2026-07-22

### ✨ Fitur Baru

- **CHANGELOG.md** — File riwayat update fitur wallet collector, biar gak lupa setiap perubahan
- **API `/changelog`** — Endpoint REST `GET /changelog` untuk lihat riwayat update via HTTP
- **Telegram `/changelog`** — Command & tombol menu buat lihat changelog langsung dari bot wallet-collector

---

## [v2.0] — 2026-07-20

### ✨ Optimasi & Pipeline

- **Parallel Analyze** — Analisis wallet multi-thread biar cepet
- **Scoring Tuning** — Adjust bobot skor wallet biar lebih akurat
- **Pipeline** — Auto pipeline dari collect → analyze → classify
- **Filter** — Filter wallet berdasarkan threshold (min balance, min skor)
- **Monitoring** — Health check tiap jam, kirim alert error ke Telegram

### 🔧 Perbaikan
- Performa analisis ditingkatkan dengan parallel processing

---

## [v1.5] — 2026-07-19

### ✨ Klasifikasi & Menu

- **Auto-Classify** — Klasifikasi wallet otomatis tiap 12 jam via cron
- **Kategori Wallet** — Smart / Neutral / Bad berdasarkan skor & performa
- **Inline Keyboard** — Menu Telegram dengan tombol navigasi & tombol balik
- **API Server** — Endpoint REST `/api/smart-wallets` untuk integrasi Meridian

### 🔄 Perubahan
- Top 2 → Top 3 pools untuk cakupan lebih luas
- Single PM2 process untuk kedua pool

---

## [v1.0] — 2026-07-18

### ✨ Initial Release

- **Collect Wallet** — Deteksi & kumpulkan smart wallet dari Meteora DLMM via listener
- **Analisis** — Analisis PnL, balance, dan jumlah posisi tiap wallet (Helius RPC)
- **Skor Cerdas** — Scoring wallet berdasarkan balance, PnL, & aktivitas
- **Cron Reset** — Reset koleksi wallet tiap jam (PM2 restart) biar data fresh
- **Cron Analyze** — Analisis ulang tiap 2 jam
- **Blocklist** — Filter wallet & token yang diblokir (contoh: testicle, 9kfdB9UGFLoG)
- **Koneksi Kopi Susu** — Data wallet collector dikonsumsi kopi-susu buat copy trading
- **Statistik** — `wc-stats.py` untuk laporan statistik via CLI

---

## Format

Format catatan:

```
## [Versi] — YYYY-MM-DD

### ✨ Fitur Baru
- Deskripsi fitur

### 🔧 Perbaikan
- Deskripsi perbaikan

### 🔄 Perubahan
- Deskripsi perubahan konfigurasi / non-fitur
```
