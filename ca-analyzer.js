// ─────────────────────────────────────────────────────────────────────────────
// CA Analyzer — analisa token dari contract address (multi-chain)
//   • EVM  (0x...)  → DexScreener + RPC langsung (holder via Transfer logs)
//   • Solana (b58)  → DexScreener + Helius RPC
// Dipakai oleh listener.js sebagai command /ca <address>
// ─────────────────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122 Safari/537.36';
const DEX_BASE = 'https://api.dexscreener.com/latest/dex';

// Chain registry — di-key oleh DEXSCREENER SLUG (yang dikembalikan di pair.chainId)
const CHAINS = {
  ethereum: { name: 'Ethereum', id: 1,      rpc: 'https://eth.llamarpc.com' },
  bsc:      { name: 'BSC',      id: 56,     rpc: 'https://bsc-dataseed.binance.org' },
  base:     { name: 'Base',     id: 8453,   rpc: 'https://mainnet.base.org' },
  arbitrum: { name: 'Arbitrum', id: 42161,  rpc: 'https://arb1.arbitrum.io/rpc' },
  optimism: { name: 'Optimism', id: 10,     rpc: 'https://mainnet.optimism.io' },
  polygon:  { name: 'Polygon',  id: 137,    rpc: 'https://polygon-rpc.com' },
  robinhood:{ name: 'Robinhood Chain', id: 4663, rpc: 'https://rpc.mainnet.chain.robinhood.com' },
};

const RPC_BY_SLUG = Object.fromEntries(Object.entries(CHAINS).map(([k, v]) => [k, v.rpc]));

const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

// ─── helpers ────────────────────────────────────────────────────────────────

async function jget(url, opts = {}, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function rpcCall(rpc, method, params, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://robinhood.com' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    return j.result;
  } finally { clearTimeout(t); }
}

function decodeString(hex) {
  try {
    const b = Buffer.from(hex.replace(/^0x/, ''), 'hex');
    if (b.length < 64) return null;
    const len = b.readUInt32BE(32);
    if (len <= 0 || 64 + len > b.length + 1) return null;
    return b.slice(64, 64 + len).toString('utf8').replace(/\u0000/g, '');
  } catch { return null; }
}

function fmtUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
  return '$' + v.toFixed(2);
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isEvm(addr) { return /^0x[a-fA-F0-9]{40}$/.test(addr); }
function isSolana(addr) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr) && !addr.startsWith('0x'); }

// ─── DexScreener ────────────────────────────────────────────────────────────

async function dexByToken(addr) {
  const d = await jget(`${DEX_BASE}/tokens/${addr}`);
  return (d.pairs || []).filter(p => {
    const b = (p.baseToken?.address || '').toLowerCase();
    const q = (p.quoteToken?.address || '').toLowerCase();
    const a = addr.toLowerCase();
    return b === a || q === a;
  });
}

// ─── EVM on-chain (RPC) ─────────────────────────────────────────────────────

async function evmTokenMeta(rpc, ca) {
  const [nameR, symR, decR, supR] = await Promise.all([
    rpcCall(rpc, 'eth_call', [{ to: ca, data: '0x06fdde03' }, 'latest']).catch(() => null),
    rpcCall(rpc, 'eth_call', [{ to: ca, data: '0x95d89b41' }, 'latest']).catch(() => null),
    rpcCall(rpc, 'eth_call', [{ to: ca, data: '0x313ce567' }, 'latest']).catch(() => null),
    rpcCall(rpc, 'eth_call', [{ to: ca, data: '0x18160ddd' }, 'latest']).catch(() => null),
  ]);
  return {
    name: decodeString(nameR || ''),
    symbol: decodeString(symR || ''),
    decimals: decR ? parseInt(decR, 16) : 18,
    totalSupply: supR ? BigInt(supR) : null,
  };
}

async function evmHolders(rpc, ca, decimals, opts = {}) {
  const maxBlocks = opts.maxBlocks || 3_000_000;
  const span = opts.span || 9000;
  const latest = parseInt(await rpcCall(rpc, 'eth_blockNumber', []), 16);
  const start = Math.max(0, latest - maxBlocks);
  const logs = [];
  for (let b = start; b <= latest; b += span) {
    const e = Math.min(b + span - 1, latest);
    try {
      const r = await rpcCall(rpc, 'eth_getLogs', [{ address: ca, topics: [TOPIC_TRANSFER], fromBlock: '0x' + b.toString(16), toBlock: '0x' + e.toString(16) }], 30000);
      if (Array.isArray(r)) logs.push(...r);
    } catch { /* skip chunk — free-tier RPC range limits */ }
    if (logs.length > 400_000) break; // safety
  }
  const bal = new Map();
  let mint = 0n, burn = 0n;
  for (const l of logs) {
    if (!l.topics || l.topics.length < 3) continue;
    const from = '0x' + l.topics[1].slice(-40);
    const to = '0x' + l.topics[2].slice(-40);
    let val = 0n;
    try { val = l.data && l.data !== '0x' ? BigInt(l.data) : 0n; } catch { continue; }
    if (from === ZERO_ADDR) mint += val; else bal.set(from, (bal.get(from) || 0n) - val);
    if (to === ZERO_ADDR) burn += val; else bal.set(to, (bal.get(to) || 0n) + val);
  }
  const holders = [...bal.entries()].filter(([, v]) => v > 0n).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  const total = 10n ** BigInt(decimals);
  const supply = holders.reduce((s, [, v]) => s + v, 0n);
  return { logs: logs.length, holders, supply, total, mint, burn };
}

// ─── Main analyzer ──────────────────────────────────────────────────────────

async function analyze(addrRaw) {
  const addr = String(addrRaw || '').trim();
  if (!isEvm(addr) && !isSolana(addr)) throw new Error('Alamat tidak valid (bukan EVM 0x… atau Solana base58).');

  const pairs = await dexByToken(addr);
  if (!pairs.length) throw new Error('Token tidak ditemukan di DexScreener (mungkin belum ada pool).');

  // pilih pair terbesar sebagai utama
  pairs.sort((a, b) => ((b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)));
  const main = pairs[0];
  const chainId = main.chainId || null;
  const chainMeta = CHAINS[chainId] || null;
  const chainName = chainMeta?.name || chainId || '?';
  const numericId = chainMeta?.id || null;
  const slug = chainId || '';

  // agregat likuiditas semua pool
  const totLiq = pairs.reduce((s, p) => s + (p.liquidity?.usd || 0), 0);
  const totVol24 = pairs.reduce((s, p) => s + (p.volume?.h24 || 0), 0);

  const out = {
    address: addr,
    onchain: isEvm(addr) ? 'evm' : 'solana',
    chainId: numericId, chainKey: chainId, chainName,
    main: {
      name: main.baseToken?.name, symbol: main.baseToken?.symbol,
      dex: main.dexId, labels: main.labels || [],
      priceUsd: main.priceUsd, priceNative: main.priceNative,
      liq: main.liquidity?.usd || 0,
      fdv: main.fdv, mcap: main.marketCap,
      vol: main.volume || {}, chg: main.priceChange || {}, txns: main.txns || {},
      created: main.pairCreatedAt || null,
      url: main.url,
    },
    pools: { count: pairs.length, totalLiq: totLiq, totalVol24: totVol24 },
    socials: main.info || {},
    tokenMeta: null,
    holderStats: null,
    warnings: [],
  };

  // ── on-chain enrichment ──
  if (isEvm(addr)) {
    const rpc = RPC_BY_SLUG[slug] || null;
    if (rpc) {
      try {
        const meta = await evmTokenMeta(rpc, addr);
        // Fallback name/symbol dari DexScreener kalau RPC tak kembalikan
        if (!meta.name) meta.name = out.main.name || null;
        if (!meta.symbol) meta.symbol = out.main.symbol || null;
        out.tokenMeta = meta;
        const h = await evmHolders(rpc, addr, meta.decimals || 18);
        const dec = meta.decimals || 18;
        const D = 10n ** BigInt(dec);
        const scale = (v) => Number(v / D) + Number(v % D) / Number(D);
        const supply = meta.totalSupply && meta.totalSupply > 0n ? meta.totalSupply : h.total;
        const pct = (v) => Number((v * 10000n) / (supply || 1n)) / 100;
        const top = h.holders.slice(0, 20).map(([a, v]) => ({ addr: a, raw: v, amt: scale(v), pct: pct(v) }));
        const sumTop = (n) => h.holders.slice(0, n).reduce((s, [, v]) => s + v, 0n);
        out.holderStats = {
          transfers: h.logs,
          holderCount: h.holders.length,
          top,
          concentration: {
            top1: pct(h.holders[0]?.[1] || 0n),
            top5: pct(sumTop(5)), top10: pct(sumTop(10)),
            top20: pct(sumTop(20)), top50: pct(sumTop(50)), top100: pct(sumTop(100)),
          },
          minted: scale(h.mint), burned: scale(h.burn),
        };
        // tandai kontrak vs EOA pada top holder
        for (const t of out.holderStats.top.slice(0, 10)) {
          try {
            const code = await rpcCall(rpc, 'eth_getCode', [t.addr, 'latest'], 12000);
            t.isContract = code && code.length > 2;
          } catch { t.isContract = null; }
        }
      } catch (e) {
        out.warnings.push('On-chain EVM enrichment gagal: ' + e.message);
      }
    } else {
      out.warnings.push(`RPC belum dikonfigurasi untuk chain "${slug}" — data holder dilewati.`);
    }
  } else {
    // Solana: pakai Helius untuk supply + top holders (token largest accounts)
    try {
      const helius = process.env.HELIUS_API_KEY || '';
      if (helius) {
        const rpc = `https://mainnet.helius-rpc.com/?api-key=${helius}`;
        const sup = await rpcCall(rpc, 'getTokenSupply', [addr]);
        const biggest = await rpcCall(rpc, 'getTokenLargestAccounts', [addr]);
        const D = 10n ** BigInt(sup?.value?.decimals || 6);
        const totalSup = BigInt(sup?.value?.amount || '0');
        const scale = (v) => Number(v / D) + Number(v % D) / Number(D);
        const pct = (v) => totalSup > 0n ? Number((v * 10000n) / totalSup) / 100 : 0;
        const accounts = (biggest?.value || []).slice(0, 20);
        out.tokenMeta = { name: out.main.name, symbol: out.main.symbol, decimals: sup?.value?.decimals ?? null, totalSupply: totalSup };
        out.holderStats = {
          transfers: null,
          holderCount: null,
          top: accounts.map(a => ({ addr: a.address, raw: BigInt(a.amount || '0'), amt: scale(BigInt(a.amount || '0')), pct: pct(BigInt(a.amount || '0')), isContract: null, uiAmount: a.uiAmount })),
          concentration: {
            top1: pct(BigInt(accounts[0]?.amount || '0')),
            top5: pct(accounts.slice(0, 5).reduce((s, a) => s + BigInt(a.amount || '0'), 0n)),
            top10: pct(accounts.slice(0, 10).reduce((s, a) => s + BigInt(a.amount || '0'), 0n)),
            top20: pct(accounts.slice(0, 20).reduce((s, a) => s + BigInt(a.amount || '0'), 0n)),
          },
          note: 'Solana: top-20 largest token accounts (getTokenLargestAccounts)',
        };
      } else {
        out.warnings.push('HELIUS_API_KEY tidak ada — data holder Solana dilewati.');
      }
    } catch (e) {
      out.warnings.push('Helius enrichment gagal: ' + e.message);
    }
  }

  // ── risk verdict ──
  out.risk = computeRisk(out);
  return out;
}

function computeRisk(o) {
  const flags = [];
  const c = o.holderStats?.concentration || {};
  const m = o.main;
  if (c.top10 != null && c.top10 > 50) flags.push(`🔴 Top-10 holder pegang ${c.top10.toFixed(1)}% supply`);
  else if (c.top10 != null && c.top10 > 30) flags.push(`🟠 Top-10 holder pegang ${c.top10.toFixed(1)}%`);
  if (c.top1 != null && c.top1 > 15) flags.push(`🔴 Holder #1 pegang ${c.top1.toFixed(1)}%`);
  if (o.holderStats?.holderCount && o.holderStats.holderCount < 500) flags.push(`🟠 Holder cuma ${o.holderStats.holderCount}`);
  if (m.liq && m.liq < 50000) flags.push(`🟠 Likuiditas tipis (${fmtUsd(m.liq)})`);
  if (o.pools.totalLiq && o.pools.totalLiq < 100000) flags.push(`🟠 Total likuiditas semua pool ${fmtUsd(o.pools.totalLiq)}`);
  const ch24 = m.chg?.h24, ch6 = m.chg?.h6;
  if (ch24 != null && ch24 < -50) flags.push(`🔴 Turun ekstrem ${fmtPct(ch24)} (24j)`);
  else if (ch24 != null && ch24 < -25) flags.push(`🟠 Turun ${fmtPct(ch24)} (24j)`);
  const t24 = m.txns?.h24;
  if (t24 && (t24.buys + t24.sells) < 100) flags.push('🟠 Aktivitas trade sangat sepi (24j)');

  let level = 'NETRAL';
  const reds = flags.filter(f => f.startsWith('🔴')).length;
  const oranges = flags.filter(f => f.startsWith('🟠')).length;
  if (reds >= 2 || (reds >= 1 && oranges >= 2)) level = 'HIGH RISK';
  else if (reds >= 1 || oranges >= 2) level = 'WASPADA';
  else if (flags.length === 0) level = 'RELATIF OK';
  return { level, flags };
}

export { analyze, isEvm, isSolana, fmtUsd, fmtPct, esc };
