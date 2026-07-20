#!/usr/bin/env python3
"""Generate comprehensive PDF documentation for wallet-collector"""

from fpdf import FPDF
from datetime import datetime
import json, os

# ─── Load real data ───────────────────────────────────────────────────────

WALLET_DIR = '/home/ubuntu/meridian/wallet-collector/wallet'
CLASS_FILE = '/home/ubuntu/meridian/wallet-collector/wallet-classification.json'
OUTPUT_FILE = '/home/ubuntu/meridian/wallet-collector/wallet-collector-docs.pdf'

FONT_DIR = '/usr/share/fonts/truetype/dejavu/'

# Count wallets
wallet_files = []
if os.path.isdir(WALLET_DIR):
    wallet_files = [f for f in os.listdir(WALLET_DIR) if f.endswith('.json')]

# Load classification if exists
classification = {}
if os.path.exists(CLASS_FILE):
    classification = json.load(open(CLASS_FILE))

smart_count = classification.get('smart', 0)
neutral_count = classification.get('neutral', 0)
bad_count = classification.get('bad', 0)
total_classified = classification.get('totalWallets', 0)
classified_at = classification.get('classifiedAt', 'N/A')

# Load top wallets
smart_wallets = classification.get('smartWallets', [])[:10]

# ─── PDF ──────────────────────────────────────────────────────────────────

class PDF(FPDF):
    def __init__(self):
        super().__init__()
        # Add Unicode fonts
        self.add_font('DejaVu', '', os.path.join(FONT_DIR, 'DejaVuSans.ttf'))
        self.add_font('DejaVu', 'B', os.path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'))
        self.add_font('DejaVuMono', '', os.path.join(FONT_DIR, 'DejaVuSansMono.ttf'))
        self.add_font('DejaVuMono', 'B', os.path.join(FONT_DIR, 'DejaVuSansMono-Bold.ttf'))
        self.add_font('DejaVuSerif', '', os.path.join(FONT_DIR, 'DejaVuSerif.ttf'))
        self.add_font('DejaVuSerif', 'B', os.path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf'))
        self.set_font('DejaVu', '', 8.5)

    def header(self):
        if self.page_no() > 1:
            self.set_font('DejaVu', '', 6)
            self.set_text_color(100, 100, 100)
            self.cell(0, 8, 'Wallet Collector - Dokumentasi Teknis', align='R')
            self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font('DejaVu', '', 6)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f'Halaman {self.page_no()}/{{nb}}', align='C')

    def section_title(self, title):
        self.set_font('DejaVu', 'B', 12)
        self.set_text_color(0, 100, 180)
        self.cell(0, 10, title)
        self.ln(7)
        self.set_draw_color(0, 100, 180)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def sub_title(self, title):
        self.set_font('DejaVu', 'B', 10)
        self.set_text_color(50, 50, 50)
        self.cell(0, 8, title)
        self.ln(6)

    def body_text(self, text):
        self.set_font('DejaVu', '', 8.5)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 4.2, text)
        self.ln(1)

    def code_block(self, text):
        self.set_font('DejaVuMono', '', 7)
        self.set_text_color(180, 30, 30)
        self.set_fill_color(245, 245, 245)
        self.set_draw_color(200, 200, 200)
        self.multi_cell(0, 3.5, text, border=1, fill=True)
        self.ln(2)
        self.set_text_color(30, 30, 30)

    def bullet(self, text, indent=15):
        self.set_font('DejaVu', '', 8.5)
        self.set_text_color(30, 30, 30)
        self.set_x(self.l_margin + indent)
        self.multi_cell(self.w - self.l_margin - self.r_margin - indent, 4.2, '- ' + text)

    def key_value(self, key, value, indent=15):
        x = self.get_x()
        self.set_x(x + indent)
        self.set_font('DejaVu', 'B', 9)
        self.set_text_color(0, 80, 160)
        kw = self.get_string_width(key + ': ') + 2
        self.cell(kw, 4.5, key + ': ')
        self.set_font('DejaVu', '', 9)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 4.5, value)


pdf = PDF()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)

# ══════════════════════════════════════════════════════════════════════════
# PAGE 1 - COVER
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.ln(30)
pdf.set_font('DejaVu', 'B', 28)
pdf.set_text_color(0, 80, 160)
pdf.cell(0, 15, 'Wallet Collector', align='C')
pdf.ln(12)
pdf.set_font('DejaVu', '', 14)
pdf.set_text_color(80, 80, 80)
pdf.cell(0, 8, 'Meteora DLMM - LP Wallet Intelligence System', align='C')
pdf.ln(20)

# Decorative line
pdf.set_draw_color(0, 120, 200)
pdf.set_line_width(0.8)
pdf.line(60, pdf.get_y(), 150, pdf.get_y())
pdf.ln(15)

# Info table
pdf.set_font('DejaVu', '', 10)
pdf.set_text_color(50, 50, 50)
info_items = [
    ('Project', 'Wallet Collector / piantoel21-del/wallet-collector'),
    ('Version', '1.0.0'),
    ('Platform', 'Solana - Meteora DLMM'),
    ('Bahasa', 'Node.js (ESM) + Python'),
    ('Port API', '3456 (localhost only)'),
    ('Manajemen', 'PM2 - wallet-collector'),
    ('Tanggal Dokumen', datetime.now().strftime('%d %B %Y')),
]
for key, val in info_items:
    pdf.set_font('DejaVu', 'B', 10)
    pdf.set_text_color(0, 80, 160)
    kw = pdf.get_string_width(key + ': ') + 2
    pdf.cell(kw, 7, key + ': ')
    pdf.set_font('DejaVu', '', 10)
    pdf.set_text_color(50, 50, 50)
    pdf.cell(0, 7, val)
    pdf.ln(7)

pdf.ln(15)

# Live stats box
pdf.set_fill_color(235, 245, 255)
pdf.set_draw_color(0, 120, 200)
pdf.rect(15, pdf.get_y(), 180, 35, style='DF')
pdf.set_xy(20, pdf.get_y() + 3)
pdf.set_font('DejaVu', 'B', 10)
pdf.set_text_color(0, 80, 160)
pdf.cell(0, 6, 'LIVE STATISTICS')
pdf.ln(8)
pdf.set_x(20)
pdf.set_font('DejaVu', '', 9)
pdf.set_text_color(30, 30, 30)

stats = [
    (f'{len(wallet_files)}', 'Wallet Files'),
    (f'{total_classified}', 'Total Classified'),
    (f'{smart_count}', 'SMART'),
    (f'{neutral_count}', 'NEUTRAL'),
    (f'{bad_count}', 'BAD'),
]
col_w = 180 / len(stats)
for val, label in stats:
    pdf.set_font('DejaVu', 'B', 16)
    pdf.set_text_color(0, 120, 200)
    pdf.cell(col_w, 8, val, align='C')
pdf.ln(9)
pdf.set_x(20)
for val, label in stats:
    pdf.set_font('DejaVu', '', 7)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(col_w, 5, label, align='C')

# ══════════════════════════════════════════════════════════════════════════
# PAGE 2 - TABLE OF CONTENTS
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.section_title('Daftar Isi')
pdf.ln(5)

toc = [
    ('1', 'Arsitektur Sistem'),
    ('2', 'Komponen & Alur Data'),
    ('2.1', '  index.js  - Entry Point & Pool Selection'),
    ('2.2', '  listener.js  - On-Chain Listener'),
    ('2.3', '  analyze.js  - Deep Wallet Analysis'),
    ('2.4', '  classify.js  - Scoring & Classification'),
    ('2.5', '  api-server.js  - HTTP API untuk Meridian'),
    ('2.6', '  generate-pdf.py  - Laporan PDF Statistik'),
    ('3', 'Scoring Algorithm'),
    ('4', 'API Reference'),
    ('5', 'Integrasi dengan Meridian'),
    ('6', 'Cron Jobs & Automation'),
    ('7', 'Struktur File'),
]
for num, title in toc:
    if '.' not in num:
        pdf.set_font('DejaVu', 'B', 10)
        pdf.set_text_color(0, 80, 160)
    else:
        pdf.set_font('DejaVu', '', 9)
        pdf.set_text_color(50, 50, 50)
    pdf.cell(10, 6, num)
    pdf.cell(0, 6, title)
    pdf.ln(6)

# ══════════════════════════════════════════════════════════════════════════
# PAGE 3 - ARSITEKTUR
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.section_title('1. Arsitektur Sistem')

pdf.body_text(
    'Wallet Collector adalah sistem monitoring wallet LP (Liquidity Provider) '
    'di protokol Meteora DLMM (Dynamic Liquidity Market Maker) pada blockchain Solana. '
    'Sistem bekerja secara real-time dengan mendengarkan transaksi on-chain dari pool '
    'Meteora teratas untuk mengidentifikasi, menganalisis, dan mengklasifikasikan wallet '
    'yang aktif melakukan liquidity providing.'
)

pdf.sub_title('Diagram Arsitektur')
pdf.code_block(
    '┌─────────────────────────────────────────────────────────────────────┐\n'
    '│                       SOLANA BLOCKCHAIN                             │\n'
    '└────────────────────────┬────────────────────────────────────────────┘\n'
    '                         │\n'
    '                         v\n'
    '┌────────────────────────────────────────────────────────────────────┐\n'
    '│  index.js (PM2)                                                    │\n'
    '│  - Fetch top 5 pools from DLMM API                                 │\n'
    '│  - Start listener.js dengan pool terpilih                          │\n'
    '└────────────────────────┬───────────────────────────────────────────┘\n'
    '                         │\n'
    '                         v\n'
    '┌────────────────────────────────────────────────────────────────────┐\n'
    '│  listener.js                                                       │\n'
    '│  - Subscribe logs on-chain (WebSocket via @solana/web3.js)          │\n'
    '│  - Batch process transaksi tiap 5 detik                             │\n'
    '│  - Filter: hanya wallet dengan open LP positions                    │\n'
    '│  - Simpan ke wallet/{address}.json                                 │\n'
    '│  - Telegram bot untuk interaksi manual                              │\n'
    '│  - Start API server di port 3456                                    │\n'
    '└────────────────────────┬───────────────────────────────────────────┘\n'
    '                         │\n'
    '          ┌──────────────┼────────────────┐\n'
    '          v              v                v\n'
    '┌──────────────┐ ┌──────────────┐ ┌──────────────────┐\n'
    '│ analyze.js   │ │ classify.js  │ │ api-server.js    │\n'
    '│ (one-shot)   │ │ (tiap 12 jam)│ │ (always on)      │\n'
    '│              │ │              │ │                  │\n'
    '│ Deep wallet  │ │ Score &      │ │ Serve SMART      │\n'
    '│ analysis dari│ │ label wallet │ │ wallets ke       │\n'
    '│ DLMM API     │ │ SMART/NEU-   │ │ Meridian via     │\n'
    '│ → wallet/    │ │ TRAL/BAD     │ │ HTTP :3456       │\n'
    '└──────────────┘ └──────────────┘ └──────────────────┘\n'
)

# ══════════════════════════════════════════════════════════════════════════
# PAGE 4 - KOMPONEN & ALUR DATA
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.section_title('2. Komponen & Alur Data')

# 2.1
pdf.sub_title('2.1  index.js  - Entry Point & Pool Selection')
pdf.body_text(
    'File utama yang dijalankan oleh PM2. Bertanggung jawab memilih pool Meteora '
    'teratas dan memulai listener.'
)
pdf.body_text('Alur kerja:')
pdf.bullet('Fetch pool dari https://dlmm.datapi.meteora.ag/pools, sorted by fee_24h:desc')
pdf.bullet('Filter pool: non-blacklisted, TVL >= $1000, bukan pool USDC/USDT/HYPE')
pdf.bullet('Ambil TOP_N=5 pool teratas (default)')
pdf.bullet('Jika argumen --pool=1,2 diberikan, pilih pool berdasarkan indeks')
pdf.bullet('Start listener.js dengan pool terpilih')
pdf.ln(2)
pdf.body_text('Config penting:')
pdf.code_block(
    'DLMM_API   = https://dlmm.datapi.meteora.ag\n'
    'PAGE_SIZE  = 100\n'
    'SORT_BY    = fee_24h:desc\n'
    'FILTER_BY  = is_blacklisted=false\n'
    'MIN_TVL    = $1,000\n'
    'IGNORE     = USDC, USDT, HYPE\n'
    'TOP_N      = 5\n'
)

# 2.2
pdf.sub_title('2.2  listener.js  - On-Chain Listener')
pdf.body_text(
    'Komponen inti yang berjalan terus-menerus. Mendengarkan transaksi on-chain '
    'dari pool Meteora yang dipilih menggunakan WebSocket connection ke Solana RPC.'
)
pdf.body_text('Fungsi utama:')

pdf.set_font('DejaVu', 'B', 9)
pdf.set_text_color(0, 80, 160)
pdf.cell(0, 5, 'A. Subscription Logs')
pdf.ln(5)
pdf.set_font('DejaVu', '', 9)
pdf.set_text_color(30, 30, 30)
pdf.body_text(
    '  conn.onLogs(poolAddress, callback, "confirmed")  - mendengarkan semua log '
    'transaksi yang terjadi di pool address. Setiap signature dikumpulkan ke '
    'Set pendingSigs untuk diproses batch.'
)

pdf.set_font('DejaVu', 'B', 9)
pdf.set_text_color(0, 80, 160)
pdf.cell(0, 5, 'B. Batch Processing (setiap 5 detik)')
pdf.ln(5)
pdf.set_font('DejaVu', '', 9)
pdf.set_text_color(30, 30, 30)
pdf.body_text(
    '  processBatch() mengambil batch signature dari pendingSigs, melakukan '
    'getParsedTransaction untuk setiap signature, mengekstrak accountKeys, '
    'dan mencari signer (akun penandatangan transaksi).'
)
pdf.body_text(
    '  Kriteria penyimpanan: hanya wallet yang memiliki open LP positions '
    '(dicek via DLMM API /portfolio/open) yang disimpan. Wallet tanpa posisi '
    'LP dilewati.'
)

pdf.set_font('DejaVu', 'B', 9)
pdf.set_text_color(0, 80, 160)
pdf.cell(0, 5, 'C. Data yang Disimpan per Wallet')
pdf.ln(5)
pdf.set_font('DejaVu', '', 9)
pdf.set_text_color(30, 30, 30)
pdf.body_text(
    '  Setiap wallet disimpan sebagai file JSON di wallet/{address}.json dengan struktur:'
)
pdf.code_block(
    '{\n'
    '  address:       string         // alamat Solana\n'
    '  firstSeen:     timestamp      // pertama kali terdeteksi\n'
    '  lastSeen:      timestamp      // terakhir terlihat\n'
    '  firstTx:       string         // signature transaksi pertama\n'
    '  sourcePool:    string         // nama pool asal\n'
    '  openPositions: object         // response dari DLMM API\n'
    '  summary: {\n'
    '    totalOpenPositions: number\n'
    '    totalOpenPools:     number\n'
    '    balancesUsd:        number\n'
    '    unclaimedFeesUsd:   number\n'
    '    pnlUsd:             number\n'
    '    pnlPct:             number\n'
    '    traderType:         string  // "active_lp"\n'
    '  },\n'
    '  pools: [{\n'
    '    address, tokenX, tokenY, balances,\n'
    '    unclaimedFees, pnl, pnlPct,\n'
    '    totalDeposit, openPositionCount,\n'
    '    outOfRange, strategy\n'
    '  }]\n'
    '}'
)

pdf.set_font('DejaVu', 'B', 9)
pdf.set_text_color(0, 80, 160)
pdf.cell(0, 5, 'D. Telegram Bot')
pdf.ln(5)
pdf.set_font('DejaVu', '', 9)
pdf.set_text_color(30, 30, 30)
pdf.body_text(
    '  listener.js juga menjalankan bot Telegram polling (setiap 5 detik) untuk '
    'interaksi manual. Command: /start, /wallets, /wallet <addr>, /stats, '
    '/classify, /analyze, /top, /help. Bot menggunakan inline keyboard untuk '
    'navigasi menu.'
)

# ══════════════════════════════════════════════════════════════════════════
# PAGE 5 - ANALYZE & CLASSIFY
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.sub_title('2.3  analyze.js  - Deep Wallet Analysis')

pdf.body_text(
    'Script one-shot untuk menganalisis ulang semua wallet yang sudah terkumpul. '
    'Berbeda dengan listener yang menyimpan data seadanya saat pertama kali wallet '
    'terdeteksi, analyze.js melakukan analisis mendalam dengan memanggil DLMM API '
    'untuk data open dan closed positions.'
)

pdf.body_text('Alur kerja:')
pdf.bullet('Baca daftar wallet dari collected-wallets.json')
pdf.bullet('Untuk setiap wallet:')
pdf.bullet('  Fetch open positions dari /portfolio/open (20 pool teratas)', indent=25)
pdf.bullet('  Fetch closed positions dari /portfolio (90 hari ke belakang)', indent=25)
pdf.bullet('  Hitung total PnL (open + closed)', indent=25)
pdf.bullet('  Tentukan traderType: bid_ask_trader / passive_lp / active_lp / former_lp / swapper', indent=25)
pdf.bullet('  Hitung ROI berdasarkan total deposit', indent=25)
pdf.bullet('Delay 500ms antar wallet untuk menghindari rate limit')
pdf.bullet('Simpan wallet-analysis.json (summary index)')
pdf.ln(2)

pdf.body_text('Trader type classification:')
pdf.code_block(
    'Strategi mengandung "bid_ask"     → bid_ask_trader\n'
    'Strategi mengandung "wide_curve"  → passive_lp\n'
    'Ada open positions (>0)           → active_lp\n'
    'Hanya closed positions            → former_lp\n'
    'Tidak ada posisi sama sekali      → swapper'
)

# 2.4
pdf.sub_title('2.4  classify.js  - Scoring & Classification')

pdf.body_text(
    'Script klasifikasi yang membaca semua file wallet dari folder wallet/, '
    'menghitung skor untuk masing-masing, dan mengelompokkannya ke dalam 3 kategori: '
    'SMART (skor >= 60), NEUTRAL (skor 30-59), BAD (skor < 30). '
    'Dijalankan secara otomatis tiap 12 jam via cron job (Hermes cron).'
)

pdf.body_text('Alur kerja:')
pdf.bullet('Scan semua file .json di folder wallet/')
pdf.bullet('Hitung skor menggunakan scoreWallet() - scoring algorithm (lihat Bagian 3)')
pdf.bullet('Kategorikan: SMART (>=60), NEUTRAL (30-59), BAD (<30)')
pdf.bullet('Sortir descending by skor')
pdf.bullet('Simpan wallet-classification.json dengan 3 list wallet')
pdf.ln(2)

pdf.body_text('Catatan penting:')
pdf.bullet('Zero RPC calls - 100% lokal, baca file JSON saja')
pdf.bullet('Aman dijalankan kapanpun, tidak mempengaruhi rate limit')
pdf.bullet('File classification digunakan sebagai snapshot statis, sementara API server '
           'tetap serve data real-time langsung dari wallet/ folder')

# ══════════════════════════════════════════════════════════════════════════
# PAGE 6 - API SERVER
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.sub_title('2.5  api-server.js  - HTTP API untuk Meridian')

pdf.body_text(
    'HTTP server ringan (native Node.js http module, tanpa framework) yang berjalan '
    'di localhost:3456. Menyediakan endpoint REST untuk membaca data smart wallet '
    'yang siap dikonsumsi oleh Meridian.'
)

pdf.body_text('Cara kerja:')
pdf.bullet('Listener.js memanggil startApiServer() saat boot')
pdf.bullet('Setiap request ke /api/smart-wallets memicu classifyWallets()')
pdf.bullet('classifyWallets() baca semua file di wallet/ dan hitung skor')
pdf.bullet('Hanya wallet dengan skor >= 60 yang dikembalikan')
pdf.bullet('Cache 1 menit untuk menghindari baca disk berulang')
pdf.ln(2)

pdf.body_text('Response format /api/smart-wallets:')
pdf.code_block(
    '{\n'
    '  "wallets": [{\n'
    '    "name":       "wc-2C85Bu88",     // prefix wc- + 8 char address\n'
    '    "address":    "2C85Bu88...",      // full Solana address\n'
    '    "category":   "collected",        // selalu "collected"\n'
    '    "type":       "lp",               // selalu "lp"\n'
    '    "source":     "wallet-collector",  // identifier source\n'
    '    "skor":       90,                 // numeric score\n'
    '    "pnlUsd":     201.20,             // profit/loss in USD\n'
    '    "balancesUsd":10195.45,           // total balance USD\n'
    '    "positions":  13,                 // open positions count\n'
    '    "addedAt":    "2026-07-20T..."    // timestamp\n'
    '  }],\n'
    '  "total":      44,                   // total smart wallets\n'
    '  "updatedAt":  "2026-07-20T..."     // last cache refresh\n'
    '}'
)

# 2.6
pdf.sub_title('2.6  generate-pdf.py  - Laporan PDF Statistik')

pdf.body_text(
    'Script Python untuk menghasilkan laporan visual PDF dengan grafik dan tabel '
    'statistik wallet. Menggunakan matplotlib dengan dark theme. '
    'Output: wallet-stats.pdf'
)

# ══════════════════════════════════════════════════════════════════════════
# PAGE 7 - SCORING ALGORITHM
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.section_title('3. Scoring Algorithm')

pdf.body_text(
    'Setiap wallet dinilai menggunakan sistem point-based scoring. Skor total '
    'adalah akumulasi dari positive signals dikurangi negative signals. '
    'Rentang teoritis: -115 hingga +145. Threshold: SMART >= 60, NEUTRAL 30-59, BAD < 30.'
)

pdf.sub_title('Positive Signals')

# Table: Positive signals
pdf.set_font('DejaVu', 'B', 8)
pdf.set_fill_color(230, 245, 230)
pdf.set_draw_color(100, 180, 100)
col_w = [60, 40, 85]
headers = ['Kondisi', 'Poin', 'Contoh']
pdf.cell(col_w[0], 6, headers[0], border=1, fill=True)
pdf.cell(col_w[1], 6, headers[1], border=1, fill=True)
pdf.cell(col_w[2], 6, headers[2], border=1, fill=True)
pdf.ln()

pos_signals = [
    ('PnL positif', '+25', 'PnL = $500 → +25'),
    ('PnL > $10,000', '+15 (additional)', '+$12,000 → +25+15 = +40'),
    ('PnL > $1,000', '+10 (additional)', '+$1,500 → +25+10 = +35'),
    ('Balance > $50,000', '+25', 'Balance = $100K → +25'),
    ('Balance > $10,000', '+20', 'Balance = $25K → +20'),
    ('Balance > $1,000', '+15', 'Balance = $5K → +15'),
    ('Balance > $100', '+5', 'Balance = $500 → +5'),
    ('Open positions >= 10', '+25', '15 positions → +25'),
    ('Open positions >= 5', '+20', '7 positions → +20'),
    ('Open positions >= 3', '+10', '3 positions → +10'),
    ('Total positions >= 20', '+15', '30 total pos → +15'),
    ('Total positions >= 10', '+10', '12 total pos → +10'),
    ('ROI > 50%', '+20', 'ROI = 75% → +20'),
    ('ROI > 20%', '+15', 'ROI = 35% → +15'),
    ('ROI > 10%', '+10', 'ROI = 15% → +10'),
    ('ROI > 5%', '+5', 'ROI = 8% → +5'),
    ('Trader: active_lp / bid_ask', '+10', 'active_lp → +10'),
    ('Trader: passive_lp', '+5', 'passive_lp → +5'),
    ('Multi-strategi (>=2)', '+10', 'Strategi > 1 → +10'),
]

pdf.set_font('DejaVu', '', 7.5)
for row in pos_signals:
    pdf.set_fill_color(245, 255, 245)
    pdf.cell(col_w[0], 5, row[0], border=1, fill=True)
    pdf.cell(col_w[1], 5, row[1], border=1, align='C', fill=True)
    pdf.cell(col_w[2], 5, row[2], border=1, fill=True)
    pdf.ln()

pdf.ln(3)
pdf.sub_title('Negative Signals')

pdf.set_font('DejaVu', 'B', 8)
pdf.set_fill_color(255, 230, 230)
pdf.set_draw_color(200, 100, 100)
pdf.cell(col_w[0], 6, headers[0], border=1, fill=True)
pdf.cell(col_w[1], 6, headers[1], border=1, fill=True)
pdf.cell(col_w[2], 6, headers[2], border=1, fill=True)
pdf.ln()

neg_signals = [
    ('PnL negatif (rugi)', '-30', 'PnL = -$500 → -30'),
    ('PnL < -$10,000', '-20 (additional)', 'Rugi $15K → -30-20 = -50'),
    ('PnL < -$1,000', '-10 (additional)', 'Rugi $2K → -30-10 = -40'),
    ('Balance < $100', '-20', 'Balance = $50 → -20'),
    ('ROI < -50%', '-20', 'ROI = -60% → -20'),
    ('ROI < -20%', '-15', 'ROI = -30% → -15'),
    ('ROI < -10%', '-10', 'ROI = -15% → -10'),
    ('Tanpa posisi (0 open & closed)', '-15', 'Wallet baru tanpa aktivitas'),
    ('Trader: swapper / former_lp', '-10', 'Bukan LP aktif'),
]

pdf.set_font('DejaVu', '', 7.5)
for row in neg_signals:
    pdf.set_fill_color(255, 245, 245)
    pdf.cell(col_w[0], 5, row[0], border=1, fill=True)
    pdf.cell(col_w[1], 5, row[1], border=1, align='C', fill=True)
    pdf.cell(col_w[2], 5, row[2], border=1, fill=True)
    pdf.ln()

pdf.ln(5)
pdf.sub_title('Kategori Final')
pdf.code_block(
    '  Skor >= 60    →  SMART   ([GREEN])  - Wallet dengan performa baik\n'
    '  Skor 30 - 59  →  NEUTRAL ([YELLOW])  - Performa rata-rata\n'
    '  Skor < 30     →  BAD     ([RED])  - Wallet berkinerja buruk'
)

# ══════════════════════════════════════════════════════════════════════════
# PAGE 8 - API REFERENCE
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.section_title('4. API Reference')

pdf.body_text(
    'Semua endpoint berjalan di localhost:3456, hanya dapat diakses dari server '
    'yang sama. CORS di-set untuk origin apapun. Format response: JSON.'
)

endpoints = [
    ('GET /health', 'Health check', 
     '{"status": "ok", "uptime": 1234.56}'),
    ('GET /api/smart-wallets', 
     'Daftar SMART wallets (skor >= 60) - format untuk Meridian. Cache 1 menit.',
     '{"wallets": [...], "total": 44, "updatedAt": "..."}'),
    ('GET /api/smart-wallets/raw',
     'Sama seperti smart-wallets, tanpa cache - selalu fresh dari disk.',
     '{"wallets": [...], "total": 44, "updatedAt": "..."}'),
]

pdf.set_font('DejaVu', 'B', 8)
pdf.set_fill_color(230, 240, 250)
pdf.set_draw_color(0, 120, 200)
cols = [40, 145]
pdf.cell(cols[0], 6, 'Endpoint', border=1, fill=True)
pdf.cell(cols[1], 6, 'Deskripsi', border=1, fill=True)
pdf.ln()

pdf.set_font('DejaVu', '', 8)
for ep, desc, resp in endpoints:
    pdf.set_fill_color(245, 250, 255)
    y_start = pdf.get_y()
    pdf.cell(cols[0], 5, ep, border=1, fill=True)
    pdf.cell(cols[1], 5, desc, border=1, fill=True)
    pdf.ln()
    pdf.set_x(15)
    pdf.set_font('DejaVuMono', '', 6.5)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(170, 3.5, 'Response: ' + resp, border=1, fill=True)
    pdf.set_font('DejaVu', '', 8)
    pdf.set_text_color(30, 30, 30)
    pdf.ln(2)

pdf.ln(5)
pdf.sub_title('Error Response')
pdf.code_block(
    '404 - Not Found\n'
    '{"error": "Not found", "paths": ["/health", "/api/smart-wallets", "/api/smart-wallets/raw"]}'
)

# ══════════════════════════════════════════════════════════════════════════
# PAGE 9 - INTEGRASI MERIDIAN
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.section_title('5. Integrasi dengan Meridian')

pdf.body_text(
    'Meridian (autonomous DLMM liquidity provider agent) mengkonsumsi data smart '
    'wallet dari wallet-collector melalui file smart-wallets.js. '
    'Integrasi ini memungkinkan Meridian untuk:\n'
    '  1. Mendapatkan daftar smart wallet terkini sebelum screening pool\n'
    '  2. Mengecek apakah smart wallet tertentu ada di pool yang sedang di-screening\n'
    '  3. Menggunakan sinyal confidence boost jika smart wallet masuk pool'
)

pdf.sub_title('Alur Data: Wallet Collector → Meridian')
pdf.code_block(
    '┌─wallet-collector─────────────┐     ┌─Meridian───────────────────────┐\n'
    '│                              │     │                               │\n'
    '│  342 wallet files di wallet/ │     │  Screening pool baru           │\n'
    '│       ↓ classify.js          │     │       ↓                       │\n'
    '│  44 SMART wallets            │     │  checkSmartWalletsOnPool()     │\n'
    '│       ↓ api-server.js        │     │       ↓                       │\n'
    '│  GET /api/smart-wallets ─────┼────>│  fetch :3456/api/smart-wallets│\n'
    '│  localhost:3456              │     │       ↓                       │\n'
    '│                              │     │  Merge local + collected       │\n'
    '│                              │     │       ↓                       │\n'
    '│                              │     │  Cek positions on-chain        │\n'
    '│                              │     │       ↓                       │\n'
    '│                              │     │  confidence_boost = true/false│\n'
    '│                              │     │  signal: "2/44 smart wallets  │\n'
    '│                              │     │          in this pool!"       │\n'
    '└──────────────────────────────┘     └───────────────────────────────┘'
)

pdf.ln(3)
pdf.sub_title('smart-wallets.js (Meridian)')
pdf.body_text(
    'File ini mengelola fetching dan caching wallet dari collector. Detail:'
)
pdf.bullet('fetchCollectorSmartWallets() - fetch GET /api/smart-wallets tiap 1 menit')
pdf.bullet('mergeWallets() - gabung local + collected, dedup by address')
pdf.bullet('checkSmartWalletsOnPool() - untuk setiap wallet yg di-track, cek positions via getWalletPositions()')
pdf.bullet('Filter hanya wallet dengan type="lp" untuk screening')
pdf.bullet('Fallback: jika collector offline, pakai local wallets saja')
pdf.bullet('Cache wallet positions 5 menit via Map() untuk efisiensi')

pdf.ln(3)
pdf.sub_title('Response checkSmartWalletsOnPool()')
pdf.code_block(
    '{\n'
    '  pool:              "pool_address...",\n'
    '  tracked_wallets:   44,\n'
    '  in_pool: [{\n'
    '    name:     "wc-xxxxxx",\n'
    '    category: "collected",\n'
    '    address:  "wallet_address..."\n'
    '  }],\n'
    '  confidence_boost:  true,\n'
    '  signal: "2/44 smart wallet(s) are in this pool\n'
    '           (2 from wallet-collector) - STRONG signal"\n'
    '}'
)

# ══════════════════════════════════════════════════════════════════════════
# PAGE 10 - CRON JOBS & FILE STRUCTURE
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.section_title('6. Cron Jobs & Automation')

cron_jobs = [
    ('wallet-collector-classify', '0 */12 * * *', 'Jalankan classify.js tiap 12 jam (00:00 & 12:00 WIB) untuk update wallet-classification.json'),
    ('wallet-collector-reset', '0 * * * *', 'Restart PM2 wallet-collector tiap jam agar fetch fresh top pools & kumpulkan wallet baru'),
]

pdf.set_font('DejaVu', 'B', 8)
pdf.set_fill_color(230, 230, 250)
cols = [40, 25, 120]
pdf.cell(cols[0], 6, 'Nama', border=1, fill=True)
pdf.cell(cols[1], 6, 'Jadwal', border=1, fill=True)
pdf.cell(cols[2], 6, 'Fungsi', border=1, fill=True)
pdf.ln()

pdf.set_font('DejaVu', '', 8)
for name, sched, desc in cron_jobs:
    pdf.set_fill_color(245, 245, 255)
    pdf.cell(cols[0], 9, name, border=1, fill=True)
    pdf.cell(cols[1], 9, sched, border=1, fill=True)
    pdf.cell(cols[2], 9, desc, border=1, fill=True)
    pdf.ln()

pdf.ln(8)
pdf.section_title('7. Struktur File')

pdf.set_font('DejaVuMono', '', 7.5)
files_structure = (
    'wallet-collector/\n'
    '├── index.js                 # Entry point (PM2), fetch pools, start listener\n'
    '├── listener.js              # On-chain listener, batch processor, Telegram bot\n'
    '├── analyze.js               # Deep wallet analysis (one-shot)\n'
    '├── classify.js              # Scoring & classification (cron tiap 12 jam)\n'
    '├── api-server.js            # HTTP API port 3456 (+ scoring logic)\n'
    '├── generate-pdf.py          # PDF report generator (matplotlib)\n'
    '├── generate-docs.py         # Dokumentasi ini\n'
    '│\n'
    '├── wallet/                  # Data wallet individual\n'
    '│   ├── 2C85Bu88....json     # {address, summary, pools[]}\n'
    '│   ├── 2hev2t5X....json\n'
    '│   └── ... (343 files)\n'
    '│\n'
    '├── collected-wallets.json   # Index daftar semua wallet (array of addresses)\n'
    '├── wallet-classification.json  # Hasil klasifikasi (SMART/NEUTRAL/BAD)\n'
    '├── wallet-analysis.json     # Summary hasil analisis batch\n'
    '├── wallet-stats.pdf         # Laporan PDF statistik\n'
    '│\n'
    '├── package.json             # Dependencies: @solana/web3.js, axios\n'
    '├── ecosystem.config.cjs     # PM2 config\n'
    '└── .env                     # RPC_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID\n'
    '\n'
    'Meridian (konsumen data):\n'
    'meridian/\n'
    '└── smart-wallets.js         # Fetch + cache + check wallet on pool\n'
    '└── smart-wallets.json       # Local manual wallets (fallback)\n'
)
pdf.multi_cell(0, 3.5, files_structure)

# ══════════════════════════════════════════════════════════════════════════
# PAGE 11 - LIVE DATA
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.section_title('Lampiran: Live Data Snapshot')
pdf.body_text(f'Data diambil pada: {datetime.now().strftime("%d %B %Y %H:%M:%S WIB")}')

pdf.sub_title(f'Top SMART Wallets ({len(smart_wallets)})')
pdf.set_font('DejaVu', 'B', 7.5)
pdf.set_fill_color(230, 245, 230)
pdf.set_draw_color(100, 180, 100)
cols = [8, 35, 45, 8, 22, 22, 10]
headers2 = ['#', 'Address', 'Type', 'Skor', 'PnL', 'Balance', 'Pos']
for i, c in enumerate(cols):
    pdf.cell(c, 6, headers2[i], border=1, fill=True, align='C')
pdf.ln()

pdf.set_font('DejaVuMono', '', 6.5)
for i, w in enumerate(smart_wallets[:15]):
    addr_short = w.get('address', '')[:8] + '...'
    skor = w.get('skor', 0)
    pnl = w.get('pnl', 0)
    balance = w.get('balance', 0)
    pos = w.get('positions', 0)
    trader_type = w.get('traderType', '?')[:10]
    
    if skor >= 100:
        pdf.set_fill_color(220, 255, 220)
    elif skor >= 80:
        pdf.set_fill_color(240, 255, 240)
    else:
        pdf.set_fill_color(250, 255, 250)
    
    row_h = 5
    pdf.cell(cols[0], row_h, str(i+1), border=1, fill=True, align='C')
    pdf.cell(cols[1], row_h, addr_short, border=1, fill=True)
    pdf.cell(cols[2], row_h, trader_type, border=1, fill=True)
    pdf.cell(cols[3], row_h, str(skor), border=1, fill=True, align='C')
    pdf.cell(cols[4], row_h, f'${pnl:.2f}', border=1, fill=True, align='R')
    pdf.cell(cols[5], row_h, f'${balance:.2f}', border=1, fill=True, align='R')
    pdf.cell(cols[6], row_h, str(pos), border=1, fill=True, align='C')
    pdf.ln()

# Summary footer
pdf.ln(10)
pdf.set_font('DejaVu', 'B', 9)
pdf.body_text(f'Total: {smart_count} SMART  |  {neutral_count} NEUTRAL  |  {bad_count} BAD  |  {total_classified} wallets terklasifikasi')

# ══════════════════════════════════════════════════════════════════════════
# PAGE 12 - GLOSSARY
# ══════════════════════════════════════════════════════════════════════════

pdf.add_page()
pdf.section_title('Lampiran: Glossary')

glossary = [
    ('DLMM', 'Dynamic Liquidity Market Maker - protokol Meteora untuk concentrated liquidity pool'),
    ('LP', 'Liquidity Provider - pengguna yang menyediakan likuiditas ke pool'),
    ('TVL', 'Total Value Locked - total nilai aset yang terkunci di pool'),
    ('PnL', 'Profit and Loss - keuntungan atau kerugian dari posisi LP'),
    ('ROI', 'Return on Investment - persentase return terhadap modal'),
    ('DLMM API', 'https://dlmm.datapi.meteora.ag - REST API resmi Meteora untuk data pool & portfolio'),
    ('Helius RPC', 'RPC endpoint Solana via Helius, digunakan untuk getParsedTransaction'),
    ('PM2', 'Process manager untuk Node.js - menjaga wallet-collector tetap hidup'),
    ('SMART Wallet', 'Wallet dengan skor >= 60 - performa baik, layak di-track'),
    ('NEUTRAL Wallet', 'Wallet dengan skor 30-59 - performa rata-rata'),
    ('BAD Wallet', 'Wallet dengan skor < 30 - performa buruk'),
    ('Meridian', 'Autonomous DLMM LP agent - konsumen utama data wallet-collector'),
    ('CORS', 'Cross-Origin Resource Sharing - di-set allow all untuk fleksibilitas'),
]

pdf.set_font('DejaVu', 'B', 8)
pdf.set_fill_color(230, 230, 250)
pdf.set_draw_color(100, 100, 180)
cols = [30, 155]
pdf.cell(cols[0], 6, 'Istilah', border=1, fill=True)
pdf.cell(cols[1], 6, 'Definisi', border=1, fill=True)
pdf.ln()

pdf.set_font('DejaVu', '', 8)
for term, defn in glossary:
    pdf.set_fill_color(248, 248, 255)
    pdf.cell(cols[0], 8, term, border=1, fill=True)
    pdf.cell(cols[1], 8, defn, border=1, fill=True)
    pdf.ln()

pdf.ln(15)
pdf.set_font('DejaVu', '', 8)
pdf.set_text_color(150, 150, 150)
pdf.cell(0, 5, 'Dokumen ini digenerate secara otomatis dari sistem live.', align='C')
pdf.ln(5)
pdf.cell(0, 5, 'Wallet Collector - Nous Research Hermes Agent', align='C')

# ─── Save PDF ────────────────────────────────────────────────────────────

pdf.output(OUTPUT_FILE)
print(f'PDF saved: {OUTPUT_FILE}')
print(f'Pages: {pdf.page_no()}')
