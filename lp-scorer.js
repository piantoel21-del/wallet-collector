// ─────────────────────────────────────────────────────────────────────────────
// LP Scorer — engine keputusan universal "apakah token ini layak di-LP?"
//   Mode: AMAN (risk-averse) — bobot distribusi & momentum ditinggikan.
//   Bot TIDAK deploy otomatis. Keluar skor + verdict + parameter posisi.
//   Dipakai untuk semua chain (EVM & Solana) lewat ca-analyzer.
// ─────────────────────────────────────────────────────────────────────────────

import { analyze } from './ca-analyzer.js';

// ─── Bobot mode AMAN ────────────────────────────────────────────────────────
export const WEIGHTS = {
  distribution: 0.25, // anti-rug utama
  feeYield:     0.25, // sumber profit
  momentum:     0.20, // hindari knife-fall
  liquidity:    0.18, // exit safety
  safety:       0.07, // base check kontrak
  smartMoney:   0.05, // konfirmasi arah
};

// Threshold verdict
export const THRESHOLDS = { LAYAK: 70, HATI: 55 };

// ─── Hard veto (apapun skornya, ini = TOLAK) ───────────────────────────────
function hardVeto(o) {
  const v = [];
  const c = o.holderStats?.concentration || {};
  const m = o.main || {};
  if (c.top10 != null && c.top10 > 60) v.push(`Top-10 holder ${c.top10.toFixed(1)}% (whale dump risk ekstrem)`);
  if (c.top1 != null && c.top1 > 30) v.push(`Holder #1 ${c.top1.toFixed(1)}% (single-holder dominance)`);
  if (m.liq && m.liq < 15000) v.push(`Likuiditas ${fmtUsd(m.liq)} (terlalu tipis untuk LP)`);
  if (o.risk?.level === 'HIGH RISK') v.push('Risk analyzer menandai HIGH RISK');
  const ch6 = m.chg?.h6;
  if (ch6 != null && ch6 < -80) v.push(`Turun ${ch6.toFixed(1)}% dalam 6j (crash aktif)`);
  // Honeypot heuristic: sell txns ~0 padahal ada buy
  const t = m.txns?.h24;
  if (t && t.buys > 50 && (t.sells || 0) < t.buys * 0.05) v.push('Rasio sell ~0% (indikasi honeypot)');
  return v;
}

// ─── Sub-skor (0–100) ───────────────────────────────────────────────────────

function scoreDistribution(o) {
  const c = o.holderStats?.concentration;
  const n = o.holderStats?.holderCount;
  if (!c || c.top10 == null) return { score: 40, note: 'Data holder tak tersedia' };
  // top10: 10% → 100pts, 60% → 0pts
  const sTop10 = clamp(100 - (c.top10 - 10) * (100 / 50));
  const sTop20 = c.top20 != null ? clamp(100 - (c.top20 - 20) * (100 / 60)) : sTop10;
  const sTop1 = c.top1 != null ? clamp(100 - (c.top1 - 10) * (100 / 40)) : sTop10;
  let s = sTop10 * 0.5 + sTop20 * 0.3 + sTop1 * 0.2;
  // bonus kalau banyak holder
  if (n != null) {
    if (n >= 10000) s = Math.min(100, s + 10);
    else if (n >= 3000) s = Math.min(100, s + 5);
    else if (n < 500) s -= 15;
  }
  return { score: clamp(s), note: `top10 ${c.top10.toFixed(1)}%, top20 ${(c.top20 ?? 0).toFixed(1)}%, ${n != null ? n + ' holder' : ''}` };
}

function scoreFeeYield(o, poolInfo) {
  // Meteora: fee_24h / tvl. EVM: vol24 / liq (proxy turnover)
  const m = o.main;
  let yieldPct = null, note = '';
  if (poolInfo?.fee_24h && poolInfo?.tvl) {
    yieldPct = (poolInfo.fee_24h / poolInfo.tvl) * 100;
    note = `fee/TVL ${yieldPct.toFixed(2)}%`;
  } else if (m.vol?.h24 && m.liq) {
    yieldPct = (m.vol.h24 / m.liq) * 100;
    note = `turnover vol/liq ${yieldPct.toFixed(0)}%`;
  }
  if (yieldPct == null) return { score: 40, note: 'Data fee/turnover tak tersedia' };
  // ideal turnover 100–1500% (banyak fee tapi tak chaotis)
  let s;
  if (yieldPct < 20) s = yieldPct * 2;                       // 0–40
  else if (yieldPct <= 1500) s = clamp(40 + (yieldPct - 20) * 0.04); // 40–100
  else s = clamp(100 - (yieldPct - 1500) * 0.001);           // terlalu liar → turun
  return { score: clamp(s), note };
}

function scoreMomentum(o) {
  const c = o.main.chg || {};
  const vals = [c.m5, c.h1, c.h6, c.h24].filter(v => v != null);
  if (!vals.length) return { score: 40, note: 'Data momentum tak tersedia' };
  // Base dari 24j: flat = bagus untuk LP, turun tajam = buruk
  let s = 70;
  if (c.h24 != null) s += clamp(c.h24 * 0.6, -60, 20);   // naik dikit bagus, turun berat buruk
  if (c.h6 != null) s += clamp(c.h6 * 0.3, -25, 10);
  if (c.h1 != null) s += clamp(c.h1 * 0.15, -10, 8);
  // volatilitas ekstrem (5m >25%) = bahaya untuk LP sempit
  if (c.m5 != null && Math.abs(c.m5) > 25) s -= 15;
  return { score: clamp(s), note: `24j ${fmtPct(c.h24)}, 6j ${fmtPct(c.h6)}` };
}

function scoreLiquidity(o) {
  const total = o.pools?.totalLiq || o.main.liq || 0;
  // $50k→0, $500k→60, $5jt+→100
  let s;
  if (total <= 50000) s = (total / 50000) * 20;
  else if (total <= 500000) s = 20 + ((total - 50000) / 450000) * 40;
  else if (total <= 5000000) s = 60 + ((total - 500000) / 4500000) * 40;
  else s = 100;
  return { score: clamp(s), note: fmtUsd(total) + ' total liq' };
}

function scoreSafety(o, safety) {
  // safety = { mintDisabled, freezeDisabled, lpLocked } — kalau tak ada, netral
  if (!safety) return { score: 60, note: 'Data safety tak tersedia (netral)' };
  let s = 50; const notes = [];
  if (safety.mintDisabled) { s += 20; notes.push('mint off'); } else notes.push('⛔ mint aktif');
  if (safety.freezeDisabled) { s += 15; notes.push('freeze off'); } else notes.push('⛔ freeze aktif');
  if (safety.lpLocked) { s += 15; notes.push('LP lock'); }
  return { score: clamp(s), note: notes.join(', ') };
}

function scoreSmartMoney(o, smartWallets) {
  if (!smartWallets || !smartWallets.size) return { score: 50, note: 'Data smart money tak tersedia (netral)' };
  const addrs = new Set([o.address?.toLowerCase(), ...(o.holderStats?.top || []).map(h => h.addr?.toLowerCase())]);
  let hits = 0;
  for (const a of addrs) if (a && smartWallets.has(a)) hits++;
  // juga cek apakah ada smart wallet memegang
  const s = hits > 0 ? clamp(60 + hits * 12) : 45;
  return { score: s, note: hits > 0 ? `${hits} smart wallet terdeteksi` : 'tidak ada smart wallet' };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function clamp(n, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }
function fmtUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(2);
}
function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Nilai kelayakan LP sebuah token.
 * @param {string} addr  contract address (EVM 0x… / Solana base58)
 * @param {object} opts  { safety, smartWallets:Set, poolInfo:{fee_24h,tvl,apr}, caData }
 * @returns {object}     { address, token, chain, score, verdict, factors[], veto[], params }
 */
export async function scoreLp(addr, opts = {}) {
  const o = opts.caData || await analyze(addr);

  const factors = [
    { key: 'feeYield',     label: 'Fee Yield',   weight: WEIGHTS.feeYield,     ...scoreFeeYield(o, opts.poolInfo) },
    { key: 'distribution', label: 'Distribusi',  weight: WEIGHTS.distribution, ...scoreDistribution(o) },
    { key: 'momentum',     label: 'Momentum',    weight: WEIGHTS.momentum,     ...scoreMomentum(o) },
    { key: 'liquidity',    label: 'Likuiditas',  weight: WEIGHTS.liquidity,    ...scoreLiquidity(o) },
    { key: 'safety',       label: 'Keselamatan', weight: WEIGHTS.safety,       ...scoreSafety(o, opts.safety) },
    { key: 'smartMoney',   label: 'Smart Money', weight: WEIGHTS.smartMoney,   ...scoreSmartMoney(o, opts.smartWallets) },
  ];

  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));
  const veto = hardVeto(o);

  let verdict;
  if (veto.length) verdict = 'TOLAK';
  else if (score >= THRESHOLDS.LAYAK) verdict = 'LAYAK';
  else if (score >= THRESHOLDS.HATI) verdict = 'HATI-HATI';
  else verdict = 'TOLAK';

  return {
    address: o.address,
    token: `${o.main?.name || '?'} (${o.main?.symbol || '?'})`,
    chain: o.chainName,
    score,
    verdict,
    factors,
    veto,
    caData: o,
    params: computeParams(o, score, verdict, opts),
  };
}

// Parameter posisi disarankan — konservatif
function computeParams(o, score, verdict, opts) {
  const m = o.main || {};
  const price = m.priceUsd ? Number(m.priceUsd) : null;
  const vol = Math.abs(m.chg?.h24 ?? 20); // proxy volatilitas harian %

  // size: makin rendah skor → makin kecil. Basis wallet SOL kalau ada.
  const max = opts.maxSize ?? 1.0;
  let size = 0;
  if (verdict === 'LAYAK') size = max * (0.5 + (score - 70) / 100);
  else if (verdict === 'HATI-HATI') size = max * 0.3;
  else size = 0;
  size = Math.max(0, Math.min(max, Number(size.toFixed(3))));

  // range: volatilitas tinggi → lebar; rendah → sempit
  let rangePct;
  if (vol < 10) rangePct = 6;
  else if (vol < 30) rangePct = 12;
  else if (vol < 60) rangePct = 22;
  else rangePct = 35;
  if (verdict === 'HATI-HATI') rangePct = Math.min(50, rangePct + 8);

  // SL/TP konservatif
  const sl = verdict === 'LAYAK' ? -15 : -10;
  const tp = verdict === 'LAYAK' ? 25 : 15;

  return {
    sizeSol: size,
    sizeUsd: opts.walletUsd ? Number((opts.walletUsd * (size / (opts.maxSize ?? 1))).toFixed(2)) : null,
    rangePct,
    stopLossPct: sl,
    takeProfitPct: tp,
    entry: price,
    notes: verdict === 'TOLAK'
      ? 'JANGAN buka posisi — parameter tidak disarankan.'
      : `Range ±${rangePct}% dari harga, SL ${sl}%, TP ${tp}%`,
  };
}

export { clamp, fmtUsd, fmtPct };
