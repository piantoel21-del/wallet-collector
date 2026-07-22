import json, os, sys
from datetime import datetime
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.backends.backend_pdf import PdfPages

# ─── Config ────────────────────────────────────────────────────────────────
WALLET_DIR = '/home/ubuntu/meridian/wallet-collector/wallet'
CLASS_FILE = '/home/ubuntu/meridian/wallet-collector/wallet-classification.json'
OUTPUT_PDF = '/home/ubuntu/meridian/wallet-collector/wallet-stats.pdf'

# Set dark theme
plt.rcParams.update({
    'figure.facecolor': '#1a1a2e',
    'axes.facecolor': '#16213e',
    'axes.edgecolor': '#0f3460',
    'axes.labelcolor': '#e0e0e0',
    'text.color': '#e0e0e0',
    'xtick.color': '#a0a0a0',
    'ytick.color': '#a0a0a0',
    'grid.color': '#0f3460',
    'grid.alpha': 0.3,
    'legend.facecolor': '#1a1a2e',
    'legend.edgecolor': '#0f3460',
    'legend.labelcolor': '#e0e0e0',
})

# ─── Load Data ─────────────────────────────────────────────────────────────

def load_wallets():
    wallets = []
    if not os.path.exists(WALLET_DIR):
        return wallets
    for f in os.listdir(WALLET_DIR):
        if not f.endswith('.json'):
            continue
        try:
            with open(os.path.join(WALLET_DIR, f)) as fh:
                data = json.load(fh)
            addr = data.get('address', f.replace('.json', ''))
            s = data.get('summary', {})
            wallets.append({
                'address': addr,
                'pnl': float(s.get('pnlUsd', 0)),
                'balance': float(s.get('balancesUsd', 0)),
                'positions': s.get('totalOpenPositions', 0),
                'closed': s.get('totalClosedPositions', 0),
                'roi': float(s.get('roi', 0)),
                'fees': float(s.get('unclaimedFeesUsd', 0)),
                'type': s.get('traderType', 'unknown'),
                'pool': data.get('sourcePool', '?'),
            })
        except:
            pass
    return wallets

def load_classification():
    try:
        with open(CLASS_FILE) as f:
            return json.load(f)
    except:
        return None

# ─── Helper: short address ─────────────────────────────────────────────────

def short_addr(a, n=8):
    return a[:n] + '..'

# ─── Charts ────────────────────────────────────────────────────────────────

def chart_classification(cls, pdf):
    fig, ax = plt.subplots(figsize=(6, 4))
    labels = ['🟢 SMART', '🟡 NEUTRAL', '🔴 BAD']
    sizes = [cls['smart'], cls['neutral'], cls['bad']]
    colors = ['#00e676', '#ffd600', '#ff5252']
    explode = (0.05, 0, 0)
    wedges, texts, autotexts = ax.pie(sizes, explode=explode, labels=labels,
        colors=colors, autopct='%1.0f%%', startangle=90,
        textprops={'fontsize': 12, 'weight': 'bold'},
        pctdistance=0.75, wedgeprops={'linewidth': 2, 'edgecolor': '#1a1a2e'})
    for t in autotexts:
        t.set_color('white')
        t.set_fontsize(13)
    ax.set_title('Klasifikasi Wallet', fontsize=16, fontweight='bold', pad=20, color='#e0e0e0')
    # Legend
    total = sum(sizes)
    legend_texts = [f'{l}: {s} ({s/total*100:.0f}%)' for l, s in zip(labels, sizes)]
    ax.legend(legend_texts, loc='lower center', bbox_to_anchor=(0.5, -0.15),
              ncol=3, framealpha=0.8, fontsize=10)
    plt.tight_layout()
    pdf.savefig(fig)
    plt.close(fig)

def chart_top10_balance(wallets, pdf):
    top = sorted(wallets, key=lambda w: w['balance'], reverse=True)[:10]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    names = [short_addr(w['address']) for w in top]
    values = [w['balance'] for w in top]
    bars = ax.barh(names, values, color='#00e676', edgecolor='#00c853', height=0.6)
    for i, (bar, v) in enumerate(zip(bars, values)):
        ax.text(v + max(values)*0.01, bar.get_y() + bar.get_height()/2,
                f'${v:,.0f}', va='center', fontsize=9, color='#a0a0a0')
    ax.set_xlabel('Balance (USD)', fontsize=11)
    ax.set_title('Top 10 Wallet by Balance', fontsize=14, fontweight='bold', color='#e0e0e0')
    ax.invert_yaxis()
    ax.set_xlim(0, max(values) * 1.25)
    ax.tick_params(axis='y', labelsize=9)
    plt.tight_layout()
    pdf.savefig(fig)
    plt.close(fig)

def chart_top10_pnl(wallets, pdf):
    top = sorted(wallets, key=lambda w: abs(w['pnl']), reverse=True)[:10]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    names = [short_addr(w['address']) for w in top]
    values = [w['pnl'] for w in top]
    colors = ['#00e676' if v >= 0 else '#ff5252' for v in values]
    bars = ax.barh(names, values, color=colors, edgecolor='#1a1a2e', height=0.6)
    for bar, v in zip(bars, values):
        ax.text(v + (max(values) or 1)*0.02 if v >= 0 else v - (max(abs(v) for v in values) or 1)*0.15,
                bar.get_y() + bar.get_height()/2,
                f'${v:+,.0f}', va='center', fontsize=9, color='#a0a0a0')
    ax.axvline(0, color='white', linewidth=0.5)
    ax.set_xlabel('PnL (USD)', fontsize=11)
    ax.set_title('Top 10 Wallet by |PnL|', fontsize=14, fontweight='bold', color='#e0e0e0')
    ax.invert_yaxis()
    margin = max(abs(v) for v in values) * 0.2 or 100
    ax.set_xlim(-max(abs(v) for v in values) - margin, max(abs(v) for v in values) + margin)
    ax.tick_params(axis='y', labelsize=9)
    plt.tight_layout()
    pdf.savefig(fig)
    plt.close(fig)

def chart_trader_type(wallets, pdf):
    types = {}
    for w in wallets:
        t = w['type']
        types[t] = types.get(t, 0) + 1
    fig, ax = plt.subplots(figsize=(6, 4))
    labels = list(types.keys())
    sizes = list(types.values())
    colors_list = ['#00e676', '#448aff', '#ffd600', '#ff5252', '#ea80fc', '#64ffda']
    bars = ax.bar(labels, sizes, color=colors_list[:len(labels)], edgecolor='#1a1a2e', width=0.5)
    for bar, v in zip(bars, sizes):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3,
                str(v), ha='center', fontsize=12, fontweight='bold', color='#e0e0e0')
    ax.set_ylabel('Jumlah Wallet', fontsize=11)
    ax.set_title('Trader Distribution', fontsize=14, fontweight='bold', color='#e0e0e0')
    ax.tick_params(axis='x', rotation=15, labelsize=10)
    ax.set_ylim(0, max(sizes) * 1.2)
    plt.tight_layout()
    pdf.savefig(fig)
    plt.close(fig)

def chart_strategy_types(wallets, pdf):
    """Try to get strategy from individual wallet files"""
    strategies = {}
    for w in wallets:
        try:
            addr = w['address']
            fpath = os.path.join(WALLET_DIR, addr + '.json')
            if os.path.exists(fpath):
                with open(fpath) as f:
                    data = json.load(f)
                strats = data.get('summary', {}).get('strategies', [])
                for s in strats:
                    strategies[s] = strategies.get(s, 0) + 1
        except:
            pass
    if not strategies:
        return
    fig, ax = plt.subplots(figsize=(6, 4))
    labels = list(strategies.keys())
    sizes = list(strategies.values())
    colors_list = ['#00e676', '#448aff', '#ffd600', '#ea80fc', '#64ffda']
    bars = ax.bar(labels, sizes, color=colors_list[:len(labels)], edgecolor='#1a1a2e', width=0.5)
    for bar, v in zip(bars, sizes):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3,
                str(v), ha='center', fontsize=11, fontweight='bold', color='#e0e0e0')
    ax.set_ylabel('Jumlah Wallet', fontsize=11)
    ax.set_title('Strategi Distribution', fontsize=14, fontweight='bold', color='#e0e0e0')
    ax.tick_params(axis='x', rotation=15, labelsize=10)
    ax.set_ylim(0, max(sizes) * 1.2)
    plt.tight_layout()
    pdf.savefig(fig)
    plt.close(fig)

def chart_positions_distribution(wallets, pdf):
    ranges = {'1-2': 0, '3-5': 0, '6-10': 0, '11-20': 0, '21-50': 0, '50+': 0}
    for w in wallets:
        p = w['positions']
        if p <= 2: ranges['1-2'] += 1
        elif p <= 5: ranges['3-5'] += 1
        elif p <= 10: ranges['6-10'] += 1
        elif p <= 20: ranges['11-20'] += 1
        elif p <= 50: ranges['21-50'] += 1
        else: ranges['50+'] += 1
    fig, ax = plt.subplots(figsize=(6, 4))
    labels = list(ranges.keys())
    sizes = list(ranges.values())
    colors = ['#448aff', '#00e676', '#ffd600', '#ff9100', '#ff5252', '#d500f9']
    bars = ax.bar(labels, sizes, color=colors, edgecolor='#1a1a2e', width=0.6)
    for bar, v in zip(bars, sizes):
        if v > 0:
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3,
                    str(v), ha='center', fontsize=11, fontweight='bold', color='#e0e0e0')
    ax.set_xlabel('Open Positions', fontsize=11)
    ax.set_ylabel('Jumlah Wallet', fontsize=11)
    ax.set_title('Distribusi Open Positions', fontsize=14, fontweight='bold', color='#e0e0e0')
    ax.tick_params(axis='x', labelsize=10)
    ax.set_ylim(0, max(sizes) * 1.2)
    plt.tight_layout()
    pdf.savefig(fig)
    plt.close(fig)

# ─── Cover Page ────────────────────────────────────────────────────────────

def cover_page(pdf, wallets, cls):
    fig = plt.figure(figsize=(8.27, 11.69))  # A4
    fig.patch.set_facecolor('#1a1a2e')
    ax = fig.add_subplot(111)
    ax.set_facecolor('#1a1a2e')
    ax.axis('off')

    # Title
    ax.text(0.5, 0.85, 'WALLET COLLECTOR', fontsize=32, fontweight='bold',
            color='#00e676', ha='center', va='center', fontfamily='monospace')
    ax.text(0.5, 0.80, '📊  STATISTIK  📊', fontsize=18,
            color='#e0e0e0', ha='center', va='center')

    # Decorative line
    ax.axhline(0.77, 0.1, 0.9, color='#0f3460', linewidth=2)

    # Metrics
    total = len(wallets)
    total_bal = sum(w['balance'] for w in wallets)
    total_pnl = sum(w['pnl'] for w in wallets)
    smart_count = cls['smart'] if cls else 0
    smart_bal = sum(w['balance'] for w in wallets[:smart_count]) if cls else 0

    metrics = [
        ('Total Wallet', str(total)),
        ('Total Balance', f'${total_bal:,.0f}'),
        ('Total PnL', f'${total_pnl:+,.0f}'),
        ('SMART Wallets', str(smart_count) if cls else 'N/A'),
    ]
    for i, (label, val) in enumerate(metrics):
        y = 0.70 - i * 0.04
        ax.text(0.3, y, label, fontsize=12, color='#a0a0a0', ha='left', va='center')
        ax.text(0.7, y, val, fontsize=14, fontweight='bold', color='#e0e0e0', ha='right', va='center')

    # Date
    now = datetime.now().strftime('%d %B %Y %H:%M')
    ax.text(0.5, 0.10, f'Generated: {now}', fontsize=10, color='#666', ha='center', va='center')

    pdf.savefig(fig)
    plt.close(fig)

# ─── Summary Page ──────────────────────────────────────────────────────────

def summary_page(pdf, wallets, cls):
    fig = plt.figure(figsize=(8.27, 11.69))
    fig.patch.set_facecolor('#1a1a2e')
    ax = fig.add_subplot(111)
    ax.set_facecolor('#1a1a2e')
    ax.axis('off')

    ax.text(0.5, 0.95, 'RINGKASAN', fontsize=20, fontweight='bold',
            color='#00e676', ha='center', va='center')

    total_bal = sum(w['balance'] for w in wallets)
    total_pnl = sum(w['pnl'] for w in wallets)
    total_pos = sum(w['positions'] for w in wallets)
    avg_bal = total_bal / len(wallets) if wallets else 0
    avg_pnl = total_pnl / len(wallets) if wallets else 0
    profitable = sum(1 for w in wallets if w['pnl'] > 0)
    loss = sum(1 for w in wallets if w['pnl'] < 0)
    with_positions = sum(1 for w in wallets if w['positions'] > 0)
    total_fees = sum(w['fees'] for w in wallets)

    rows = [
        ('JUMLAH', ''),
        ('Total Wallet', f'{len(wallets)}'),
        ('Dengan Open Positions', f'{with_positions}'),
        ('', ''),
        ('KEUANGAN', ''),
        ('Total Balance', f'${total_bal:,.2f}'),
        ('Total PnL', f'${total_pnl:+,.2f}'),
        ('Rata-rata Balance', f'${avg_bal:,.2f}'),
        ('Rata-rata PnL', f'${avg_pnl:+,.2f}'),
        ('', ''),
        ('PERFORMA', ''),
        ('Profit (+)', f'{profitable} wallet'),
        ('Loss (-)', f'{loss} wallet'),
        ('Total Open Positions', f'{total_pos}'),
        ('Unclaimed Fees', f'${total_fees:,.2f}'),
    ]

    if cls:
        rows += [
            ('', ''),
            ('KLASIFIKASI', ''),
            ('🟢 SMART', f'{cls["smart"]}'),
            ('🟡 NEUTRAL', f'{cls["neutral"]}'),
            ('🔴 BAD', f'{cls["bad"]}'),
        ]

    y_start = 0.88
    for i, (label, val) in enumerate(rows):
        y = y_start - i * 0.035
        if label == '':
            continue
        if label.isupper() and val == '':
            ax.text(0.15, y, label, fontsize=11, fontweight='bold', color='#0f3460',
                    ha='left', va='center')
            ax.axhline(y + 0.015, 0.1, 0.9, color='#0f3460', linewidth=0.5)
        else:
            ax.text(0.25, y, label, fontsize=10, color='#a0a0a0', ha='left', va='center')
            ax.text(0.75, y, val, fontsize=11, fontweight='bold', color='#e0e0e0',
                    ha='right', va='center')

    pdf.savefig(fig)
    plt.close(fig)

# ─── Main ──────────────────────────────────────────────────────────────────

def main():
    print('  📊 Generating PDF...')
    wallets = load_wallets()
    cls = load_classification()
    print(f'  👛 Loaded {len(wallets)} wallets')

    with PdfPages(OUTPUT_PDF) as pdf:
        cover_page(pdf, wallets, cls)
        summary_page(pdf, wallets, cls)
        if cls:
            chart_classification(cls, pdf)
        chart_trader_type(wallets, pdf)
        chart_positions_distribution(wallets, pdf)
        chart_top10_balance(wallets, pdf)
        chart_top10_pnl(wallets, pdf)
        chart_strategy_types(wallets, pdf)

    print(f'  ✅ PDF saved: {OUTPUT_PDF}')
    print(f'  📄 Halaman: ~8 halaman (cover + summary + 6 grafik)')
    print(f'  🎨 Dark theme dengan warna SMART/NEUTRAL/BAD')

if __name__ == '__main__':
    main()
