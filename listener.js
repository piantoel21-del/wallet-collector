import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Connection, PublicKey } from '@solana/web3.js';

const DLMM_API      = 'https://dlmm.datapi.meteora.ag';
const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const WALLETS_FILE  = path.resolve(__dirname, 'collected-wallets.json');
const WALLET_DIR    = path.resolve(__dirname, 'wallet');
const ENV_FILE      = path.resolve(__dirname, '.env');

// ─── Load .env (local dulu, fallback ke charon) ─────────────────────────────

function loadEnv(key) {
  // Cek process.env dulu
  if (process.env[key]) return process.env[key];

  // Cek local .env
  try {
    const env = fs.readFileSync(ENV_FILE, 'utf8');
    const m = env.match(new RegExp(key + '=(.+)$', 'm'));
    if (m) return m[1].trim();
  } catch {}

  // Fallback ke charon/.env
  try {
    const env = fs.readFileSync('/home/ubuntu/charon/.env', 'utf8');
    const m = env.match(new RegExp(key + '=(.+)$', 'm'));
    if (m) return m[1].trim();
  } catch {}

  return null;
}

const RPC_URL  = loadEnv('RPC_URL') || 'https://pump.helius-rpc.com';
const tgToken  = loadEnv('TELEGRAM_BOT_TOKEN') || '';
const tgChatId = loadEnv('TELEGRAM_CHAT_ID') || '';
const TG_API   = tgToken ? 'https://api.telegram.org/bot' + tgToken : null;
const tgSend = TG_API ? (text) => {
  fetch(TG_API+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:tgChatId,text,parse_mode:'HTML',disable_web_page_preview:true})}).catch(()=>{});
} : () => {};

// ─── Telegram command handler ────────────────────────────────────────────────

let tgOffset = 0;

function tgReply(chatId, text) {
  if (!TG_API) return;
  fetch(TG_API+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true})}).catch(()=>{});
}

function loadWalletSummary(addr) {
  try {
    const file = path.join(WALLET_DIR, addr+'.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file,'utf8'));
  } catch {}
  return null;
}

async function pollTgCommands() {
  if (!TG_API) return;
  try {
    const resp = await fetch(TG_API+'/getUpdates?offset='+tgOffset+'&timeout=10');
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.result) return;
    for (const update of data.result) {
      tgOffset = update.update_id + 1;
      const msg = update.message;
      if (!msg||!msg.text) continue;
      const chat = msg.chat.id;
      const text = msg.text.trim();

      if (text === '/start' || text === '/help') {
        tgReply(chat,
          '🤖 <b>Meteora Wallet Collector</b>\n\n'+
          '📋 <b>Commands:</b>\n'+
          '  /wallets     — Daftar semua LP wallets\n'+
          '  /wallet &lt;addr&gt; — Detail analisa wallet\n'+
          '  /stats       — Statistik koleksi\n'+
          '  /help        — Pesan ini\n\n'+
          '👛 Total LP: <b>'+lpWallets.size+'</b>'
        );
      }
      else if (text === '/wallets') {
        const list = [...lpWallets.keys()];
        if (list.length === 0) {
          tgReply(chat, 'Belum ada LP wallet terdeteksi.');
          return;
        }
        // Send in chunks if too many
        const chunks = [];
        let chunk = '📋 <b>LP Wallets ('+list.length+')</b>\n\n';
        for (let i=0; i<list.length; i++) {
          const line = (i+1)+'. <code>'+list[i]+'</code>\n';
          if (chunk.length+line.length > 4000) { chunks.push(chunk); chunk = ''; }
          chunk += line;
        }
        if (chunk) chunks.push(chunk);
        for (const c of chunks) tgReply(chat, c);
      }
      else if (text.startsWith('/wallet ')) {
        const addr = text.slice(8).trim();
        if (addr.length !== 44) { tgReply(chat, '❌ Alamat tidak valid.'); return; }
        if (!lpWallets.has(addr)) { tgReply(chat, '❌ Wallet tidak ditemukan.'); return; }
        const data = loadWalletSummary(addr);
        if (!data) { tgReply(chat, '❌ File analisa tidak ditemukan.'); return; }
        const s = data.summary;
        let poolsList = '';
        for (const p of (data.pools||[]).slice(0,5)) {
          poolsList += '• '+p.tokenX+'/'+p.tokenY+' | Balance: $'+parseFloat(p.balances||0).toFixed(2)+' | PnL: $'+parseFloat(p.pnl||0).toFixed(2)+'\n';
        }
        tgReply(chat,
          '👛 <b>Wallet Analysis</b>\n'+
          '🏊 Pool: '+data.sourcePool+'\n'+
          '📊 Open positions: '+s.totalOpenPositions+'\n'+
          '💰 Balance: $'+s.balancesUsd.toFixed(2)+'\n'+
          '💵 Unclaimed fees: $'+s.unclaimedFeesUsd.toFixed(2)+'\n'+
          '📈 PnL: $'+s.pnlUsd.toFixed(2)+' ('+s.pnlPct.toFixed(2)+'%)\n'+
          '🏷 Type: '+s.traderType+'\n\n'+
          '<b>Pools:</b>\n'+poolsList+
          '\n📁 Lihat di wallet/'+addr+'.json'
        );
      }
      else if (text === '/stats') {
        const total = lpWallets.size;
        const files = fs.existsSync(WALLET_DIR) ? fs.readdirSync(WALLET_DIR).filter(f=>f.endsWith('.json')).length : 0;
        tgReply(chat,
          '📊 <b>Collection Stats</b>\n\n'+
          '👛 Total LP wallets: <b>'+total+'</b>\n'+
          '📁 Wallet files: '+files+'\n'+
          '📄 Index: collected-wallets.json\n'+
          '📋 Analysis: wallet-analysis.json'
        );
      }
    }
  } catch {}
}

const lpWallets = new Map();
const pendingSigs = new Set();
let processing = false;

// ─── Persistence ─────────────────────────────────────────────────────────────

function load() {
  try {
    if (fs.existsSync(WALLETS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(WALLETS_FILE,'utf8'));
      if (Array.isArray(arr)) for (const w of arr) lpWallets.set(w,{firstSeen:0});
    }
    if (fs.existsSync(WALLET_DIR)) {
      for (const f of fs.readdirSync(WALLET_DIR)) {
        if (f.endsWith('.json')) lpWallets.set(f.replace('.json',''),{firstSeen:0});
      }
    }
  } catch {}
}

function saveIndex() {
  fs.writeFileSync(WALLETS_FILE, JSON.stringify([...lpWallets.keys()].sort(),null,2));
}

function saveWalletFile(addr, data) {
  if (!fs.existsSync(WALLET_DIR)) fs.mkdirSync(WALLET_DIR,{recursive:true});
  fs.writeFileSync(path.join(WALLET_DIR, addr+'.json'), JSON.stringify(data,null,2));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAddr(k) {
  if (!k) return null;
  if (typeof k === 'string') return k;
  if (k.pubkey) return typeof k.pubkey === 'string' ? k.pubkey : k.pubkey.toString();
  if (k.toBase58) return k.toBase58();
  if (k.toString) return k.toString();
  return null;
}

function classifyStrategy(pool) {
  const c = pool.openPositionCount||0;
  const o = pool.outOfRange===true;
  const l = [];
  if (o) l.push('out_of_range');
  if (c<=1) l.push('concentrated');
  else if (c<=4) l.push('bid_ask');
  else l.push('wide_curve');
  return l.join(', ')||'concentrated';
}

async function checkOpenPositions(addr) {
  try {
    const resp = await fetch(DLMM_API+'/portfolio/open?user='+addr+'&page_size=10');
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

function extractWallets(txResp) {
  const found = new Set();
  try {
    const meta = txResp.meta, msg = txResp.transaction.message;
    if (!meta||!msg) return found;
    for (const k of (msg.accountKeys||[])) {
      const a = getAddr(k);
      if (a&&a.length===44&&k.signer===true) found.add(a);
    }
    if (meta.loadedAddresses?.writable) {
      for (const k of meta.loadedAddresses.writable) {
        const a = getAddr(k);
        if (a&&a.length===44) found.add(a);
      }
    }
  } catch {}
  return found;
}

// ─── Batch processor ─────────────────────────────────────────────────────────

async function processBatch(conn, pools) {
  if (processing||pendingSigs.size===0) return;
  processing = true;
  const batch = [...pendingSigs];
  pendingSigs.clear();
  let lpFound = 0;

  for (const sig of batch) {
    try {
      const txResp = await conn.getParsedTransaction(sig,{maxSupportedTransactionVersion:0,commitment:'confirmed'});
      if (!txResp) continue;
      for (const addr of extractWallets(txResp)) {
        if (lpWallets.has(addr)) continue;
        const portfolio = await checkOpenPositions(addr);
        const hasLP = portfolio&&portfolio.totalPositions>0;
        if (hasLP) {
          // Cari pool mana yang memicu wallet ini
          const accountKeys = new Set();
          const msg = txResp.transaction.message;
          if (msg.accountKeys) for (const k of msg.accountKeys) { const a=getAddr(k); if(a) accountKeys.add(a); }
          if (txResp.meta?.loadedAddresses?.writable) for (const k of txResp.meta.loadedAddresses.writable) { const a=getAddr(k); if(a) accountKeys.add(a); }
          const sourcePool = pools.find(p => accountKeys.has(p.address)) || pools[0];

          const analysis = {
            address: addr,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            firstTx: sig,
            sourcePool: sourcePool.name,
            sourcePoolAddress: sourcePool.address,
            openPositions: portfolio,
            summary: {
              totalOpenPositions: portfolio.totalPositions||0,
              totalOpenPools: (portfolio.pools||[]).length,
              balancesUsd: parseFloat(portfolio.total?.balances||0),
              unclaimedFeesUsd: parseFloat(portfolio.total?.unclaimedFees||0),
              pnlUsd: parseFloat(portfolio.total?.pnl||0),
              pnlPct: parseFloat(portfolio.total?.pnlPctChange||0),
              traderType: 'active_lp',
            },
            pools: (portfolio.pools||[]).map(p => ({
              address: p.poolAddress, tokenX: p.tokenX, tokenY: p.tokenY,
              balances: p.balances, unclaimedFees: p.unclaimedFees,
              pnl: p.pnl, pnlPct: p.pnlPctChange, totalDeposit: p.totalDeposit,
              openPositionCount: p.openPositionCount, outOfRange: p.outOfRange,
              strategy: classifyStrategy(p),
            })),
          };
          lpWallets.set(addr,{firstSeen:Date.now()});
          saveWalletFile(addr, analysis);
          saveIndex();
          lpFound++;
          console.log('  🏦 ['+sourcePool.name+'] LP: '+addr.slice(0,8)+'... — '+portfolio.totalPositions+' positions');
        }
        await new Promise(r=>setTimeout(r,300));
      }
    } catch {}
    await new Promise(r=>setTimeout(r,200));
  }

  if (lpFound>0) {
    console.log('  🏦 '+lpFound+' new LP wallet(s) — total: '+lpWallets.size);
  }
  processing = false;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default async function startListener(pools) {
  if (!Array.isArray(pools)) pools = [pools];

  console.log('  Loading wallets...');
  load();
  console.log('  Loaded '+lpWallets.size+' existing LP wallets');
  console.log('  Connecting to Solana...');
  const conn = new Connection(RPC_URL,'confirmed');
  const ver = await conn.getVersion();
  console.log('  Connected — Solana v'+ver['solana-core']+'\n');
  console.log('  Monitoring '+pools.length+' pools:');
  for (const p of pools) console.log('    • '+p.name+' — '+p.address.slice(0,20)+'...');
  console.log('');

  for (const pool of pools) {
    conn.onLogs(new PublicKey(pool.address), (logs) => {
      if (logs.signature) pendingSigs.add(logs.signature);
    }, 'confirmed');
  }

  setInterval(() => processBatch(conn, pools), 5000);
  setInterval(() => saveIndex(), 60_000);

  console.log('  🎯  Only saving wallets with open LP positions');
  if (TG_API) console.log('  Telegram: ✅ — /help for commands');
  console.log('  Press Ctrl+C to stop\n');

  const poolList = pools.map(p => '<code>'+p.name+'</code>').join(', ');
  await tgSend('🚀 <b>Meteora Wallet Collector</b> (LP only)\n🏊 Pools: '+poolList+'\n👛 Existing: '+lpWallets.size+'\n💬 /help for commands');

  // Poll Telegram commands every 5 seconds
  setInterval(() => pollTgCommands(), 5000);

  const summaryInt = setInterval(async () => {
    await tgSend('📊 <b>LP Wallet Summary</b>\n👛 Total: <b>'+lpWallets.size+'</b>\n🏊 Pools: '+poolList);
  }, 3_600_000);

  process.on('SIGINT', async () => {
    clearInterval(summaryInt); saveIndex();
    await tgSend('🛑 Stopped. Total LP wallets: <b>'+lpWallets.size+'</b>');
    console.log('\n  Saved. Bye!'); process.exit(0);
  });
  process.on('SIGTERM', () => { saveIndex(); process.exit(0); });
}
