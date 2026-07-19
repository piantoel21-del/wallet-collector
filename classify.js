import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLET_DIR = path.resolve(__dirname, 'wallet');
const OUTPUT_FILE = path.resolve(__dirname, 'wallet-classification.json');

// ─── Skoring ────────────────────────────────────────────────────────────────

function scoreWallet(data) {
  const s = data.summary || {};
  let skor = 0;
  const reasons = [];

  // ── Positive signals ──
  const pnl = parseFloat(s.pnlUsd) || 0;
  const balance = parseFloat(s.balancesUsd) || 0;
  const roi = parseFloat(s.roi) || 0;
  const positions = s.totalOpenPositions || 0;
  const closedPositions = s.totalClosedPositions || 0;
  const totalPositions = positions + closedPositions;

  if (pnl > 0) {
    skor += 25;
    reasons.push('PnL positif +25');
    if (pnl > 10000) { skor += 15; reasons.push('Profit besar +15'); }
    else if (pnl > 1000) { skor += 10; reasons.push('Profit lumayan +10'); }
  }

  if (balance > 50000) { skor += 25; reasons.push('Whale balance +25'); }
  else if (balance > 10000) { skor += 20; reasons.push('Balance besar +20'); }
  else if (balance > 1000) { skor += 15; reasons.push('Modal serius +15'); }
  else if (balance > 100) { skor += 5; reasons.push('Modal kecil +5'); }

  if (positions >= 10) { skor += 25; reasons.push('Sangat aktif +25'); }
  else if (positions >= 5) { skor += 20; reasons.push('Aktif +20'); }
  else if (positions >= 3) { skor += 10; reasons.push('Cukup aktif +10'); }

  if (totalPositions >= 20) { skor += 15; reasons.push('Berpengalaman +15'); }
  else if (totalPositions >= 10) { skor += 10; reasons.push('Pengalaman cukup +10'); }

  if (roi > 50) { skor += 20; reasons.push('ROI tinggi +20'); }
  else if (roi > 20) { skor += 15; reasons.push('ROI bagus +15'); }
  else if (roi > 10) { skor += 10; reasons.push('ROI lumayan +10'); }
  else if (roi > 5) { skor += 5; reasons.push('ROI positif +5'); }

  const traderType = (s.traderType || '').toLowerCase();
  if (traderType === 'active_lp' || traderType === 'bid_ask_trader') {
    skor += 10;
    reasons.push('LP aktif +10');
  } else if (traderType === 'passive_lp') {
    skor += 5;
    reasons.push('LP pasif +5');
  }

  // Strategi diversity
  const strats = s.strategies || [];
  if (strats.length >= 2) {
    skor += 10;
    reasons.push('Multi-strategi +10');
  }

  // ── Negative signals ──
  if (pnl < 0) {
    skor -= 30;
    reasons.push('PnL negatif -30');
    if (pnl < -10000) { skor -= 20; reasons.push('Rugi besar -20'); }
    else if (pnl < -1000) { skor -= 10; reasons.push('Rugi lumayan -10'); }
  }

  if (balance < 100) {
    skor -= 20;
    reasons.push('Modal sangat kecil -20');
  }

  if (roi < -50) { skor -= 20; reasons.push('ROI jelek -20'); }
  else if (roi < -20) { skor -= 15; reasons.push('ROI buruk -15'); }
  else if (roi < -10) { skor -= 10; reasons.push('ROI negatif -10'); }

  if (positions === 0 && closedPositions === 0) {
    skor -= 15;
    reasons.push('Tanpa posisi -15');
  }

  if (traderType === 'swapper' || traderType === 'former_lp') {
    skor -= 10;
    reasons.push('Bukan LP aktif -10');
  }

  return { skor, reasons };
}

function getLabel(skor) {
  if (skor >= 60) return { label: '✅ SMART', emoji: '🟢' };
  if (skor >= 30) return { label: '⚠️ NEUTRAL', emoji: '🟡' };
  return { label: '❌ BAD', emoji: '🔴' };
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log('  ╔════════════════════════════════════════════════════╗');
  console.log('  ║    📊  WALLET CLASSIFICATION                      ║');
  console.log('  ╚════════════════════════════════════════════════════╝');
  console.log('');

  if (!fs.existsSync(WALLET_DIR)) {
    console.error('  ❌  Folder wallet/ tidak ditemukan.');
    console.error('  🎯  Jalankan node index.js dulu untuk mengumpulkan wallet.');
    process.exit(1);
  }

  const files = fs.readdirSync(WALLET_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.error('  ❌  Tidak ada file wallet di wallet/');
    process.exit(1);
  }

  const results = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(WALLET_DIR, file), 'utf8'));
      const addr = data.address || file.replace('.json', '');
      const { skor, reasons } = scoreWallet(data);
      const { label, emoji } = getLabel(skor);
      results.push({
        address: addr,
        skor,
        label,
        emoji,
        pnl: parseFloat(data.summary?.pnlUsd || 0),
        balance: parseFloat(data.summary?.balancesUsd || 0),
        positions: data.summary?.totalOpenPositions || 0,
        roi: parseFloat(data.summary?.roi || 0),
        traderType: data.summary?.traderType || '?',
        strategies: data.summary?.strategies || [],
        reasons,
        file,
      });
    } catch {}
  }

  // Sort by score descending
  results.sort((a, b) => b.skor - a.skor);

  // ── Summary ──
  const smart = results.filter(r => r.skor >= 60);
  const neutral = results.filter(r => r.skor >= 30 && r.skor < 60);
  const bad = results.filter(r => r.skor < 30);

  const summary = {
    classifiedAt: new Date().toISOString(),
    totalWallets: results.length,
    smart: smart.length,
    neutral: neutral.length,
    bad: bad.length,
    smartWallets: smart.map(w => ({
      address: w.address,
      skor: w.skor,
      pnl: w.pnl,
      balance: w.balance,
      positions: w.positions,
      roi: w.roi,
      traderType: w.traderType,
      strategies: w.strategies,
    })),
    neutralWallets: neutral.map(w => ({
      address: w.address,
      skor: w.skor,
      pnl: w.pnl,
      balance: w.balance,
    })),
    badWallets: bad.map(w => ({
      address: w.address,
      skor: w.skor,
      pnl: w.pnl,
      balance: w.balance,
    })),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));

  // ── Print ──
  console.log(`  📁  ${results.length} wallets diproses`);
  console.log(`  💾  Hasil: ${OUTPUT_FILE}`);
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║  📊  RINGKASAN KLASIFIKASI                         ║');
  console.log('  ╠══════════════════════════════════════════════════════╣');
  console.log(`  ║  🟢 SMART   : ${String(smart.length).padEnd(10)} (skor ≥ 60)              ║`);
  console.log(`  ║  🟡 NEUTRAL : ${String(neutral.length).padEnd(10)} (skor 30-59)             ║`);
  console.log(`  ║  🔴 BAD     : ${String(bad.length).padEnd(10)} (skor < 30)               ║`);
  console.log(`  ║  TOTAL      : ${String(results.length).padEnd(10)}                           ║`);
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');

  // ── Top 5 Smart ──
  if (smart.length > 0) {
    console.log('  ── 🏆 TOP 5 SMART WALLETS ──\n');
    smart.slice(0, 5).forEach((w, i) => {
      console.log(`  ${i+1}. ${w.address.slice(0, 8)}...  Skor: ${w.skor}  PnL: $${w.pnl.toFixed(2)}  Balance: $${w.balance.toFixed(2)}  ROI: ${w.roi.toFixed(1)}%`);
      console.log(`     Type: ${w.traderType}  Positions: ${w.positions}  Strategi: ${w.strategies.join(', ') || '-'}`);
      console.log('');
    });
  }

  // ── Top 5 Bad ──
  if (bad.length > 0) {
    console.log('  ── 💀 TOP 5 BAD WALLETS ──\n');
    bad.slice(0, 5).forEach((w, i) => {
      console.log(`  ${i+1}. ${w.address.slice(0, 8)}...  Skor: ${w.skor}  PnL: $${w.pnl.toFixed(2)}  Balance: $${w.balance.toFixed(2)}`);
      console.log('');
    });
  }
}

main();
