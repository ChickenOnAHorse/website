/* COAH Balance (no RMB) — PT-accurate, excludes "today"
   Unlocked = sum(unlocked credits) - sum(all debits) + correction
*/

(() => {
  // ======== PASSWORD CONFIG ========
  const PASSWORD_SHA256_HEX = "e0fe87b9ef1bd5b345269890a4f357dd7e531e7bba307ac691567600a049897f";
  const SESSION_KEY = "balance_authed";

  // ======== DATA SOURCE ============
  const EVENTS_URL = "https://script.google.com/macros/s/AKfycbwzMbiwQp4m0CBukYfKbiOZ3An05tZcLt2LI-AZ46iuQ07J_OUa6V38CfLw_Umo_QzL/exec"; // <-- paste /exec URL

  // ======== DEBUG ========
  const DEBUG_COMPUTE = true;

  // ---------- Password gate ----------
  function normalizeInput(s){ return (s || '').replace(/\u00A0/g,' ').trim(); }
  async function sha256Hex(str){ const enc = new TextEncoder().encode(str); const buf = await crypto.subtle.digest('SHA-256', enc); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  function showApp(){ document.getElementById('gate').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); }
  function initGate(){
    const err  = document.getElementById('err');
    const warn = document.getElementById('warn');
    const pw   = document.getElementById('pw');
    const enter= document.getElementById('enterBtn');
    const cryptoOK = (typeof window.crypto !== 'undefined') && (typeof window.crypto.subtle !== 'undefined');
    if (!cryptoOK) warn.style.display = 'block';
    if (sessionStorage.getItem(SESSION_KEY) === '1') { showApp(); loadAndRender(); return; }
    async function tryLogin(e){
      if (e) e.preventDefault();
      err.style.display = 'none';
      if (!cryptoOK){ err.textContent = 'Secure crypto unavailable (need HTTPS).'; err.style.display='block'; return; }
      const hash = await sha256Hex(normalizeInput(pw.value));
      if (hash === PASSWORD_SHA256_HEX){ sessionStorage.setItem(SESSION_KEY,'1'); showApp(); loadAndRender(); }
      else { err.textContent = 'Incorrect password.'; err.style.display='block'; pw.select(); }
    }
    enter.addEventListener('click', tryLogin);
    pw.addEventListener('keydown', e => { if (e.key === 'Enter' || e.keyCode === 13) tryLogin(e); });
  }

  // ---------- Balance logic ----------
  const PT_TZ = "America/Los_Angeles";
  const START_OFFSET_DAYS = 1; // schedule starts tomorrow

  const SITE = {
    csfloat: { lockDays: 9, horizon: 9,
      ids: { total:'#cs-total', unlocked:'#cs-unlocked', pending:'#cs-pending', up:'#cs-unlockedPct', pp:'#cs-pendingPct', sched:'#cs-schedule', asof:'#cs-asof' }
    },
    youpin:  { lockDays: 8, horizon: 8,
      ids: { total:'#yp-total', unlocked:'#yp-unlocked', pending:'#yp-pending', up:'#yp-unlockedPct', pp:'#yp-pendingPct', sched:'#yp-schedule', asof:'#yp-asof' }
    }
  };

  const fmtUSD = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });

  function todayYMD_PT(){
    return new Intl.DateTimeFormat('en-CA', { timeZone: PT_TZ, year:'numeric', month:'2-digit', day:'2-digit' })
      .format(new Date()); // "YYYY-MM-DD"
  }
  function ymdToInt(ymd){ const [y,m,d] = ymd.split('-').map(n=>parseInt(n,10)); return y*10000 + m*100 + d; }
  function addDaysYMD(ymd, n){
    const [y,m,d] = ymd.split('-').map(n=>parseInt(n,10));
    const dt = new Date(Date.UTC(y, m-1, d) + n*86400000);
    const yy = dt.getUTCFullYear(), mm = String(dt.getUTCMonth()+1).padStart(2,'0'), dd = String(dt.getUTCDate()).padStart(2,'0');
    return `${yy}-${mm}-${dd}`;
  }
  function labelFromYMD(ymd){
    const [y,m,d] = ymd.split('-').map(n=>parseInt(n,10));
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[m-1]} ${String(d).padStart(2,'0')}, ${String(y).slice(-2)}`;
  }
  function sum(a){ return a.reduce((x,y)=>x+y,0); }

  // site normalization safety net
  function normalizeSiteName(s){
    const t = String(s || '').toLowerCase().trim().replace(/\s+/g,'');
    if (t.startsWith('youpin') || t.startsWith('youpin898') || t.includes('yp898')) return 'youpin';
    if (t.includes('csfloat') || t.includes('cs-float') || t==='csf' || t==='cs' || t.includes('csfloa') || t==='float') return 'csfloat';
    return '';
  }

  let LAST_TODAY = todayYMD_PT();
  let STATE = {
    events: [],
    corrections: { csfloat:0, youpin:0 }
  };

  function computeForSite(siteKey){
    const { lockDays, horizon } = SITE[siteKey];
    const today = todayYMD_PT();
    const todayInt = ymdToInt(today);

    const evs = STATE.events.filter(e => e.site === siteKey);
    const debitList  = evs.filter(e => e.type === 'debit').map(e => Number(e.amount)||0);
    const creditList = evs.filter(e => e.type === 'credit').map(e => Number(e.amount)||0);

    const debitsSum  = sum(debitList);

    const unlockedCredits = [];
    const pendingCredits  = []; // { amount, unlockYMD }

    for (const c of evs.filter(e=>e.type==='credit')){
      const unlockYMD = addDaysYMD(c.date, lockDays);
      if (ymdToInt(unlockYMD) <= todayInt) unlockedCredits.push(Number(c.amount)||0);
      else pendingCredits.push({ amount:Number(c.amount)||0, unlockYMD });
    }

    const unlockedCreditsSum = sum(unlockedCredits);
    const pendingSum         = sum(pendingCredits.map(p=>p.amount));
    const correction         = (siteKey === 'csfloat' ? Number(STATE.corrections.csfloat)||0 : Number(STATE.corrections.youpin)||0);

    const unlocked = unlockedCreditsSum - debitsSum + correction;
    const total    = unlocked + pendingSum;

    // schedule from tomorrow forward
    const byDay = new Map();
    for (const p of pendingCredits) {
      byDay.set(p.unlockYMD, (byDay.get(p.unlockYMD)||0) + p.amount);
    }

    const rows = [];
    let cumulative = 0;
    for (let i = START_OFFSET_DAYS; i < START_OFFSET_DAYS + horizon; i++){
      const ymd = addDaysYMD(today, i);
      const unlocking = byDay.get(ymd) || 0;
      cumulative += unlocking;
      rows.push({ ymd, unlocking, cumulative });
    }

    if (DEBUG_COMPUTE) {
      console.log(`[balance][${siteKey}] unlockedCredits=${unlockedCreditsSum.toFixed(2)} debits=${debitsSum.toFixed(2)} correction=${correction.toFixed(2)} => Unlocked=${unlocked.toFixed(2)} Pending=${pendingSum.toFixed(2)} Total=${total.toFixed(2)}`);
    }

    return { total, unlocked, pending: pendingSum, rows, today };
  }

  function renderSite(siteKey){
    const ids = SITE[siteKey].ids;
    const result = computeForSite(siteKey);

    document.querySelector(ids.total).textContent    = fmtUSD.format(result.total);
    document.querySelector(ids.unlocked).textContent = fmtUSD.format(result.unlocked);
    document.querySelector(ids.pending).textContent  = fmtUSD.format(result.pending);

    const upct = result.total>0 ? (result.unlocked/result.total*100).toFixed(1)+'% of total' : '—';
    const ppct = result.total>0 ? (result.pending/result.total*100).toFixed(1)+'% of total'  : '—';
    document.querySelector(ids.up).textContent = upct;
    document.querySelector(ids.pp).textContent = ppct;

    const tbody = document.querySelector(ids.sched);
    tbody.innerHTML = '';
    for (const r of result.rows){
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      const td2 = document.createElement('td');
      const td3 = document.createElement('td');
      td1.textContent = labelFromYMD(r.ymd);
      td2.textContent = fmtUSD.format(r.unlocking);
      td3.textContent = fmtUSD.format(r.cumulative);
      td2.className = 'num'; td3.className = 'num';
      tr.append(td1, td2, td3);
      tbody.appendChild(tr);
    }

    document.querySelector(ids.asof).textContent = `as of ${labelFromYMD(result.today)} PT`;
  }

  function renderAll(){ renderSite('csfloat'); renderSite('youpin'); }

  async function loadAndRender(){
    try{
      const res = await fetch(`${EVENTS_URL}?t=${Date.now()}`, { cache:'no-store', credentials:'omit' });
      const data = await res.json();

      if (!data || data.ok !== true || !Array.isArray(data.events)) throw new Error('Bad JSON');

      STATE.events = data.events
        .filter(e => e && (e.type==='credit' || e.type==='debit'))
        .map(e => ({
          site: normalizeSiteName(e.site),
          type: e.type,
          amount: Number(e.amount)||0,
          date: String(e.date) // "YYYY-MM-DD"
        }))
        .filter(e => e.site === 'csfloat' || e.site === 'youpin');

      STATE.corrections = {
        csfloat: Number(data.corrections?.csfloat) || 0,
        youpin:  Number(data.corrections?.youpin)  || 0
      };
    } catch (err){
      console.error('Balance load error:', err);
      // keep last state so UI still renders
    }
    renderAll();
  }

  // PT midnight rollover watcher
  function startMidnightWatcher(){
    setInterval(() => {
      const nowYMD = todayYMD_PT();
      if (nowYMD !== LAST_TODAY) { LAST_TODAY = nowYMD; loadAndRender(); }
    }, 60 * 1000);
  }

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    initGate();
    if (sessionStorage.getItem(SESSION_KEY) === '1') loadAndRender();
    startMidnightWatcher();
  });

  // Manual refresh via console
  window.COAHBalance = { refresh: loadAndRender };
})();
