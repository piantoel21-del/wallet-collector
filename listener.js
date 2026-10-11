import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { Connection, PublicKey } from '@solana/web3.js';
import { startApiServer } from './api-server.js';
import { runCaAnalysis } from './ca-format.js';
import { runLpDecision } from './lp-format.js';

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
      [{text:'☕ Kopi Susu', callback_data:'nav_ksusu'},{text:'📋 Klasifikasi', callback_data:'nav_classify'}],
      [{text:'📝 Changelog', callback_data:'nav_changelog'}],
    ]
  );
}

function sendStats(chat) {
  const total = lpWallets.size;
  const files = fs.existsSync(WALLET_DIR) ? fs.readdirSync(WALLET_DIR).filter(f=>f.endsWith('.json')).length : 0;
  
  // Kumpulin data dari semua wallet file
  const wallets = [];
  let totalBal = 0, totalPnl = 0, totalPos = 0;
  const skorDist = { high: 0, mid: 0, low: 0 };
  
  if (fs.existsSync(WALLET_DIR)) {
    for (const f of fs.readdirSync(WALLET_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(WALLET_DIR, f), 'utf8'));
        const s = data.summary || {};
        const addr = data.address || f.replace('.json', '');
        const pnl = parseFloat(s.pnlUsd || s.totalPnlUsd || 0);
        const bal = parseFloat(s.openBalancesUsd || s.balancesUsd || 0);
        const pos = s.totalOpenPositions || 0;
        totalBal += bal;
        totalPnl += pnl;
        totalPos += pos;
        
        // Baca skor dari classification file kalo ada
        let skor = 0;
        try {
          const classFile = path.resolve(__dirname, 'wallet-classification.json');
          if (fs.existsSync(classFile)) {
            const classData = JSON.parse(fs.readFileSync(classFile, 'utf8'));
            const found = classData.wallets?.find(w => w.address === addr);
            if (found) skor = found.skor || 0;
          }
        } catch {}
        
        if (skor >= 70) skorDist.high++;
        else if (skor >= 40) skorDist.mid++;
        else skorDist.low++;
        
        wallets.push({ addr, pnl, bal, pos, skor, type: s.traderType || '?', roi: s.roi || 0 });
      } catch {}
    }
  }
  
  // Sort
  wallets.sort((a, b) => b.pnl - a.pnl);
  const top5 = wallets.slice(0, 5);
  const bottom5 = [...wallets].sort((a, b) => a.pnl - b.pnl).slice(0, 5);
  
  // Hitung profit/loss count
  const profitCount = wallets.filter(w => w.pnl > 0).length;
  const lossCount = wallets.filter(w => w.pnl < 0).length;
  
  // Baca last analyzed
  let lastAnalyzed = 'N/A';
  try {
    const analysisPath = path.resolve(__dirname, 'wallet-analysis.json');
    if (fs.existsSync(analysisPath)) {
      const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
      lastAnalyzed = analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'N/A';
    }
  } catch {}

  let msg = '';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
  msg += '📊 <b>WALLET COLLECTOR — OVERVIEW</b>\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  msg += '📦 <b>Koleksi</b>\n';
  msg += '  👛 Total wallets: <b>' + total + '</b>\n';
  msg += '  📁 File analisa: ' + files + '\n';
  msg += '  🕐 Last analyzed: ' + lastAnalyzed + '\n\n';
  
  msg += '📊 <b>Skor Distribution</b>\n';
  const maxBar = Math.max(skorDist.high, skorDist.mid, skorDist.low, 1);
  const barLen = 15;
  msg += '  🟢 Smart (≥70):  ' + skorDist.high + ' ' + '█'.repeat(Math.round(skorDist.high/maxBar*barLen)) + '\n';
  msg += '  🟡 Neutral (40-69): ' + skorDist.mid + ' ' + '█'.repeat(Math.round(skorDist.mid/maxBar*barLen)) + '\n';
  msg += '  🔴 Bad (<40):    ' + skorDist.low + ' ' + '█'.repeat(Math.round(skorDist.low/maxBar*barLen)) + '\n\n';
  
  msg += '💰 <b>Keuangan</b>\n';
  msg += '  💵 Total Balance: <b>$' + totalBal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '</b>\n';
  msg += '  📈 Total PnL: <b>$' + totalPnl.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '</b>\n';
  msg += '  🟢 Profit wallets: ' + profitCount + ' | 🔴 Loss: ' + lossCount + '\n';
  msg += '  📊 Total positions: ' + totalPos + '\n\n';
  
  msg += '🏆 <b>Top 5 by PnL</b>\n';
  for (let i = 0; i < top5.length; i++) {
    const w = top5[i];
    const pnlStr = (w.pnl >= 0 ? '+' : '') + '$' + w.pnl.toFixed(2);
    msg += '  ' + (i+1) + '. <code>' + w.addr.slice(0,8) + '</code> ' + pnlStr + ' | Bal: $' + w.bal.toFixed(0) + '\n';
  }
  msg += '\n';
  
  msg += '💀 <b>Bottom 5 by PnL</b>\n';
  for (let i = 0; i < bottom5.length && i < 5; i++) {
    const w = bottom5[i];
    if (w.pnl >= 0) break;
    msg += '  ' + (i+1) + '. <code>' + w.addr.slice(0,8) + '</code> $' + w.pnl.toFixed(2) + ' | Bal: $' + w.bal.toFixed(0) + '\n';
  }
  msg += '\n';
  
  msg += '📋 <b>Commands</b>\n';
  msg += '  /top     — Top 5 PnL detail\n';
  msg += '  /wallets — Daftar wallet\n';
  msg += '  /classify — Klasifikasi ulang\n';
  msg += '  /analyze — Analisis ulang\n';

  tgSendKeyboard(chat, msg, [[{text:'← Kembali ke menu', callback_data:'nav_menu'}]]);
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

// Send changelog
function sendChangelog(chat) {
  console.log('  [TG] sendChangelog called for chat ' + chat);
  try {
    const changelogPath = path.resolve(__dirname, 'CHANGELOG.md');
    console.log('  [TG] changelogPath: ' + changelogPath);
    const content = fs.readFileSync(changelogPath, 'utf8');
    console.log('  [TG] changelog content: ' + content.length + ' chars');
    const maxLen = 4000;
    let remaining = content;
    let part = 1;
    while (remaining.length > 0) {
      let chunk = remaining.slice(0, maxLen);
      const lastNewline = chunk.lastIndexOf('\n');
      if (lastNewline > 0 && remaining.length > maxLen) {
        chunk = chunk.slice(0, lastNewline);
      }
      const header = '📝 <b>Changelog' + (part > 1 ? ' (lanjutan ' + part + ')' : '') + '</b>\n';
      const msg = header + '<pre>' + chunk.replace(/</g,'&lt;') + '</pre>';
      console.log('  [TG] sending part ' + part + ' (' + msg.length + ' chars)');
      tgReply(chat, msg);
      remaining = remaining.slice(chunk.length).trim();
      part++;
    }
    console.log('  [TG] sendChangelog done');
  } catch (e) {
    console.log('  [TG] sendChangelog error: ' + (e?.message || e));
    tgReply(chat, '❌ File CHANGELOG.md tidak ditemukan.');
  }
}

// ─── Kopi Susu Stats ─────────────────────────────────────────────────────────

function sendKopiSusuStats(chat) {
  const KOPI_STATE = '/home/ubuntu/kopi-susu/state.json';
  const KOPI_LOG = '/home/ubuntu/kopi-susu/logs/kopi-susu-output.log';
  
  try {
    if (!fs.existsSync(KOPI_STATE)) {
      tgReply(chat, '❌ File state kopi-susu tidak ditemukan. Pastikan kopi-susu sudah pernah jalan.');
      return;
    }
    
    const state = JSON.parse(fs.readFileSync(KOPI_STATE, 'utf8'));
    const balance = state.simulatedBalance || 0;
    const startBal = state.startBalance || 10;
    const realizedPnl = state.simulatedPnl || 0;
    const unrealizedPnl = state.totalUnrealizedPnl || 0;
    const totalPnl = realizedPnl + unrealizedPnl;
    const active = state.copyPositions?.length || 0;
    const closed = state.totalClosed || 0;
    const deployed = state.totalDeployed || 0;
    const knownWallets = Object.keys(state.knownPositions || {}).length;
    
    // Baca closed positions dari log
    let totalClosedPnl = 0;
    let profitCount = 0, lossCount = 0;
    let latestClosed = [];
    if (fs.existsSync(KOPI_LOG)) {
      const logContent = fs.readFileSync(KOPI_LOG, 'utf8');
      const closeLines = logContent.match(/CLOSED position: [^—]+— PnL: [^\n]+/g) || [];
      for (const line of closeLines.slice(-20)) {
        const pnlMatch = line.match(/PnL: \$(-?[\d.]+)/);
        if (pnlMatch) {
          const p = parseFloat(pnlMatch[1]);
          totalClosedPnl += p;
          if (p > 0) profitCount++;
          else if (p < 0) lossCount++;
          latestClosed.push(line.replace(/.*CLOSED position: /, '').trim());
        }
      }
    }
    
    let msg = '';
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '☕ <b>KOPI SUSU — Overview</b>\n';
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    msg += '💰 <b>Saldo & PnL</b>\n';
    msg += '  💵 Balance: <b>' + balance.toFixed(4) + ' SOL</b>\n';
    msg += '  📊 Modal awal: ' + startBal + ' SOL\n';
    msg += '  📈 Realized PnL: ' + (realizedPnl >= 0 ? '+' : '') + realizedPnl.toFixed(4) + ' SOL\n';
    if (active > 0) {
      msg += '  🔮 Unrealized PnL: ' + (unrealizedPnl >= 0 ? '+' : '') + unrealizedPnl.toFixed(4) + ' SOL\n';
    }
    const totalPct = startBal > 0 ? ((totalPnl / startBal) * 100).toFixed(2) : '0.00';
    msg += '  💎 Total PnL: <b>' + (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(4) + ' SOL (' + totalPct + '%)</b>\n';
    if (active > 0) {
      const projected = startBal + totalPnl;
      const projectedPct = ((projected / startBal) * 100).toFixed(1);
      msg += '  🔮 Jika semua diclose: <b>' + projected.toFixed(4) + ' SOL</b> (' + projectedPct + '% dari ' + startBal + ' SOL)\n';
    }
    msg += '\n';
    
    msg += '📊 <b>Aktivitas</b>\n';
    msg += '  📋 Posisi aktif: <b>' + active + '/7</b>\n';
    msg += '  🔒 Closed: ' + closed + '\n';
    msg += '  💸 Total deploy: ' + deployed + ' SOL\n';
    msg += '  👛 Wallet di-track: ' + knownWallets + '\n\n';
    
    if (active > 0) {
      msg += '📋 <b>Posisi Aktif</b>\n';
      for (const p of (state.copyPositions || [])) {
        const pnl = (p.unrealizedPnl || 0);
        const pnlStr = (pnl >= 0 ? '+' : '') + pnl.toFixed(4);
        let age = '';
        if (p.deployedAt) {
          const diff = Date.now() - new Date(p.deployedAt).getTime();
          const hours = Math.floor(diff / 3600000);
          const mins = Math.floor((diff % 3600000) / 60000);
          age = ' ⏱ ' + hours + 'j ' + mins + 'm';
        }
        msg += '  • ' + (p.poolName || '?') + ' → ' + (p.followedWallet || '?') + ' | ' + pnlStr + ' SOL' + age + '\n';
      }
      msg += '\n';
    }
    
    if (latestClosed.length > 0) {
      msg += '📜 <b>Closed Terbaru</b>\n';
      for (const l of latestClosed.slice(-5)) {
        msg += '  • ' + l + '\n';
      }
      msg += '\n';
    }
    
    msg += '📋 <b>Commands</b>\n';
    msg += '  /ksusu — Pesan ini\n';
    msg += '  /stats — Statistik wallet-collector\n';
    
    tgSendKeyboard(chat, msg, [[{text:'🏠 Menu utama', callback_data:'nav_menu'}]]);
  } catch (e) {
    console.log('  [TG] sendKopiSusuStats error: ' + (e?.message || e));
    tgReply(chat, '❌ Error membaca data kopi-susu: ' + (e?.message || e));
  }
}

function runChartIndicators(chat, addr, interval = 'hour') {
  if (!addr || addr.length < 32) {
    tgReply(chat, '❌ Alamat pool/tidak valid.');
    return;
  }
  tgReply(chat, `⏳ Analisis ${addr.slice(0,8)}... (${interval})`);
  const scriptPath = path.resolve(__dirname, 'chart-indicators.py');
  import('child_process').then(cp => {
    cp.exec(`python3 "${scriptPath}" "${addr}" "${interval}"`, { timeout: 25000 }, (err, stdout, stderr) => {
      if (err) {
        const errMsg = (stderr || '').slice(0, 500).replace(/</g,'&lt;');
        tgReply(chat, `❌ Gagal: ${errMsg || err.message}`);
        return;
      }
      const out = stdout.replace(/</g,'&lt;').trim();
      if (out.length > 4000) {
        tgReply(chat, out.slice(0, 4000));
        tgReply(chat, '📎 Lanjutan:\n' + out.slice(4000, 8000));
      } else {
        tgReply(chat, out);
      }
    });
  }).catch(() => tgReply(chat, '❌ Gagal menjalankan chart indicators.'));
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
        else if (data === 'nav_changelog') {
          tgAnswerCb(cb.id, '📝');
          sendChangelog(chat);
        }
        else if (data === 'nav_ksusu') {
          tgAnswerCb(cb.id, '☕');
          sendKopiSusuStats(chat);
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
          '📋 <b>Commands:</b>\n'+
          '  /start      — Menu utama\n'+
          '  /wallets    — Daftar semua LP wallets\n'+
          '  /wallet <addr> — Detail analisa wallet\n'+
          '  /stats      — Statistik koleksi\\n'+
          '  /ksusu     — ☕ Statistik Kopi Susu\\n'+
          '  /analyze    — Analisis batch ulang\\n' +
          '  /classify   — Klasifikasi smart/bad wallet\\n' +
          '  /changelog  — Riwayat update fitur\\n' +
          '  /i &lt;pool&gt;  — 📊 Chart indicators (RSI, ST, MACD, BB)\\\\n' +
          '  /ca &lt;addr&gt; — 🔎 Analisa token dari CA (EVM/Solana)\\\\n' +
          '  /lp &lt;addr&gt; — 🎯 Skor kelayakan LP + parameter posisi\\\\n' +
          '  /top        — Top 5 wallet by PnL\\n' +
          '  /help       — Pesan ini\\n\\n' +
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
      else if (text === '/changelog') {
        sendChangelog(chat);
      }
      else if (text === '/ksusu' || text === '/kopi') {
        sendKopiSusuStats(chat);
      }
      // ── Chart Indicators ──────────────────────────────────────────
      else if (text === '/i' || text === '/indicator') {
        tgReply(chat, '📊 <b>Chart Indicators</b>\nGunakan: /i &lt;pool_address&gt; [interval]\nAtau kirim langsung alamat pool/token!\n\nContoh: /i 6e7V9eegCHw997T72MxgwwJipZ6GJyZF8NvjkzT1rvpN\nInterval: hour (default), minute, day');
      }
      else if (text.startsWith('/i ') || text.startsWith('/indicator ')) {
        runChartIndicators(chat, text.split(' ')[1], text.split(' ')[2] || 'hour');
      }
      // ── CA Analyzer (multi-chain) ─────────────────────────────────
      else if (text === '/ca' || text === '/analyze-ca') {
        tgReply(chat, '🔎 <b>CA Analyzer</b>\nGunakan: <code>/ca &lt;contract_address&gt;</code>\nMendukung EVM (0x…) & Solana (base58).\nContoh: /ca 0xbc2283d12b1f2f46c1613ae672e95c55b69ca414');
      }
      else if (text.startsWith('/ca ')) {
        runCaAnalysis({ addr: text.slice(4).trim(), send: (t) => tgReply(chat, t) });
      }
      // ── LP Decision (universal scorer) ────────────────────────────
      else if (text === '/lp') {
        tgReply(chat, '🎯 <b>LP Decision</b>\nGunakan: <code>/lp &lt;contract_address&gt;</code>\nMenilai kelayakan LP + parameter posisi (size, range, SL/TP).\nEVM & Solana.\nContoh: /lp 0xbc2283d12b1f2f46c1613ae672e95c55b69ca414');
      }
      else if (text.startsWith('/lp ')) {
        const parts = text.slice(4).trim().split(/\s+/);
        const addr = parts[0];
        const sizeSol = parts[1] ? parseFloat(parts[1]) : 1.0;
        runLpDecision({ addr, send: (t) => tgReply(chat, t), maxSize: Number.isFinite(sizeSol) ? sizeSol : 1.0 });
      }
      // Auto-detect EVM contract address (0x…40 hex)
      else if (/^0x[a-fA-F0-9]{40}$/.test(text)) {
        runCaAnalysis({ addr: text, send: (t) => tgReply(chat, t) });
      }
      // Auto-detect Solana address (pool atau token) — bukan command yang dikenal
      else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) && !lpWallets.has(text)) {
        runChartIndicators(chat, text);
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
          // Quick score filter: skip wallet with very low potential
          const quickPnl = parseFloat(portfolio.total?.pnl||0);
          const quickBal = parseFloat(portfolio.total?.balances||0);
          const quickPos = portfolio.totalPositions||0;
          const quickScore = quickPnl + (quickBal > 100 ? 10 : 0) + (quickPos >= 3 ? 15 : 0);
          if (quickScore < 15) {
            console.log('  ⏭️  Skip low-score wallet: '+addr.slice(0,8)+'... (score='+quickScore+')');
            continue;
          }
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

// ─── Global error handlers ────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.log('  ⚠️ [FATAL] Uncaught exception: '+(err?.message||err));
  console.log('  ⚠️ Process will continue running');
});

process.on('unhandledRejection', (err) => {
  console.log('  ⚠️ [FATAL] Unhandled rejection: '+(err?.message||err));
  console.log('  ⚠️ Process will continue running');
});

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
    try {
      conn.onLogs(new PublicKey(pool.address), (logs) => {
        if (logs.signature) pendingSigs.add(logs.signature);
      }, 'confirmed');
    } catch (e) {
      console.log('  ⚠️ Failed to subscribe to logs for '+pool.name+': '+(e?.message||e));
    }
  }

  setInterval(() => processBatch(conn, pools), 5000);
  setInterval(() => saveIndex(), 60_000);

  console.log('  🎯  Only saving wallets with open LP positions');
  if (TG_API) {
    // Quick test Telegram connection — silent fail jika gak reachable
    fetch(TG_API+'/getMe').then(r => {
      if (r.ok) {
        console.log('  Telegram: ✅ — /help for commands');
        // Only start polling if Telegram is actually reachable
        startTgPolling();
      } else {
        console.log('  Telegram: ❌ — unreachable (status '+r.status+')');
      }
    }).catch(() => {
      console.log('  Telegram: ❌ — fetch failed, polling disabled');
    });
  }

  const poolList = pools.map(p => '<code>'+p.name+'</code>').join(', ');
  // Startup notification di-disable — tidak kirim ke Telegram

  // Start API server for Meridian integration
  startApiServer();

  // ─── Adaptive Telegram polling ─────────────────────────────────────────
  function startTgPolling() {
    let tgPollInterval = 5000;       // 5 detik default
    let tgLastActivity = Date.now();
    const TG_IDLE_TIMEOUT = 300_000; // 5 menit idle → slow poll
    const TG_FAST_INTERVAL = 5000;   // 5 detik
    const TG_SLOW_INTERVAL = 30000;  // 30 detik saat idle

    // Track wallet discovery as activity
    const origLog = console.log;
    console.log = (...args) => {
      tgLastActivity = Date.now();
      origLog.apply(console, args);
    };

    async function pollLoop() {
      await pollTgCommands();
      const idle = Date.now() - tgLastActivity;
      tgPollInterval = idle > TG_IDLE_TIMEOUT ? TG_SLOW_INTERVAL : TG_FAST_INTERVAL;
      setTimeout(pollLoop, tgPollInterval);
    }
    pollLoop();
  }

  process.on('SIGINT', async () => { saveIndex(); process.exit(0); });
  process.on('SIGTERM', () => { saveIndex(); process.exit(0); });

  // ─── Auto Re-Analyze ───────────────────────────────────────────────────
  const ANALYZE_INTERVAL = 30 * 60_000; // 30 menit
  setInterval(() => {
    const cp = spawn('node', [path.resolve(__dirname, 'analyze.js')], {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env },
    });
    cp.on('error', (e) => console.log('  ⚠️ analyze.js spawn error: ' + e.message));
    cp.on('exit', (code) => {
      if (code !== 0) console.log('  ⚠️ analyze.js exited with code ' + code);
    });
  }, ANALYZE_INTERVAL);
  // Run first analyze after 5s delay (give listener time to start)
  setTimeout(() => {
    const cp = spawn('node', [path.resolve(__dirname, 'analyze.js')], {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env },
    });
    cp.on('error', (e) => console.log('  ⚠️ initial analyze.js spawn error: ' + e.message));
  }, 5000);
}
