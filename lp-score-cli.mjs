#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LP Score CLI — dipanggil oleh bridge eksternal (Meridian) untuk menilai
// kelayakan LP satu token, output JSON ke stdout.
//
// Usage:
//   node lp-score-cli.mjs <address> [--max-size 0.1] [--json] [--quiet]
//
// Exit code: 0 = sukses (apapun verdict-nya). 1 = error.
// ─────────────────────────────────────────────────────────────────────────────

import { scoreLp } from './lp-scorer.js';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

// ambil alamat = argumen pertama yang BUKAN flag (tidak diawali --)
const flags = new Set(['--max-size', '--json', '--quiet']);
let addr = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { if (['--max-size'].includes(a)) i++; continue; }
  addr = a; break;
}
const maxSize = parseFloat(arg('--max-size', '0.1'));
const quiet = process.argv.includes('--quiet');

if (!addr || addr === '--help' || addr === '-h') {
  console.error('usage: node lp-score-cli.mjs <address> [--max-size N] [--json] [--quiet]');
  process.exit(1);
}

try {
  const r = await scoreLp(addr, { maxSize: Number.isFinite(maxSize) ? maxSize : 0.1 });
  // Output ringkas (buang caData besar — tak perlu untuk gate)
  const out = {
    address: r.address,
    token: r.token,
    chain: r.chain,
    score: r.score,
    verdict: r.verdict,
    veto: r.veto,
    factors: (r.factors || []).map(f => ({ key: f.key, score: Math.round(f.score), weight: f.weight, note: f.note })),
    params: r.params,
  };
  if (quiet) {
    console.log(JSON.stringify({ score: r.score, verdict: r.verdict }));
  } else {
    console.log(JSON.stringify(out));
  }
  process.exit(0);
} catch (e) {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
}
