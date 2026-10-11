// ─────────────────────────────────────────────────────────────────────────────
// LP Decision — formatter Telegram (HTML) untuk hasil lp-scorer
// ─────────────────────────────────────────────────────────────────────────────

import { scoreLp, THRESHOLDS } from './lp-scorer.js';
import { esc } from './ca-analyzer.js';

const MAXLEN = 3900;

function bar(score) {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function verdictBadge(v) {
  if (v === 'LAYAK') return '✅ <b>LAYAK LP</b>';
  if (v === 'HATI-HATI') return '🟡 <b>HATI-HATI</b>';
  return '⛔ <b>TOLAK</b>';
}

export function formatLpDecision(r) {
  const L = [];
  L.push(`🎯 <b>LP DECISION</b> — ${esc(r.token)}`);
  L.push(`⛓ ${esc(r.chain)} · <code>${esc(r.address.slice(0, 10))}…${esc(r.address.slice(-6))}</code>`);
  L.push('');
  L.push(`<b>SKOR: ${r.score}/100</b> → ${verdictBadge(r.verdict)}`);
  L.push(`<i>(layak ≥${THRESHOLDS.LAYAK} · hati ${THRESHOLDS.HATI}–${THRESHOLDS.LAYAK - 1} · tolak &lt;${THRESHOLDS.HATI})</i>`);
  L.push('');

  // ── rincian faktor
  L.push('📊 <b>Rincian Faktor</b>');
  const sorted = [...r.factors].sort((a, b) => b.weight - a.weight);
  for (const f of sorted) {
    const icon = f.score >= 70 ? '🟢' : f.score >= 45 ? '🟡' : '🔴';
    L.push(`${icon} ${esc(f.label)} <code>[${bar(f.score)}]</code> ${String(Math.round(f.score)).padStart(3)} <i>(${Math.round(f.weight * 100)}%)</i>`);
    if (f.note) L.push(`    <i>${esc(f.note)}</i>`);
  }
  L.push('');

  // ── veto
  if (r.veto?.length) {
    L.push('⛔ <b>HARD VETO — otomatis tolak:</b>');
    r.veto.forEach(v => L.push('  • ' + esc(v)));
    L.push('');
  }

  // ── parameter posisi
  const p = r.params;
  L.push('📐 <b>Parameter Posisi Disarankan</b>');
  if (r.verdict === 'TOLAK') {
    L.push('  ⛔ ' + esc(p.notes));
  } else {
    L.push(`  • Size: <b>${p.sizeSol} SOL</b>${p.sizeUsd ? ` (~$${p.sizeUsd})` : ''}`);
    L.push(`  • Range: ±${p.rangePct}% dari harga`);
    L.push(`  • Stop-loss: ${p.stopLossPct}%`);
    L.push(`  • Take-profit: +${p.takeProfitPct}%`);
    if (p.entry) L.push(`  • Entry ref: $${Number(p.entry).toPrecision(4)}`);
  }
  L.push('');

  // ── disclaimer
  L.push('<i>⚠️ Ini REKOMENDASI, bukan eksekusi otomatis. Kamu yang putuskan & deploy manual.</i>');

  let msg = L.join('\n');
  if (msg.length > MAXLEN) msg = msg.slice(0, MAXLEN) + '\n…(dipotong)';
  return msg;
}

export async function runLpDecision({ addr, send, maxSize = 1.0, walletUsd = null }) {
  try {
    await send('⏳ Menilai kelayakan LP <code>' + esc(addr) + '</code>… (analisa on-chain, mohon tunggu)');
    const r = await scoreLp(addr, { maxSize, walletUsd });
    await send(formatLpDecision(r));
  } catch (e) {
    await send('❌ <b>Gagal menilai LP:</b> ' + esc(e.message));
  }
}
