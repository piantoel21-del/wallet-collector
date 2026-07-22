import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLET_DIR = path.resolve(__dirname, 'wallet');
const API_PORT = 3456;

// ─── Skoring (sama kayak classify.js) ─────────────────────────────────────

function scoreWallet(data) {
  const s = data.summary || {};
  let skor = 0;
  const pnl = parseFloat(s.totalPnlUsd || s.pnlUsd || 0);
  const balance = parseFloat(s.openBalancesUsd || s.balancesUsd || 0);
  const roi = parseFloat(s.roi) || 0;
  const positions = s.totalOpenPositions || 0;
  const closedPositions = s.totalClosedPositions || 0;
  const totalPositions = positions + closedPositions;
  const traderType = (s.traderType || '').toLowerCase();
  const strats = s.strategies || [];

  if (pnl > 0) {
    skor += 25;
    if (pnl > 10000) skor += 15;
    else if (pnl > 1000) skor += 10;
  }
  if (balance > 50000) skor += 25;
  else if (balance > 10000) skor += 20;
  else if (balance > 1000) skor += 15;
  else if (balance > 100) skor += 5;

  if (positions >= 10) skor += 25;
  else if (positions >= 5) skor += 20;
  else if (positions >= 3) skor += 10;

  if (totalPositions >= 20) skor += 15;
  else if (totalPositions >= 10) skor += 10;

  if (roi > 50) skor += 20;
  else if (roi > 20) skor += 15;
  else if (roi > 10) skor += 10;
  else if (roi > 5) skor += 5;

  if (traderType === 'active_lp' || traderType === 'bid_ask_trader') skor += 10;
  else if (traderType === 'passive_lp') skor += 5;
  if (strats.length >= 2) skor += 10;

  // ── Negative signals (reduced penalty) ──
  if (pnl < 0) {
    skor -= 15;
    if (pnl < -10000) skor -= 10;
    else if (pnl < -1000) skor -= 5;
  }
  if (balance < 100) skor -= 20;
  if (roi < -50) skor -= 20;
  else if (roi < -20) skor -= 15;
  else if (roi < -10) skor -= 10;
  if (positions === 0 && closedPositions === 0) skor -= 15;
  if (traderType === 'swapper' || traderType === 'former_lp') skor -= 10;

  return skor;
}

function classifyWallets() {
  if (!fs.existsSync(WALLET_DIR)) return { wallets: [] };

  const files = fs.readdirSync(WALLET_DIR).filter(f => f.endsWith('.json'));
  const smartWallets = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(WALLET_DIR, file), 'utf8'));
      const addr = data.address || file.replace('.json', '');
      const skor = scoreWallet(data);

      if (skor >= 70) {
        smartWallets.push({
          name: 'wc-' + addr.slice(0, 8),
          address: addr,
          category: 'collected',
          type: 'lp',
          source: 'wallet-collector',
          skor,
          pnlUsd: parseFloat(data.summary?.totalPnlUsd || data.summary?.pnlUsd || 0),
          balancesUsd: parseFloat(data.summary?.openBalancesUsd || data.summary?.balancesUsd || 0),
          positions: data.summary?.totalOpenPositions || 0,
          addedAt: new Date().toISOString(),
        });
      }
    } catch {}
  }

  return {
    wallets: smartWallets,
    total: smartWallets.length,
    updatedAt: new Date().toISOString(),
  };
}

// ─── HTTP Server ───────────────────────────────────────────────────────────

const _cache = { data: null, time: 0 };
const CACHE_TTL = 60_000; // 1 menit cache

function handleRequest(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${API_PORT}`);

  // GET /health — enhanced health check
  if (url.pathname === '/health') {
    // Read last analysis timestamp
    let lastAnalyzedAt = null;
    try {
      const analysisPath = path.resolve(__dirname, 'wallet-analysis.json');
      if (fs.existsSync(analysisPath)) {
        const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
        lastAnalyzedAt = analysis.analyzedAt ? new Date(analysis.analyzedAt).toISOString() : null;
      }
    } catch {}

    const data = classifyWallets();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      uptimeHuman: Math.floor(process.uptime() / 3600) + 'h ' + Math.floor((process.uptime() % 3600) / 60) + 'm',
      wallets: {
        total: fs.existsSync(WALLET_DIR) ? fs.readdirSync(WALLET_DIR).filter(f => f.endsWith('.json')).length : 0,
        smart: data.total,
      },
      lastAnalyzedAt,
      cacheTTL: CACHE_TTL / 1000 + 's',
    }));
    return;
  }

  // GET /api/smart-wallets — format for Meridian
  if (url.pathname === '/api/smart-wallets') {
    const now = Date.now();
    if (!_cache.data || now - _cache.time > CACHE_TTL) {
      _cache.data = classifyWallets();
      _cache.time = now;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(_cache.data, null, 2));
    return;
  }

  // GET /api/smart-wallets/raw — full wallet data with scores
  if (url.pathname === '/api/smart-wallets/raw') {
    const result = classifyWallets();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result, null, 2));
    return;
  }

  // GET /changelog — riwayat update wallet collector
  if (url.pathname === '/changelog') {
    try {
      const changelogPath = path.resolve(__dirname, 'CHANGELOG.md');
      const content = fs.readFileSync(changelogPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CHANGELOG.md not found' }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', paths: ['/health', '/api/smart-wallets', '/api/smart-wallets/raw', '/changelog'] }));
}

export function startApiServer(port) {
  const server = http.createServer(handleRequest);
  const p = port || API_PORT;
  server.listen(p, 'localhost', () => {
    console.log(`  🌐 API Server: http://localhost:${p}`);
    console.log(`     GET /api/smart-wallets  → ${_cache.data?.total || 0} SMART wallets (Meridian format)`);
    console.log(`     GET /health             → health check`);
    console.log(`     GET /changelog          → riwayat update`);
  });
  return server;
}

// Standalone: node api-server.js
const isMain = process.argv[1] && (process.argv[1].endsWith('api-server.js') || process.argv[1].endsWith('api-server'));
if (isMain) {
  console.log('  Wallet Collector API Server');
  console.log('');
  const data = classifyWallets();
  console.log(`  📊 ${data.total} SMART wallets ready`);
  startApiServer();
}
