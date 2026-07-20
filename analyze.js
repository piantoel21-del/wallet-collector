import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DLMM_API     = 'https://dlmm.datapi.meteora.ag';
const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const WALLETS_FILE = path.resolve(__dirname, 'collected-wallets.json');
const WALLET_DIR   = path.resolve(__dirname, 'wallet');
const SUMMARY_FILE = path.resolve(__dirname, 'wallet-analysis.json');

// ─── Config ─────────────────────────────────────────────────────────────────

const CONCURRENCY  = 5;          // parallel wallets per batch
const STAGGER_MS   = 150;        // stagger antar wallet dalam 1 batch
const REFRESH_TTL  = 30 * 60_000; // 30 menit — skip kalo masih fresh

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadWallets() {
  try {
    if (fs.existsSync(WALLETS_FILE)) {
      const data = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
      return Array.isArray(data) ? data : [];
    }
  } catch {}
  return [];
}

async function apiGet(path) {
  try {
    const resp = await fetch(DLMM_API + path);
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

function classifyStrategy(pool) {
  const count = pool.openPositionCount || 0;
  const outOfRange = pool.outOfRange === true;
  const list = [];
  if (outOfRange) list.push('out_of_range');
  if (count <= 1) list.push('concentrated');
  else if (count <= 4) list.push('bid_ask');
  else list.push('wide_curve');
  return list.join(', ') || 'concentrated';
}

function walletFilePath(addr) {
  return path.join(WALLET_DIR, addr + '.json');
}

function saveWalletFile(addr, data) {
  if (!fs.existsSync(WALLET_DIR)) fs.mkdirSync(WALLET_DIR, { recursive: true });
  fs.writeFileSync(walletFilePath(addr), JSON.stringify(data, null, 2));
}

/**
 * Cek apakah wallet perlu di-refresh.
 * Skip jika file sudah ada dan terakhir di-analyze < REFRESH_TTL (30 menit).
 */
function needsRefresh(addr) {
  const fpath = walletFilePath(addr);
  if (!fs.existsSync(fpath)) return true;
  try {
    const data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
    const analyzedAt = data.analyzedAt || 0;
    return (Date.now() - analyzedAt) > REFRESH_TTL;
  } catch {
    return true; // corrupt file, re-analyze
  }
}

// ─── Analyze single wallet ─────────────────────────────────────────────────

async function analyzeWallet(addr, index, total) {
  const fpath = walletFilePath(addr);

  // Incremental check
  if (!needsRefresh(addr)) {
    console.log('  [' + (index + 1) + '/' + total + '] ' + addr.slice(0, 8) + '... ⏭️ skip (fresh <30m)');
    return null;
  }

  console.log('  [' + (index + 1) + '/' + total + '] ' + addr.slice(0, 8) + '...');

  const analysis = {
    address: addr,
    analyzedAt: Date.now(),
    openPositions: null,
    closedPositions: null,
    summary: {
      totalOpenPositions: 0,
      totalOpenPools: 0,
      totalClosedPositions: 0,
      totalClosedPools: 0,
      openBalancesUsd: 0,
      openUnclaimedFeesUsd: 0,
      openPnlUsd: 0,
      openPnlPct: 0,
      closedPnlUsd: 0,
      closedPnlPct: 0,
      totalPnlUsd: 0,
      traderType: 'swapper',
      roi: 0,
      strategies: [],
    },
    pools: [],
  };

  // ── Open positions ──
  const openData = await apiGet('/portfolio/open?user=' + addr + '&page_size=20');
  if (openData && openData.pools) {
    analysis.openPositions = openData;
    analysis.summary.totalOpenPools = openData.pools.length;
    analysis.summary.totalOpenPositions = openData.totalPositions || 0;
    analysis.summary.openBalancesUsd = parseFloat(openData.total?.balances || 0);
    analysis.summary.openUnclaimedFeesUsd = parseFloat(openData.total?.unclaimedFees || 0);
    analysis.summary.openPnlUsd = parseFloat(openData.total?.pnl || 0);
    analysis.summary.openPnlPct = parseFloat(openData.total?.pnlPctChange || 0);

    for (const pool of openData.pools) {
      const strategy = classifyStrategy(pool);
      analysis.pools.push({
        address: pool.poolAddress,
        tokenX: pool.tokenX,
        tokenY: pool.tokenY,
        type: 'open',
        balances: pool.balances,
        unclaimedFees: pool.unclaimedFees,
        pnl: pool.pnl,
        pnlPct: pool.pnlPctChange,
        totalDeposit: pool.totalDeposit,
        outOfRange: pool.outOfRange,
        openPositionCount: pool.openPositionCount,
        positions: pool.listPositions || [],
        strategy,
      });
      if (!analysis.summary.strategies.includes(strategy)) {
        analysis.summary.strategies.push(strategy);
      }
    }
  }

  // ── Closed positions ──
  const closedData = await apiGet('/portfolio?user=' + addr + '&page_size=20&days_back=90');
  if (closedData && closedData.pools) {
    analysis.closedPositions = closedData;
    analysis.summary.totalClosedPools = closedData.pools.length;
    analysis.summary.totalClosedPositions = closedData.totalPositions || 0;

    let totalPnl = 0;
    for (const pool of closedData.pools) {
      totalPnl += parseFloat(pool.pnlUsd || 0);
      analysis.pools.push({
        address: pool.poolAddress,
        tokenX: pool.tokenX,
        tokenY: pool.tokenY,
        type: 'closed',
        totalDeposit: pool.totalDeposit,
        totalWithdrawal: pool.totalWithdrawal,
        totalFee: pool.totalFee,
        pnl: pool.pnlUsd,
        pnlPct: pool.pnlPctChange,
        lastClosedAt: pool.lastClosedAt,
      });
    }
    analysis.summary.closedPnlUsd = totalPnl;
  }

  // ── Summary ──
  analysis.summary.totalPnlUsd = analysis.summary.openPnlUsd + analysis.summary.closedPnlUsd;

  const strats = analysis.summary.strategies;
  if (strats.includes('bid_ask')) analysis.summary.traderType = 'bid_ask_trader';
  else if (strats.includes('wide_curve')) analysis.summary.traderType = 'passive_lp';
  else if (analysis.summary.totalOpenPositions > 0) analysis.summary.traderType = 'active_lp';
  else if (analysis.summary.totalClosedPositions > 0) analysis.summary.traderType = 'former_lp';
  else analysis.summary.traderType = 'swapper';

  const totalDeposit = (openData?.total?.totalDeposit ? parseFloat(openData.total.totalDeposit) : 0) +
    (closedData?.pools?.reduce((s, p) => s + parseFloat(p.totalDeposit || 0), 0) || 0);
  analysis.summary.roi = totalDeposit > 0 ? (analysis.summary.totalPnlUsd / totalDeposit) * 100 : 0;

  // ── Save individual file ──
  saveWalletFile(addr, analysis);

  return analysis;
}

// ─── Batch processor (parallel dengan stagger) ─────────────────────────────

async function processBatch(wallets, startIdx, batchSize, total) {
  const batch = wallets.slice(startIdx, startIdx + batchSize);
  const promises = batch.map((addr, i) =>
    new Promise(resolve => setTimeout(resolve, i * STAGGER_MS))
      .then(() => analyzeWallet(addr, startIdx + i, total))
  );
  return Promise.all(promises);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const tStart = Date.now();

  console.log('');
  console.log('  ╔════════════════════════════════════════════════════╗');
  console.log('  ║    📊  WALLET ANALYSIS — Optimized v2             ║');
  console.log('  ║    Parallel: ' + String(CONCURRENCY).padEnd(32) + '║');
  console.log('  ║    Incremental skip: <30 menit                   ║');
  console.log('  ╚════════════════════════════════════════════════════╝');
  console.log('');

  const wallets = loadWallets();
  if (wallets.length === 0) {
    console.error('  ❌  No wallets found in collected-wallets.json');
    console.error('  🎯  Jalankan node index.js dulu');
    process.exit(1);
  }

  console.log('  👛  Total wallets: ' + wallets.length);
  console.log('  ⚡  Concurrency: ' + CONCURRENCY);
  console.log('  📁  Output: wallet/*.json\n');

  const results = [];
  let refreshed = 0;
  let skipped = 0;

  for (let i = 0; i < wallets.length; i += CONCURRENCY) {
    const batchResults = await processBatch(wallets, i, CONCURRENCY, wallets.length);
    for (const r of batchResults) {
      if (r === null) {
        skipped++;
      } else {
        results.push(r.summary);
        refreshed++;
      }
    }
  }

  // ── Summary index ──
  const summary = {
    analyzedAt: Date.now(),
    totalWallets: wallets.length,
    refreshed,
    skipped,
    durationMs: Date.now() - tStart,
    walletsWithOpenPositions: results.filter(r => r.totalOpenPositions > 0).length,
    walletsWithClosedPositions: results.filter(r => r.totalClosedPositions > 0).length,
    totalValueLockedUsd: results.reduce((s, r) => s + r.openBalancesUsd, 0),
    totalPnlAllUsd: results.reduce((s, r) => s + r.totalPnlUsd, 0),
    traderTypes: {},
    wallets: wallets.map((addr, i) => {
      const r = results[i] || {};
      return {
        address: addr,
        ...r,
        file: 'wallet/' + addr + '.json',
      };
    }),
  };

  for (const r of results) {
    const t = r.traderType || 'unknown';
    summary.traderTypes[t] = (summary.traderTypes[t] || 0) + 1;
  }

  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));

  // ── Print ──
  const durSec = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log('  💾  Saved:');
  console.log('       • wallet-analysis.json (summary)');
  console.log('       • wallet/*.json (' + wallets.length + ' files)\n');

  console.log('  ╔════════════════════════════════════════════╗');
  console.log('  ║  📊  SUMMARY                               ║');
  console.log('  ╠════════════════════════════════════════════╣');
  console.log('  ║  Total wallets      : ' + String(wallets.length).padEnd(24) + '║');
  console.log('  ║  Refreshed          : ' + String(refreshed).padEnd(24) + '║');
  console.log('  ║  Skipped (fresh)    : ' + String(skipped).padEnd(24) + '║');
  console.log('  ║  With open pos      : ' + String(summary.walletsWithOpenPositions).padEnd(24) + '║');
  console.log('  ║  With closed pos    : ' + String(summary.walletsWithClosedPositions).padEnd(24) + '║');
  console.log('  ║  Total value locked : $' + String(Math.round(summary.totalValueLockedUsd)).padEnd(20) + '║');
  console.log('  ║  Total PnL all      : $' + String(Math.round(summary.totalPnlAllUsd)).padEnd(20) + '║');
  console.log('  ║  Duration           : ' + String(durSec + 's').padEnd(24) + '║');
  console.log('  ╠════════════════════════════════════════════╣');
  console.log('  ║  Trader Types:');
  for (const [type, count] of Object.entries(summary.traderTypes)) {
    console.log('  ║    ' + type.padEnd(22) + ': ' + String(count).padEnd(20) + '║');
  }
  console.log('  ╚════════════════════════════════════════════╝\n');

  // Top 5
  const sorted = [...summary.wallets].sort((a, b) => Math.abs(b.totalPnlUsd || 0) - Math.abs(a.totalPnlUsd || 0));
  console.log('  ── Top 5 wallets by |PnL| ──\n');
  for (let i = 0; i < Math.min(5, sorted.length); i++) {
    const w = sorted[i];
    if (w.totalPnlUsd == null) continue;
    console.log('  ' + (i+1) + '. ' + w.address.slice(0,8) + '...  PnL: $' + w.totalPnlUsd.toFixed(2) +
      '  ROI: ' + (w.roi||0).toFixed(1) + '%  Type: ' + w.traderType +
      '  Open: ' + w.totalOpenPositions + '  Closed: ' + w.totalClosedPositions);
  }
  console.log('');
}

main();
