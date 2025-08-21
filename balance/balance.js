/* Password gate + Balance dashboard (no tabs, fixed 8-day horizon)
   - Uses SHA-256 compare in-browser (no plaintext password)
   - After auth, shows CSFloat and YouPin blocks with totals + 8-day release schedule
*/

(() => {
  // ======== PASSWORD CONFIG ========
  // Paste your SHA-256 hex here (of the *password* you will type):
  const PASSWORD_SHA256_HEX = "e0fe87b9ef1bd5b345269890a4f357dd7e531e7bba307ac691567600a049897f";
  const SESSION_KEY = "balance_authed";
  const DEBUG_LOG_HASH = false; // set true temporarily to see computed hash in Console
  // =================================

  // ---------- Gate wiring ----------
  function normalizeInput(s){ return (s || '').replace(/\u00A0/g,' ').trim(); }

  async function sha256Hex(str){
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function showApp(){
    document.getElementById('gate').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  }

  function initGate(){
    const gate = document.getElementById('gate');
    const app  = document.getElementById('app');
    const err  = document.getElementById('err');
    const warn = document.getElementById('warn');
    const pw   = document.getElementById('pw');
    const enter= document.getElementById('enterBtn');

    // crypto requirement
    const cryptoOK = (typeof window.crypto !== 'undefined') && (typeof window.crypto.subtle !== 'undefined');
    if (!cryptoOK) warn.style.display = 'block';

    // already authed?
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      showApp();
      return;
    }

    async function tryLogin(ev){
      if (ev) ev.preventDefault();
      err.style.display = 'none';

      if (!cryptoOK){
        err.textContent = 'Secure crypto unavailable (need HTTPS).';
        err.style.display = 'block';
        return;
      }
      const entered = normalizeInput(pw.value);
      if (!entered){
        err.textContent = 'Please enter a password.';
        err.style.display = 'block';
        pw.focus(); return;
      }
      const hash = await sha256Hex(entered);
      if (DEBUG_LOG_HASH) console.log('[balance] computed hash:', hash);
      if (hash === PASSWORD_SHA256_HEX){
        sessionStorage.setItem(SESSION_KEY, '1');
        showApp();
      } else {
        err.textContent = 'Incorrect password.';
        err.style.display = 'block';
        pw.select();
      }
    }

    enter.addEventListener('click', tryLogin);
    pw.addEventListener('keydown', e => { if (e.key === 'Enter' || e.keyCode === 13) tryLogin(e); });
  }

  // ---------- Balance app ----------
  const PT_TZ = "America/Los_Angeles";
  const LOCK_DAYS = 8;
  const DAYS = 8; // fixed horizon
  const fmtUSD  = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
  const fmtDate = new Intl.DateTimeFormat('en-US', { timeZone: PT_TZ, month:'short', day:'2-digit', year:'2-digit' });

  // Replace SAMPLE_EVENTS with data from your sheet later
  const SAMPLE_EVENTS = [
    // CSFloat
    { site:'csfloat', type:'credit', amount: 5000, date:'2025-08-11T20:10:00Z' },
    { site:'csfloat', type:'credit', amount: 2000, date:'2025-08-16T04:15:00Z' },
    { site:'csfloat', type:'debit',  amount:  800, date:'2025-08-18T02:00:00Z' },

    // YouPin898
    { site:'youpin',  type:'credit', amount: 7000, date:'2025-08-12T15:00:00Z' },
    { site:'youpin',  type:'credit', amount: 8000, date:'2025-08-17T09:30:00Z' },
    { site:'youpin',  type:'debit',  amount: 1000, date:'2025-08-18T22:45:00Z' },
  ];

  function ptYMD(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: PT_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
    const [y,m,dd] = parts.split('-').map(n => parseInt(n,10));
    return { y, m, d: dd };
  }
  function dayKeyUTC(ymd) { return Date.UTC(ymd.y, ymd.m-1, ymd.d); }
  function keyFromDatePT(dateLike) { return dayKeyUTC(ptYMD(dateLike)); }
  function todayKeyPT() { return keyFromDatePT(new Date()); }
  function addDaysKey(keyUTC, n) { return keyUTC + n*86400000; }
  function availableDayKey(eventDate) {
    const base = keyFromDatePT(eventDate);
    return addDaysKey(base, LOCK_DAYS);
  }
  function labelFromKey(keyUTC) { return fmtDate.format(new Date(keyUTC)); }
  function sum(arr){ return arr.reduce((a,b)=>a+b,0); }

  function compute(site, events) {
    const keyToday = todayKeyPT();
    const siteEvents = events.filter(e => e.site === site);

    const debits  = siteEvents.filter(e => e.type === 'debit').map(e => e.amount);
    const credits = siteEvents.filter(e => e.type === 'credit');

    const pendingCredits = [];
    const unlockedCreditAmounts = [];

    for (const c of credits) {
      const unlockKey = availableDayKey(c.date);
      if (unlockKey <= keyToday) unlockedCreditAmounts.push(c.amount);
      else pendingCredits.push({ amount:c.amount, unlockKey });
    }

    const totalDebits = sum(debits);
    const unlocked = sum(unlockedCreditAmounts) - totalDebits;
    const pending  = sum(pendingCredits.map(p => p.amount));
    const total    = unlocked + pending;

    const byDay = new Map(); // unlockKey -> amount
    for (const p of pendingCredits) {
      byDay.set(p.unlockKey, (byDay.get(p.unlockKey) || 0) + p.amount);
    }

    const rows = [];
    let cumulative = 0;
    for (let i=0; i<DAYS; i++) {
      const dayKey = addDaysKey(keyToday, i);
      const unlocking = byDay.get(dayKey) || 0;
      cumulative += unlocking;
      rows.push({ key: dayKey, unlocking, cumulative });
    }

    return { total, unlocked, pending, rows };
  }

  function renderSite(site, events){
    const ids = site === 'csfloat'
      ? { total:'#cs-total', unlocked:'#cs-unlocked', pending:'#cs-pending', up:'#cs-unlockedPct', pp:'#cs-pendingPct', sched:'#cs-schedule', asof:'#cs-asof' }
      : { total:'#yp-total', unlocked:'#yp-unlocked', pending:'#yp-pending', up:'#yp-unlockedPct', pp:'#yp-pendingPct', sched:'#yp-schedule', asof:'#yp-asof' };

    const { total, unlocked, pending, rows } = compute(site, events);
    document.querySelector(ids.total).textContent    = fmtUSD.format(total);
    document.querySelector(ids.unlocked).textContent = fmtUSD.format(unlocked);
    document.querySelector(ids.pending).textContent  = fmtUSD.format(pending);

    const upct = total > 0 ? (unlocked/total*100).toFixed(1)+'% of total' : '—';
    const ppct = total > 0 ? (pending/total*100).toFixed(1)+'% of total'  : '—';
    document.querySelector(ids.up).textContent = upct;
    document.querySelector(ids.pp).textContent = ppct;

    const tbody = document.querySelector(ids.sched);
    tbody.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      const tdD = document.createElement('td');
      const tdU = document.createElement('td');
      const tdC = document.createElement('td');
      tdD.textContent = labelFromKey(r.key);
      tdU.textContent = fmtUSD.format(r.unlocking);
      tdC.textContent = fmtUSD.format(r.cumulative);
      tdU.className = 'num'; tdC.className = 'num';
      tr.append(tdD, tdU, tdC);
      tbody.appendChild(tr);
    }

    const nowLabel = labelFromKey(todayKeyPT());
    document.querySelector(ids.asof).textContent = `as of ${nowLabel} PT`;
  }

  // State & init
  const state = { events: SAMPLE_EVENTS };

  function renderAll(){
    renderSite('csfloat', state.events);
    renderSite('youpin', state.events);
  }

  // Expose a setter so you can plug real data later:
  window.COAHBalance = {
    setEvents(arr){ state.events = Array.isArray(arr) ? arr : []; renderAll(); },
    LOCK_DAYS
  };

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    initGate();          // wire the password gate
    // If already authed this session, app is visible now; render:
    if (sessionStorage.getItem(SESSION_KEY) === '1') renderAll();

    // If you want to auto-load events from your Apps Script, uncomment below:
    // fetch('https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec')
    //   .then(r => r.json())
    //   .then(data => { COAHBalance.setEvents(data); })
    //   .catch(err => console.error('Failed to load events:', err));
  });
})();
