/* Password gate + live balance dashboard (PT-accurate, excludes "today" in pending list)
   - Sites:
       CSFloat  -> lock 9 days, horizon 9 days
       YouPin   -> lock 8 days, horizon 8 days
   - Dates from sheet are PT calendar days ("YYYY-MM-DD").
   - Pending schedule starts at **tomorrow** (not today).
*/

(() => {
  // ======== PASSWORD CONFIG ========
  const PASSWORD_SHA256_HEX = "e0fe87b9ef1bd5b345269890a4f357dd7e531e7bba307ac691567600a049897f";
  const SESSION_KEY = "balance_authed";
  const DEBUG_LOG_HASH = false;

  // ======== DATA SOURCE ============
  const EVENTS_URL = "https://script.google.com/macros/s/PUT_YOUR_DEPLOY_ID/exec"; // <-- paste your /exec URL
  const DEBUG_NET = false; // set true to log fetched JSON

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
      const entered = normalizeInput(pw.value);
      if (!entered){ err.textContent = 'Please enter a password.'; err.style.display='block'; pw.focus(); return; }
      const hash = await sha256Hex(entered);
      if (DEBUG_LOG_HASH) console.log('[balance] computed hash:', hash);
      if (hash === PASSWORD_SHA256_HEX){ sessionStorage.setItem(SESSION_KEY,'1'); showApp(); loadAndRender(); }
      else { err.textContent = 'Incorrect password.'; err.style.display='block'; pw.select(); }
    }

    enter.addEventListener('click', tryLogin);
    pw.addEventListener('keydown', e => { if (e.key === 'Enter' || e.keyCode === 13) tryLogin(e); });
  }

  // ---------- Balance logic (PT calendar dates) ----------
  const PT_TZ = "America/Los_Angeles";
  // Start pending schedule at **tomorrow** (1). Set to 0 if you ever want to include today.
  const START_OFFSET_DAYS = 1;

  const SITE = {
    csfloat: { lockDays: 9, horizon: 9,
      ids: { total:'#cs-total', unlocked:'#cs-unlocked', pending:'#cs-pending', up:'#cs-unlockedPct', pp:'#cs-pendingPct', sched:'#cs-schedule', asof:'#cs-asof' }
    },
    youpin:  { lockDays: 8, horizon: 8,
      ids: { total:'#yp-total', unlocked:'#yp-unlocked', pending:'#yp-pending', up:'#yp-unlockedPct', pp:'#yp-pendingPct', sched:'#yp-schedule', asof:'#yp-asof' }
    }
  };

  const fmtUSD = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });

  // PT day helpers (string-based to avoid DST drift)
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

  function computeForSite(siteKey, events, corrections){
    const { lockDays, horizon } = SITE[siteKey];
    const today = todayYMD_PT();
    const todayInt = ymdToInt(today);

    const evs = events.filter(e => e.site === siteKey);
    const debits  = evs.filter(e => e.type === 'debit').map(e => e.amount);
    const credits = evs.filter(e => e.type === 'credit');

    const unlockedCredits = [];
    const pendingCredits  = []; // { amount, unlockYMD }

    for (const c of credits){
      const eventYMD  = c.date;                      // "YYYY-MM-DD" PT from Apps Script
      const unlockYMD = addDaysYMD(eventYMD, lockDays); // unlock at PT midnight after N days
      if (ymdToInt(unlockYMD) <= todayInt) unlockedCredits.push(c.amount);
      else pendingCredits.push({ amount:c.amount, unlockYMD });
    }

    let unlocked = sum(unlockedCredits) - sum(debits);
    // Add correction factor to unlocked
    const correction = (siteKey === 'csfloat' ? corrections.csfloat : corrections.youpin) || 0;
    unlocked += correction;

    const pending = sum(pendingCredits.map(p=>p.amount));
    const total   = unlocked + pending;

    // Schedule from **tomorrow** forward (no past or "today" rows)
    const byDay = new Map(); // unlockYMD -> amount
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

    return { total, unlocked, pending, rows, today };
  }

  function renderSite(siteKey, events, corrections){
    const ids = SITE[siteKey].ids;
    const { total, unlocked, pending, rows, today } = computeForSite(siteKey, events, corrections);

    document.querySelector(ids.total).textContent    = fmtUSD.format(total);
    document.querySelector(ids.unlocked).textContent = fmtUSD.format(unlocked);
    document.querySelector(ids.pending).textContent  = fmtUSD.format(pending);

    const upct = total>0 ? (unlocked/total*100).toFixed(1)+'% of total' : '—';
    const ppct = total>0 ? (pending/total*100).toFixed(1)+'% of total'  : '—';
    document.querySelector(ids.up).textContent = upct;
    document.querySelector(ids.pp).textContent = ppct;

    const tbody = document.querySelector(ids.sched);
    tbody.innerHTML = '';
    for (const r of rows){
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

    document.querySelector(ids.asof).textContent = `as of ${labelFromYMD(today)} PT`;
  }

  // ---- Load + render ----
  let LIVE = { events: [], corrections: { csfloat:0, youpin:0 } };
  let LAST_TODAY = todayYMD_PT();

  async function loadAndRender(){
    try{
      const url = `${EVENTS_URL}?t=${Date.now()}`; // bust caches
      const res = await fetch(url, { cache:'no-store', credentials:'omit' });
      const data = await res.json();

      if (DEBUG_NET) console.log('[balance] fetched JSON:', data);

      if (!data || data.ok !== true || !Array.isArray(data.events)) throw new Error('Bad JSON shape');

      LIVE.events = data.events
        .filter(e => (e.site==='csfloat' || e.site==='youpin') && (e.type==='credit' || e.type==='debit'))
        .map(e => ({ site:e.site, type:e.type, amount:Number(e.amount)||0, date:String(e.date) })); // "YYYY-MM-DD"

      LIVE.corrections = {
        csfloat: Number(data.corrections?.csfloat) || 0,
        youpin:  Number(data.corrections?.youpin)  || 0
      };
    } catch (err){
      console.error('Failed to load events:', err);
      LIVE = { events: [], corrections: { csfloat:0, youpin:0 } };
    }

    renderSite('csfloat', LIVE.events, LIVE.corrections);
    renderSite('youpin',  LIVE.events, LIVE.corrections);
  }

  // Auto-rollover at PT midnight (checks each minute)
  function startMidnightWatcher(){
    setInterval(() => {
      const nowYMD = todayYMD_PT();
      if (nowYMD !== LAST_TODAY) {
        LAST_TODAY = nowYMD;
        loadAndRender();
      }
    }, 60 * 1000);
  }

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    initGate();
    if (sessionStorage.getItem(SESSION_KEY) === '1') loadAndRender();
    startMidnightWatcher();
  });

  // Manual refresh via console if needed
  window.COAHBalance = { refresh: loadAndRender };
})();
