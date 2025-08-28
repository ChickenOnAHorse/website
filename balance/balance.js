/* Balance dashboard (PT-accurate, excludes "today"), with RMB on YouPin KPIs and schedule */

(() => {
  // ======== PASSWORD CONFIG ========
  const PASSWORD_SHA256_HEX = "e0fe87b9ef1bd5b345269890a4f357dd7e531e7bba307ac691567600a049897f";
  const SESSION_KEY = "balance_authed";

  // ======== DATA SOURCE ============
  const EVENTS_URL = "https://script.google.com/macros/s/AKfycbzER2G3jvYy9BvjSOq6uPgvNw7JlYb1p5CtjDTDqAtMXPJoT6n_mKw27ChoZZQyU-IA/exec"; // <-- paste your /exec URL

  // ======== DEBUG ========
  const DEBUG_NET = false;

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
  const START_OFFSET_DAYS = 1; // pending schedule starts at tomorrow

  const SITE = {
    csfloat: { lockDays: 9, horizon: 9,
      ids: { total:'#cs-total', unlocked:'#cs-unlocked', pending:'#cs-pending', up:'#cs-unlockedPct', pp:'#cs-pendingPct', sched:'#cs-schedule', asof:'#cs-asof' }
    },
    youpin:  { lockDays: 8, horizon: 8,
      ids: { total:'#yp-total', unlocked:'#yp-unlocked', pending:'#yp-pending', up:'#yp-unlockedPct', pp:'#yp-pendingPct', sched:'#yp-schedule', asof:'#yp-asof' }
    }
  };

  const fmtUSD = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
  const fmtCNY = new Intl.NumberFormat('zh-CN', { style:'currency', currency:'CNY', maximumFractionDigits:2 });

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

  // client-side site normalization as a safety net
  function normalizeSiteName(s){
    const t = String(s || '').toLowerCase().trim();
    if (t.includes('csfloat')) return 'csfloat';
    if (t.startsWith('youpin')) return 'youpin'; // handles "youpin (0.5% fee)"
    return '';
  }

  // state
  let LAST_TODAY = todayYMD_PT();
  let STATE = {
    events: [],
    corrections: { csfloat:0, youpin:0 },
    fx: { rmbPerUSD: 7.0 }
  };

  function computeForSite(siteKey){
    const { lockDays, horizon } = SITE[siteKey];
    const today = todayYMD_PT();
    const todayInt = ymdToInt(today);

    const evs = STATE.events.filter(e => e.site === siteKey);
    const debits  = evs.filter(e => e.type === 'debit').map(e => e.amount);
    const credits = evs.filter(e => e.type === 'credit');

    const unlockedCredits = [];
    const pendingCredits  = []; // { amount, unlockYMD }

    for (const c of credits){
      const unlockYMD = addDaysYMD(c.date, lockDays);
      if (ymdToInt(unlockYMD) <= todayInt) unlockedCredits.push(c.amount);
      else pendingCredits.push({ amount:c.amount, unlockYMD });
    }

    // unlocked = (all unlocked credits) - (all debits) + correction
    let unlocked = sum(unlockedCredits) - sum(debits);
    const correction = (siteKey === 'csfloat' ? STATE.corrections.csfloat : STATE.corrections.youpin) || 0;
    unlocked += correction;

    const pending = sum(pendingCredits.map(p=>p.amount));
    const total   = unlocked + pending;

    // schedule from tomorrow forward
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

  // Helper: set KPI text; for YouPin we include RMB equivalents
  function setKPI(ids, siteKey, { total, unlocked, pending }, rate){
    const $ = (sel) => document.querySelector(sel);
    const usd = (v)=>fmtUSD.format(v);
    const cny = (v)=>fmtCNY.format(v);

    if (siteKey === 'youpin' && rate > 0){
      $(ids.total).textContent    = `${usd(total)} (${cny(total*rate)})`;
      $(ids.unlocked).textContent = `${usd(unlocked)} (${cny(unlocked*rate)})`;
      $(ids.pending).textContent  = `${usd(pending)} (${cny(pending*rate)})`;
    } else {
      $(ids.total).textContent    = usd(total);
      $(ids.unlocked).textContent = usd(unlocked);
      $(ids.pending).textContent  = usd(pending);
    }

    const upct = total>0 ? (unlocked/total*100).toFixed(1)+'% of total' : '—';
    const ppct = total>0 ? (pending/total*100).toFixed(1)+'% of total'  : '—';
    $(ids.up).textContent = upct;
    $(ids.pp).textContent = ppct;
  }

  function renderSite(siteKey){
    const ids = SITE[siteKey].ids;
    const rate = Number(STATE.fx.rmbPerUSD) || 7.0;
    const result = computeForSite(siteKey);
    setKPI(ids, siteKey, result, rate);

    const tbody = document.querySelector(ids.sched);
    tbody.innerHTML = '';
    for (const r of result.rows){
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      const td2 = document.createElement('td');
      const td3 = document.createElement('td');

      td1.textContent = labelFromYMD(r.ymd);

      if (siteKey === 'youpin' && rate > 0) {
        const rmbUnlock = r.unlocking * rate;
        const rmbCum    = r.cumulative * rate;
        td2.textContent = `${fmtUSD.format(r.unlocking)} (${fmtCNY.format(rmbUnlock)})`;
        td3.textContent = `${fmtUSD.format(r.cumulative)} (${fmtCNY.format(rmbCum)})`;
      } else {
        td2.textContent = fmtUSD.format(r.unlocking);
        td3.textContent = fmtUSD.format(r.cumulative);
      }

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
      if (DEBUG_NET) console.log('[balance] JSON:', data);

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
      STATE.fx = { rmbPerUSD: Number(data.fx?.rmbPerUSD) || STATE.fx.rmbPerUSD };
    } catch (err){
      console.error('Balance load error:', err);
      // keep last state; UI will still render
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
