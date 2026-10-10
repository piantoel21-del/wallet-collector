// ─────────────────────────────────────────────────────────────────────────────
// CA Analyzer — Telegram formatter (HTML parse_mode, safe escaping)
// ─────────────────────────────────────────────────────────────────────────────

import { analyze, fmtUsd, fmtPct, esc } from './ca-analyzer.js';

const MAXLEN = 3900;

function short(a) {
  if (!a || a.length < 12) return a || '-';
  return a.slice(0, 6) + '…' + a.slice(-6);
}

function badge(level) {
  if (level === 'HIGH RISK') return '🔴 <b>HIGH RISK</b>';
  if (level === 'WASPADA') return '🟠 <b>WASPADA</b>';
  if (level === 'RELATIF OK') return '🟢 <b>RELATIF OK</b>';
  return '⚪ <b>NETRAL</b>';
}

export function formatReport(r) {
  const m = r.main;
  const L = [];
  L.push(`🔎 <b>CA ANALYSIS</b> — ${esc(m.name || '?')} (${esc(m.symbol || '?')})`);
  L.push(`⛓ <b>${esc(r.chainName)}</b>${r.chainId ? ` (id ${r.chainId})` : ''}`);
  L.push(`<code>${esc(r.address)}</code>`);
  L.push('');

  // ── harga & market
  L.push('💰 <b>Market</b>');
  L.push(`• Harga: <b>$${m.priceUsd != null ? Number(m.priceUsd).toPrecision(4) : '-'}</b>`);
  L.push(`• Likuiditas (pair utama): ${fmtUsd(m.liq)}`);
  L.push(`• FDV / Mcap: ${fmtUsd(m.fdv)} / ${fmtUsd(m.mcap)}`);
  L.push('');

  // ── perubahan
  const c = m.chg || {};
  L.push('📉 <b>Perubahan</b>');
  L.push(`• 5m: ${esc(fmtPct(c.m5))} | 1j: ${esc(fmtPct(c.h1))} | 6j: ${esc(fmtPct(c.h6))} | 24j: ${esc(fmtPct(c.h24))}`);
  L.push('');

  // ── aktivitas
  const v = m.vol || {}, t = m.txns || {};
  L.push('📊 <b>Aktivitas (24j)</b>');
  L.push(`• Vol: ${fmtUsd(v.h24)}`);
  if (t.h24) L.push(`• Txns: ${t.h24.buys || 0} buy / ${t.h24.sells || 0} sell`);
  L.push(`• Pool: ${r.pools.count} | Total liq: ${fmtUsd(r.pools.totalLiq)} | Total vol24: ${fmtUsd(r.pools.totalVol24)}`);
  L.push('');

  // ── on-chain / supply
  const tm = r.tokenMeta, hs = r.holderStats;
  if (tm || hs) {
    L.push('🧬 <b>On-chain</b>');
    if (tm?.totalSupply != null) {
      const dec = tm.decimals || 18;
      let supStr;
      try { supStr = Number(BigInt(tm.totalSupply) / (10n ** BigInt(dec))).toLocaleString('en-US'); } catch { supStr = String(tm.totalSupply); }
      L.push(`• Supply: ${supStr}`);
    }
    if (tm?.decimals != null) L.push(`• Decimals: ${tm.decimals}`);
    if (hs?.transfers != null) L.push(`• Transfer events: ${hs.transfers.toLocaleString('en-US')}`);
    if (hs?.holderCount != null) L.push(`• <b>Holder: ${hs.holderCount.toLocaleString('en-US')}</b>`);
    if (hs?.minted != null) L.push(`• Minted: ${hs.minted.toLocaleString('en-US')} | Burned: ${(hs.burned || 0).toLocaleString('en-US')}`);
    L.push('');
  }

  // ── konsentrasi
  const cc = hs?.concentration;
  if (cc) {
    L.push('⚠️ <b>Konsentrasi Kepemilikan</b>');
    const rows = [['Top 1', cc.top1], ['Top 5', cc.top5], ['Top 10', cc.top10], ['Top 20', cc.top20], ['Top 50', cc.top50], ['Top 100', cc.top100]]
      .filter(([, x]) => x != null);
    L.push(rows.map(([k, x]) => `${k}: <b>${Number(x).toFixed(2)}%</b>`).join(' | '));
    if (hs.note) L.push(`<i>${esc(hs.note)}</i>`);
    L.push('');
  }

  // ── top holders
  if (hs?.top?.length) {
    L.push(`👥 <b>Top ${Math.min(hs.top.length, 10)} Holder</b>`);
    hs.top.slice(0, 10).forEach((h, i) => {
      const tag = h.isContract === true ? ' 📄kontrak' : h.isContract === false ? ' 👤wallet' : '';
      L.push(`${i + 1}. <code>${esc(short(h.addr))}</code> ${Number(h.pct).toFixed(2)}%${tag}`);
    });
    L.push('');
  }

  // ── sosial
  const inf = r.socials || {};
  const links = [];
  for (const w of (inf.websites || [])) links.push(w.url);
  for (const s of (inf.socials || [])) links.push(s.url);
  if (links.length) {
    L.push('🔗 <b>Links</b>');
    links.slice(0, 6).forEach(u => L.push(esc(u)));
    L.push('');
  }

  // ── verdict
  L.push('🚦 <b>Verdict:</b> ' + badge(r.risk?.level));
  if (r.risk?.flags?.length) {
    r.risk.flags.forEach(f => L.push('  ' + esc(f)));
  } else {
    L.push('  Tidak ada red flag utama terdeteksi.');
  }
  if (r.main.url) { L.push(''); L.push(`📈 ${esc(r.main.url)}`); }
  if (r.warnings?.length) {
    L.push('');
    L.push('⚠️ <i>' + r.warnings.map(esc).join('; ') + '</i>');
  }

  let msg = L.join('\n');
  if (msg.length > MAXLEN) msg = msg.slice(0, MAXLEN) + '\n…(dipotong)';
  return msg;
}

// Kirim status + jalankan analisa + kirim hasil (dipakai listener.js)
export async function runCaAnalysis({ addr, status, send }) {
  try {
    await send('⏳ Menganalisa <code>' + esc(addr) + '</code>…');
    const r = await analyze(addr);
    await send(formatReport(r));
  } catch (e) {
    await send('❌ <b>Gagal analisa:</b> ' + esc(e.message));
  }
}
