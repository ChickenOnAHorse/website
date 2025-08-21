/* Password gate + live balance dashboard
   - Fetches events + corrections from your Apps Script Web App
   - Sites:
       CSFloat  -> lock 9 days, horizon 9 days
       YouPin   -> lock 8 days, horizon 8 days
   - Dates from sheet are PT calendar days (YYYY-MM-DD).
*/

(() => {
  // ======== PASSWORD CONFIG ========
  const PASSWORD_SHA256_HEX = "e0fe87b9ef1bd5b345269890a4f357dd7e531e7bba307ac691567600a049897f";
  const SESSION_KEY = "balance_authed";
  const DEBUG_LOG_HASH = false;
  // ======== DATA SOURCE ============
  const EVENTS_URL = "https://script.google.com/macros/s/AKfycbyyuQUaKYNC1iWwCdMDoKcP3_n9vsCfu5WfljytAEIyI7RLs_TaGodMNbKhAMnCocd4/exec"; // <-- set your /exec URL
  // =================================

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

  // ---------- Balance logic ----------
  const PT_TZ = "America/Los_Angeles";
  const SITE = {
    csfloat: { lockDays: 9, horizon: 9,
      ids: { total:'#cs-total', unlocked:'#cs-unlocked', pending:'#cs-pending', up:'#cs-unlockedPct', pp:'#cs-pendingPct', sched:'#cs-schedule', asof:'#cs-asof' }
    },
    youpin:  { lockDays: 8, horizon: 8,
      ids: { total:'#yp-total', unlocked:'#yp-unlocked', pending:'#yp-pending', up:'#yp-unlockedPct', pp:'#yp-pendingPct', sched:'#yp-schedule', asof:'#yp-asof' }
    }
  };
  const fmtUSD  = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
  const fmtDate = new Intl.DateTimeFormat('en-US', { timeZone: PT_TZ, month:'short', day:'2-digit', year:'2-digit' });

  // Robust “today in PT” as a UTC key (never off by DST)
  function todayKeyPT() {
    const nowPT = new Date(new Date().toLocaleString('en-US', { timeZone: PT_TZ }));
    const y = nowPT.getFullYear(), m = nowPT.getMonth(), d = nowPT.getDate();
    return Date.UTC(y, m, d);
  }
  function dayKeyFromYMD(ymd){ const [y,m,d] = ymd.split('-').map(n=>parseInt(n,10)); return Date.UTC(y, m-1, d); }
  function addDaysKey(keyUTC, n){ return keyUTC + n*86400000; }
  function labelFromKey(keyUTC){ return fmtDate.format(new Date(keyUTC)); }
  function sum(a){ return a.reduce((x,y)=>x+y,0); }

  function computeForSite(siteKey, events, corrections){
    const { lockDays, horizon } = SITE[siteKey];
    const todayKey = todayKeyPT();

    const evs = events.filter(e => e.site === siteKey);
    const debits  = evs.filter(e => e.type === 'debit').map(e => e.amount);
    const credits = evs.filter(e => e.type === 'credit');

    const unlockedCredits = [];
    const pendingCredits  = []; // {amount, unlockKey}

    for (const c of credits){
      const eventKey  = dayKeyFromYMD(c.date);             // PT date from sheet
      const unlockKey = addDaysKey(eventKey, lockDays);    // PT midnight after N days
      if (unlockKey <= todayKey) unlockedCredits.push(c.amount);
      else pendingCredits.push({ amount:c.amount, unlockKey });
    }

    let unlocked = sum(unlockedCredits) - sum(debits);
    // add correction factor for this site (can be +/-)
    const correction = (siteKey === 'csfloat' ? corrections.csfloat : corrections.youpin) || 0;
    unlocked += correction;

    const pending  = sum(pendingCredits.map(p=>p.amount));
    const total    = unlocked + pending;

    // schedule from *today forward* only (no past days)
    const byDay = new Map();
    for (const p of pendingCredits) {
      byDay.set(p.unlockKey, (byDay.get(p.unlockKey)||0) + p.amount);
    }

    const rows = [];
    let cumulative = 0;
    for (let i=0; i<horizon; i++){
      const key = addDaysKey(todayKey, i);
      const unlocking = byDay.get(key) || 0; // past days are not in map (they were unlocked)
      cumulative += unlocking;
      rows.push({ key, unlocking, cumulative });
    }

    return { total, unlocked, pending, rows, todayKey };
  }

  function renderSite(siteKey, events, corrections){
    const ids = SITE[siteKey].ids;
    const { total, unlocked, pending, rows, todayKey } = computeForSite(siteKey, events, corrections);

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
      td1.textContent = labelFromKey(r.key);
      td2.textContent = fmtUSD.format(r.unlocking);
      td3.textContent = fmtUSD.format(r.cumulative);
      td2.className = 'num'; td3.className = 'num';
      tr.append(td1, td2, td3);
      tbody.appendChild(tr);
    }

    document.querySelector(ids.asof).textContent = `as of ${labelFromKey(todayKey)} PT`;
  }

  // ---- Load + render ----
  let LIVE = { events: [], corrections: { csfloat:0, youpin:0 } };

  async function loadAndRender(){
    try{
      const res = await fetch(EVENTS_URL, { cache:'no-store', credentials:'omit' });
      const data = await res.json();
      if (!data || data.ok !== true || !Array.isArray(data.events)) throw new Error('Bad JSON');
      LIVE.events = data.events
        .filter(e => (e.site==='csfloat' || e.site==='youpin') && (e.type==='credit' || e.type==='debit'))
        .map(e => ({ site:e.site, type:e.type, amount:Number(e.amount)||0, date:String(e.date) }));
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

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    initGate();
    if (sessionStorage.getItem(SESSION_KEY) === '1') loadAndRender();
  });

  // For console/manual refresh
  window.COAHBalance = { refresh: loadAndRender };
})();
