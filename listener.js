import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Connection, PublicKey } from '@solana/web3.js';
import { startApiServer } from './api-server.js';

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

function tgSendKeyboard(chatId, text, buttons) {
  if (!TG_API) return;
  fetch(TG_API+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true,
      reply_markup:{inline_keyboard:buttons}
    })}).catch(()=>{});
}

function tgAnswerCb(callbackQueryId, text) {
  if (!TG_API) return;
  fetch(TG_API+'/answerCallbackQuery',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({callback_query_id:callbackQueryId,text,show_alert:false})}).catch(()=>{});
}

function tgEditMsg(chatId, msgId, text) {
  if (!TG_API) return;
  fetch(TG_API+'/editMessageText',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,message_id:msgId,text,parse_mode:'HTML',disable_web_page_preview:true})}).catch(()=>{});
}

function formatWalletDetail(addr, data) {
  if (!data) return '❌ Data tidak ditemukan.';
  const s = data.summary || {};
  const pool = data.sourcePool || '?';
  let poolsList = '';
  for (const p of (data.pools||[]).slice(0,5)) {
    poolsList += '• '+p.tokenX+'/'+p.tokenY+' | Balance: $'+parseFloat(p.balances||0).toFixed(2)+' | PnL: $'+parseFloat(p.pnl||0).toFixed(2)+'\n';
  }
  return '👛 <b>Wallet Analysis</b>\n'+
    '🏊 Pool: '+pool+'\n'+
    '📊 Open positions: '+s.totalOpenPositions+'\n'+
    '💰 Balance: $'+parseFloat(s.balancesUsd||0).toFixed(2)+'\n'+
    '💵 Unclaimed fees: $'+parseFloat(s.unclaimedFeesUsd||0).toFixed(2)+'\n'+
    '📈 PnL: $'+parseFloat(s.pnlUsd||0).toFixed(2)+' ('+parseFloat(s.pnlPct||0).toFixed(2)+'%)\n'+
    '🏷 Type: '+s.traderType+'\n\n'+
    '<b>Pools:</b>\n'+poolsList;
}

function loadWalletSummary(addr) {
  try {
    const file = path.join(WALLET_DIR, addr+'.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file,'utf8'));
  } catch {}
  return null;
}

function sendWalletsList(chat, msgId) {
  const list = [...lpWallets.keys()];
  if (list.length === 0) {
    tgEditMsg(chat, msgId, 'Belum ada LP wallet terdeteksi.');
    return;
  }
  const rows = [];
  let row = [];
  for (let i=0; i<list.length; i++) {
    row.push({text: list[i].slice(0,8)+'...', callback_data: 'w_'+list[i]});
    if (row.length >= 3 || i === list.length-1) {
      rows.push(row);
      row = [];
    }
    if (rows.length >= 17) break;
  }
  rows.push([{text:'🏠 Menu utama', callback_data:'nav_menu'}]);
  tgSendKeyboard(chat, '👛 <b>LP Wallets ('+list.length+')</b>\n🔽 Klik wallet untuk lihat detail', rows);
}

function sendStartMenu(chat) {
  const totalWallets = lpWallets.size;
  const walletFiles = fs.existsSync(WALLET_DIR) ? fs.readdirSync(WALLET_DIR).filter(f=>f.endsWith('.json')).length : 0;
  tgSendKeyboard(chat,
    '🚀 <b>Meteora Wallet Collector</b>\n\n'+
    '👋 Hai! Bot ini ngumpulin alamat wallet LP dari pool Meteora teratas.\n\n'+
    '📊 <b>Statistik</b>\n'+
    '  👛 Total: <b>'+totalWallets+'</b>\n'+
    '  📁 File: '+walletFiles+'\n\n'+
    '👇 Pilih menu:',
    [
      [{text:'👛 Daftar Wallet', callback_data:'nav_wallets'}],
      [{text:'📊 Statistik', callback_data:'nav_stats'},{text:'🏆 Top 5 PnL', callback_data:'nav_top'}],
      [{text:'📋 Klasifikasi Wallet', callback_data:'nav_classify'}],
    ]
  );
}

function sendStats(chat) {
  const total = lpWallets.size;
  const files = fs.existsSync(WALLET_DIR) ? fs.readdirSync(WALLET_DIR).filter(f=>f.endsWith('.json')).length : 0;
  tgSendKeyboard(chat,
    '📊 <b>Collection Stats</b>\n\n'+
    '👛 Total LP wallets: <b>'+total+'</b>\n'+
    '📁 Wallet files: '+files+'\n'+
    '📄 Index: collected-wallets.json\n'+
    '📋 Analysis: wallet-analysis.json',
    [[{text:'← Kembali ke menu', callback_data:'nav_menu'}]]
  );
}

function sendTopWallets(chat) {
  const wallets = [...lpWallets.keys()];
  if (wallets.length === 0) { tgReply(chat, 'Belum ada wallet.'); return; }
  const results = [];
  for (const addr of wallets) {
    try {
      const file = path.join(WALLET_DIR, addr+'.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const s = data.summary || {};
        results.push({ addr, pnl: s.pnlUsd || 0, roi: s.roi || 0, open: s.totalOpenPositions||0, type: s.traderType||'?' });
      }
    } catch {}
  }
  results.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  const top = results.slice(0, 5);
  let msg = '🏆 <b>Top 5 Wallet by |PnL|</b>\n\n';
  for (let i=0; i<top.length; i++) {
    const w = top[i];
    msg += (i+1)+'. <code>'+w.addr.slice(0,8)+'...</code>\n';
    msg += '   💰 PnL: <b>$'+w.pnl.toFixed(2)+'</b> | ROI: '+w.roi.toFixed(1)+'%\n';
    msg += '   📊 Positions: '+w.open+' | Type: '+w.type+'\n\n';
  }
  tgSendKeyboard(chat, msg, [[{text:'← Kembali ke menu', callback_data:'nav_menu'}]]);
}

async function pollTgCommands() {
  if (!TG_API) { console.log('  [TG] TG_API not set, skipping poll'); return; }
  try {
    const resp = await fetch(TG_API+'/getUpdates?offset='+tgOffset+'&timeout=5');
    if (!resp.ok) { console.log('  [TG] getUpdates status: '+resp.status); return; }
    const data = await resp.json();
    if (!data.result) { console.log('  [TG] no result in response'); return; }
    if (data.result.length > 0) console.log('  [TG] got '+data.result.length+' update(s)');
    for (const update of data.result) {
      tgOffset = update.update_id + 1;
      
      // Handle callback query (inline keyboard button press)
      if (update.callback_query) {
        const cb = update.callback_query;
        const chat = cb.message.chat.id;
        const msgId = cb.message.message_id;
        const data = cb.data;
        
        if (data.startsWith('w_')) {
          // Wallet detail
          const addr = data.slice(2);
          tgAnswerCb(cb.id, '🔍 Memuat...');
          const walletData = loadWalletSummary(addr);
          if (walletData) {
            tgEditMsg(chat, msgId, formatWalletDetail(addr, walletData));
            // Add back button
            tgSendKeyboard(chat, '👆 Detail wallet di atas\n🔽 Klik kembali untuk daftar wallet',
              [[{text:'← Kembali ke daftar wallet', callback_data:'nav_wallets'}]]
            );
          } else {
            tgEditMsg(chat, msgId, '❌ Data tidak ditemukan untuk '+addr.slice(0,8)+'...');
          }
        }
        else if (data === 'nav_wallets') {
          tgAnswerCb(cb.id, '📋 Memuat daftar...');
          sendWalletsList(chat, msgId);
        }
        else if (data === 'nav_menu') {
          tgAnswerCb(cb.id, '🏠');
          sendStartMenu(chat);
        }
        else if (data === 'nav_stats') {
          tgAnswerCb(cb.id, '📊');
          sendStats(chat);
        }
        else if (data === 'nav_top') {
          tgAnswerCb(cb.id, '🏆');
          sendTopWallets(chat);
        }
        else if (data === 'nav_classify') {
          tgAnswerCb(cb.id, '📋');
          tgReply(chat, '⏳ Mengklasifikasikan wallet...');
          import('child_process').then(cp => {
            cp.exec('node ' + path.resolve(__dirname, 'classify.js'), { cwd: __dirname, timeout: 60000 }, (err, stdout, stderr) => {
              const out = (stdout||'').slice(0, 2000).replace(/</g,'&lt;');
              tgReply(chat, '✅ <b>Klasifikasi selesai!</b>\n<pre>' + out + '</pre>\n📁 Lihat detail: wallet-classification.json');
            });
          }).catch(() => tgReply(chat, '❌ Gagal.'));
        }
        continue;
      }
      
      const msg = update.message;
      if (!msg||!msg.text) continue;
      const chat = msg.chat.id;
      const text = msg.text.trim();
      console.log('  [TG] CMD: '+text);

      if (text === '/start') {
        sendStartMenu(chat);
      }
      else if (text === '/help') {
        tgSendKeyboard(chat,
          '📋 <b>Commands:</b>\n\n'+
          '  /start      — Menu utama\n'+
          '  /wallets    — Daftar semua LP wallets\n'+
          '  /wallet &lt;addr&gt; — Detail analisa wallet\n'+
          '  /stats      — Statistik koleksi\n'+
          '  /analyze    — Analisis batch ulang\n'+
          '  /classify   — Klasifikasi smart/bad wallet\n'+
          '  /top        — Top 5 wallet by PnL\n'+
          '  /help       — Pesan ini\n\n'+
          '👛 Total LP: <b>'+lpWallets.size+'</b>',
          [[{text:'← Kembali ke menu', callback_data:'nav_menu'}]]
        );
      }
      else if (text === '/wallets') {
        const list = [...lpWallets.keys()];
        if (list.length === 0) {
          tgReply(chat, 'Belum ada LP wallet terdeteksi.');
          return;
        }
        const rows = [];
        let row = [];
        for (let i=0; i<list.length; i++) {
          row.push({text: list[i].slice(0,8)+'...', callback_data: 'w_'+list[i]});
          if (row.length >= 3 || i === list.length-1) {
            rows.push(row);
            row = [];
          }
          if (rows.length >= 17) break;
        }
        rows.push([{text:'🏠 Menu utama', callback_data:'nav_menu'}]);
        tgSendKeyboard(chat, '👛 <b>LP Wallets ('+list.length+')</b>\n🔽 Klik wallet untuk lihat detail', rows);
      }
      else if (text.startsWith('/wallet ')) {
        const addr = text.slice(8).trim();
        if (addr.length !== 44) { tgReply(chat, '❌ Alamat tidak valid.'); return; }
        if (!lpWallets.has(addr)) { tgReply(chat, '❌ Wallet tidak ditemukan.'); return; }
        const data = loadWalletSummary(addr);
        if (!data) { tgReply(chat, '❌ File analisa tidak ditemukan.'); return; }
        tgReply(chat, formatWalletDetail(addr, data));
      }
      else if (text === '/stats') {
        sendStats(chat);
      }
      else if (text === '/classify') {
        tgReply(chat, '⏳ Mengklasifikasikan wallet...');
        import('child_process').then(cp => {
          cp.exec('node ' + path.resolve(__dirname, 'classify.js'), { cwd: __dirname, timeout: 60000 }, (err, stdout, stderr) => {
            const out = (stdout||'').slice(0, 2000).replace(/</g,'&lt;');
            tgReply(chat, '✅ <b>Klasifikasi selesai!</b>\n<pre>' + out + '</pre>');
          });
        }).catch(() => tgReply(chat, '❌ Gagal.'));
      }
      else if (text === '/analyze') {
        tgReply(chat, '⏳ Analisis batch dimulai... tunggu beberapa saat.');
        import('child_process').then(cp => {
          cp.exec('node ' + path.resolve(__dirname, 'analyze.js'), { cwd: __dirname, timeout: 300000 }, (err, stdout, stderr) => {
            const out = (stdout||'').slice(0, 1500);
            const errOut = (stderr||'').slice(0, 500);
            tgReply(chat, '✅ <b>Analisis selesai!</b>\n<pre>' + out.replace(/</g,'&lt;') + '</pre>' + (errOut ? '\n⚠️ ' + errOut.replace(/</g,'&lt;') : ''));
          });
        }).catch(() => tgReply(chat, '❌ Gagal menjalankan analisis.'));
      }
      else if (text === '/top') {
        sendTopWallets(chat);
      }
    }
  } catch (e) { console.log('  [TG] Poll error: '+(e?.message||e)); }
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
  await tgSend('🚀 <b>Meteora Wallet Collector</b> (LP only)\\n🏊 Pools: '+poolList+'\\n👛 Existing: '+lpWallets.size+'\\n💬 /help for commands');

  // Start API server for Meridian integration
  startApiServer();

  // Poll Telegram commands — recursive setTimeout to avoid 409 conflicts
  async function pollLoop() {
    await pollTgCommands();
    setTimeout(pollLoop, 5000);
  }
  pollLoop();

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
