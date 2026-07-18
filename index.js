import axios from 'axios';
import startListener from './listener.js';

const DLMM_API      = 'https://dlmm.datapi.meteora.ag';
const PAGE_SIZE     = 100;
const SORT_BY       = 'fee_24h:desc';      // top performance: pools dgn fee 24h tertinggi
const FILTER_BY     = 'is_blacklisted=false';
const MIN_TVL       = 1000;                  // minimal TVL $1K hindari pool sampah
const IGNORE_TOKENS = ['USDC', 'USDT', 'HYPE'];
const TOP_N         = 2;                     // ambil 2 pool teratas

function fmtUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  if (v >= 1_000_000) return '$'+(v/1_000_000).toFixed(2)+'M';
  if (v >= 1_000)     return '$'+(v/1_000).toFixed(2)+'K';
  return '$'+v.toFixed(2);
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  return Number(n).toFixed(2)+'%';
}

async function fetchTopPools() {
  const { data } = await axios.get(DLMM_API+'/pools', {
    params: { page:1, page_size:PAGE_SIZE, sort_by:SORT_BY, filter_by:FILTER_BY },
  });
  return data.data
    .filter(p => {
      const n=(p.name||'').toUpperCase();
      return !IGNORE_TOKENS.some(t=>n.includes(t)) && (p.tvl||0) >= MIN_TVL;
    })
    .slice(0,5)
    .map(p => ({
      address:p.address,
      name:p.name,
      tvl:p.tvl,
      volume_24h:p.volume?.['24h']??0,
      apr:p.apr,
      fee_tvl_ratio:p.fee_tvl_ratio?.['24h']??0,
      fee_24h:p.fees?.['24h']??0,
    }));
}

async function main() {
  const args = process.argv.slice(2);
  const poolArg = args.find(a => a.startsWith('--pool=')||a.startsWith('-p='));

  console.log('');
  console.log('  M E T E O R A   W A L L E T   C O L L E C T O R');
  console.log('');

  // Fetch trending pools
  console.log('  Fetching top performance pools...');
  const pools = await fetchTopPools();
  if (pools.length === 0) { console.error('  No pools found'); process.exit(1); }

  // Jika --pool=1,2,3 specified, ambil pool by index
  if (poolArg) {
    const nums = poolArg.split('=')[1].split(',').map(Number).filter(n => n>=1 && n<=pools.length);
    if (nums.length === 0) { console.error('  Invalid pool numbers'); process.exit(1); }
    const selected = nums.map(n => pools[n-1]);
    console.log('  Selected pools: ' + selected.map(p => p.name).join(', '));
    console.log('');
    await startListener(selected);
    return;
  }

  // Default: auto-select top 2 pools
  const selected = pools.slice(0, TOP_N);
  console.log('');
  console.log('  Auto-selected top '+TOP_N+' pools:');
  selected.forEach((p,i) => {
    console.log('  '+(i+1)+'. '+p.name+
      '  Fee 24h: '+fmtUsd(p.fee_24h)+
      '  APR: '+fmtPct(p.apr)+
      '  TVL: '+fmtUsd(p.tvl)+
      '  Vol: '+fmtUsd(p.volume_24h));
  });
  console.log('');
  await startListener(selected);
}

main();
