import json, os

with open('/home/ubuntu/meridian/wallet-collector/wallet-analysis.json') as f:
    analysis = json.load(f)
with open('/home/ubuntu/meridian/wallet-collector/wallet-classification.json') as f:
    classification = json.load(f)

total = analysis.get('totalWallets', 436)
smart = len(classification.get('smartWallets', [])) if isinstance(classification.get('smartWallets'), list) else classification.get('smart', 0)
neutral = len(classification.get('neutralWallets', [])) if isinstance(classification.get('neutralWallets'), list) else classification.get('neutral', 0)
bad = len(classification.get('badWallets', [])) if isinstance(classification.get('badWallets'), list) else classification.get('bad', 0)

print("📊  WALLET COLLECTOR — STATISTIK")
print("=" * 55)

print(f"\n📦 OVERVIEW")
print(f"  Total wallets        : {total}")
print(f"  Wallet files         : 439")
print(f"  Smart wallets        : {smart} ({smart/total*100:.0f}%)  ✅")
print(f"  Neutral              : {neutral} ({neutral/total*100:.0f}%)")
print(f"  Bad wallets          : {bad} ({bad/total*100:.0f}%)  ❌")
print(f"  With open positions  : {analysis.get('walletsWithOpenPositions', '?')}")
print(f"  Terakhir klasifikasi : {classification.get('classifiedAt', '?')}")

total_tvl = analysis.get('totalValueLockedUsd', 0)
total_pnl = analysis.get('totalPnlAllUsd', 0)
trader_types = analysis.get('traderTypes', {})

print(f"\n💰 KEUANGAN")
print(f"  Total TVL semua      : ${total_tvl:,.2f}")
print(f"  Total PnL semua      : ${total_pnl:,.2f}")

if trader_types:
    print(f"\n🏷 TRADER TYPE")
    for t, count in sorted(trader_types.items(), key=lambda x: -x[1]):
        print(f"  {t:<25}: {count} ({count/total*100:.0f}%)")

# Scan individual wallet files
wallet_dir = '/home/ubuntu/meridian/wallet-collector/wallet'
fnames = [f for f in os.listdir(wallet_dir) if f.endswith('.json')]

all_wallets = []
pos_dists = {'0 pos': 0, '1 pos': 0, '2-5 pos': 0, '6-10 pos': 0, '11+ pos': 0}
total_balance = 0
total_open_pnl = 0
total_closed_pnl = 0
total_pools_all = 0
type_counts = {}
pools_above_1k = 0

for fname in fnames:
    try:
        with open(os.path.join(wallet_dir, fname)) as f:
            w = json.load(f)
        s = w.get('summary', {})
        addr = w.get('address', fname.replace('.json',''))
        open_pnl = s.get('openPnlUsd', 0) or 0
        closed_pnl = s.get('closedPnlUsd', 0) or 0
        balance = s.get('openBalancesUsd', 0) or 0
        npos = s.get('totalOpenPositions', 0) or 0
        npools = s.get('totalOpenPools', 0) or 0
        tp = s.get('traderType', 'unknown')
        roi = s.get('roi', 0) or 0
        total_pnl_w = s.get('totalPnlUsd', 0) or (open_pnl + closed_pnl)
        
        all_wallets.append((addr[:12], total_pnl_w, balance, npos, npools, open_pnl, closed_pnl, tp, roi))
        total_balance += balance
        total_open_pnl += open_pnl
        total_closed_pnl += closed_pnl
        total_pools_all += npools
        type_counts[tp] = type_counts.get(tp, 0) + 1
        if balance > 1000:
            pools_above_1k += 1
        
        if npos == 0: pos_dists['0 pos'] += 1
        elif npos == 1: pos_dists['1 pos'] += 1
        elif npos <= 5: pos_dists['2-5 pos'] += 1
        elif npos <= 10: pos_dists['6-10 pos'] += 1
        else: pos_dists['11+ pos'] += 1
    except:
        pass

n = len(all_wallets)
all_wallets.sort(key=lambda x: -abs(x[1]))
profitable = sum(1 for w in all_wallets if w[1] > 0)
loss = sum(1 for w in all_wallets if w[1] < 0)

print(f"\n🏆 TOP 5 WALLETS by Total PnL")
print(f"  {'Addr':<14} {'Total PnL':<14} {'Open PnL':<12} {'Closed':<12} {'Balance':<10} {'Pos':<5} {'ROI':<8}")
print(f"  {'-'*73}")
for w in all_wallets[:5]:
    print(f"  {w[0]:<14} ${w[1]:<+10,.2f} ${w[5]:<+9,.2f} ${w[6]:<+9,.2f} ${w[2]:<7,.2f} {w[3]:<5} {w[8]:<+7,.1f}%")

print(f"\n💀 BOTTOM 5 WALLETS by Total PnL")
for w in all_wallets[-5:]:
    print(f"  {w[0]:<14} ${w[1]:<+10,.2f} ${w[5]:<+9,.2f} ${w[6]:<+9,.2f} ${w[2]:<7,.2f} {w[3]:<5} {w[8]:<+7,.1f}%")

print(f"\n📋 OPEN POSITIONS DISTRIBUTION")
for label, count in sorted(pos_dists.items(), key=lambda x: (int(x[0].split()[0]) if x[0].split()[0].isdigit() else 0)):
    pct = count/n*100
    bar = '█' * int(pct / 4)
    print(f"  {label:<16}: {count:>4} ({pct:>5.1f}%) {bar}")

print(f"\n📊 AGREGAT ({n} wallets)")
print(f"  Rata-rata balance    : ${total_balance/n:,.2f}")
print(f"  Rata-rata pools      : {total_pools_all/n:.1f}")
print(f"  Balance > $1K        : {pools_above_1k}")
print(f"  Total open PnL       : ${total_open_pnl:+,.2f}")
print(f"  Total closed PnL     : ${total_closed_pnl:+,.2f}")
print(f"  Net PnL gabungan     : ${total_open_pnl+total_closed_pnl:+,.2f}")
print(f"  Profit wallets       : {profitable}")
print(f"  Loss wallets         : {loss}")

if type_counts:
    print(f"\n🏷 TRADER TYPE (real)")
    for t, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {t:<25}: {count} ({count/n*100:.0f}%)")

# Smart wallets detail
smart_addrs = classification.get('smartWallets', [])
if isinstance(smart_addrs, list):
    smart_with_data = [w for w in all_wallets if any(s.startswith(w[0]) for s in smart_addrs)]
    if smart_with_data:
        smart_with_data.sort(key=lambda x: -abs(x[1]))
        print(f"\n🧠 TOP 3 SMART WALLETS")
        for w in smart_with_data[:3]:
            print(f"  {w[0]} PnL: ${w[1]:+,.0f} | Bal: ${w[2]:,.0f} | Pos: {w[3]} | ROI: {w[8]:+.1f}%")

print(f"\n🔍 SISTEM")
print(f"  Pools monitored      : 5 (Jimothy, JACOBIAN×2, ANSEM, Agamemnon)")
print(f"  Restarts (baru)      : 1 (setelah fix 500M limit)")
print(f"  Uptime               : ~21 menit")
print(f"  API                  : http://localhost:3456")
print(f"  Berat data disk      : ~{n*4} KB (wallet .json files)")
print()
