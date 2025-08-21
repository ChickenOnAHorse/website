/* Balance dashboard logic (CSP-safe external file)
   - Sites: "csfloat" and "youpin"
   - Events schema (example):
     {
       site: "csfloat" | "youpin",
       type: "credit" | "debit",        // credit = money coming in (locked 8 days), debit = spent (immediate)
       amount: 5000.00,                 // positive number
       date: "2025-08-10T17:31:00Z"     // ISO-ish; we'll interpret in PT for lock rule
     }
   - Config:
     LOCK_DAYS = 8   // funds from credit unlock at PT midnight after N days
*/

(() => {
  const LOCK_DAYS = 8;
  const PT_TZ = "America/Los_Angeles";
  const fmtUSD = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
  const fmtDate = new Intl.DateTimeFormat('en-US', { timeZone: PT_TZ, month:'short', day:'2-digit', year:'2-digit' });

  // ---------- SAMPLE DATA (replace with your fetched events) ----------
  // Imagine these come from your Google Sheet via a published Apps Script JSON endpoint.
  const SAMPLE_EVENTS = [
    // CSFloat credits (will unlock after 8 days)
    { site:'csfloat', type:'credit', amount: 3500, date:'2025-08-12T18:10:00Z' },
    { site:'csfloat', type:'credit', amount: 1200, date:'2025-08-15T03:45:00Z' },
    // CSFloat purchases (debits) apply immediately
    { site:'csfloat', type:'debit',  amount:  800, date:'2025-08-16T20:00:00Z' },

    // YouPin credits + debits
    { site:'youpin',  type:'credit', amount: 9000, date:'2025-08-13T22:20:00Z' },
    { site:'youpin',  type:'credit', amount: 2500, date:'2025-08-18T12:00:00Z' },
    { site:'youpin',  type:'debit',  amount:  200, date:'2025-08-17T09:10:00Z' },
  ];
  // -------------------------------------------------------------------

  function toDate(d) {
    // robust parse; accept Date or string
    return d instanceof Date ? d : new Date(d);
  }

  function startOfDayPT(date) {
    // get PT calendar day start for a given instant
    const d = toDate(date);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: PT_TZ, year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(d);
    const y = parts.find(p=>p.type==='year').value;
    const m = parts.find(p=>p.type==='month').value;
    const da = parts.find(p=>p.type==='day').value;
    // construct local PT midnight by string then parse as PT by appending TZ offset via Date constructor trick
    // safer approach: create Date in UTC from PT components
    const ptMidnight = new Date(`${y}-${m}-${da}T00:00:00-08:00`); // -08 or -07 depending DST; this is approximate
    // Better: use the current actual offset for that date
    const offsetMinutes = - new Date(fmtInTZ(`${y}-${m}-${da}T00:00:00Z`, PT_TZ)).getTimezoneOffset();
    const utcDate = Date.UTC(+y, +m-1, +da, 0, 0, 0);
    return new Date(utcDate - offsetMinutes * 60 * 1000);
  }

  // Helper to format in a TZ (hack: via toLocaleString then new Date)
  function fmtInTZ(iso, tz) {
    return new Date(new Date(iso).toLocaleString('en-US', { timeZone: tz }));
  }

  function availableDatePT(eventDate) {
    // Credits unlock at PT midnight AFTER N days from the event date (i.e., add N days to PT midnight of event)
    const startPT = fmtInTZ(eventDate, PT_TZ);
    const startMid = new Date(startPT.getFullYear(), startPT.getMonth(), startPT.getDate()); // local PT midnight
    const unlock = new Date(startMid);
    unlock.setDate(unlock.getDate() + LOCK_DAYS);
    return unlock; // local PT midnight of unlock day
  }

  function todayPT() {
    const now = new Date();
    const t = fmtInTZ(now.toISOString(), PT_TZ);
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function groupBy(arr, keyFn) {
    const m = new Map();
    for (const it of arr) {
      const k = keyFn(it);
      m.set(k, (m.get(k) || 0) + it.amount);
    }
    return m;
  }

  function sum(arr) { return arr.reduce((a,b)=>a+b,0); }

  function computeForSite(siteKey, events) {
    const nowDay = todayPT();

    const siteEvents = events.filter(e => e.site === siteKey);

    // Split by type
    const credits = siteEvents.filter(e => e.type === 'credit');
    const debits  = siteEvents.filter(e => e.type === 'debit');

    // Debits apply immediately (reduce unlocked)
    const totalDebits = sum(debits.map(d => d.amount));

    // Credits split into unlocked vs pending by availableDate
    const unlockedCredits = [];
    const pendingCredits = [];
    for (const c of credits) {
      const avail = availableDatePT(c.date);
      if (avail <= nowDay) {
        unlockedCredits.push(c.amount);
      } else {
        pendingCredits.push({ amount:c.amount, when: avail });
      }
    }

    const unlocked = sum(unlockedCredits) - totalDebits;
    const pending  = sum(pendingCredits.map(p => p.amount));
    const total    = unlocked + pending;

    return { total, unlocked, pending, pendingCredits };
  }

  function buildSchedule(pendingCredits, horizonDays) {
    // Group pending by unlock calendar day (PT)
    const byDay = groupBy(pendingCredits, p => {
      const y = p.when.getFullYear();
      const m = p.when.getMonth();
      const d = p.when.getDate();
      return new Date(y, m, d).getTime();
    });

    // Create rows for the next N days (including today)
    const rows = [];
    const start = todayPT();
    let cumulative = 0;
    for (let i=0; i<horizonDays; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const unlocking = byDay.get(key) || 0;
      cumulative += unlocking;
      rows.push({
        day,
        unlocking,
        cumulative
      });
    }
    return rows;
  }

  // ---------- UI wiring ----------
  const state = {
    site: 'csfloat',
    horizon: 14,
    events: SAMPLE_EVENTS
  };

  const $ = sel => document.querySelector(sel);
  const siteTabs = $('#siteTabs');
  const horizonSel = $('#horizon');
  const asOf = $('#asOf');
  const cardTitle = $('#cardTitle');
  const totalBalance = $('#totalBalance');
  const unlockedEl = $('#unlocked');
  const pendingEl = $('#pending');
  const unlockedPct = $('#unlockedPct');
  const pendingPct = $('#pendingPct');
  const totalBar = $('#totalBar');
  const scheduleTitle = $('#scheduleTitle');
  const scheduleBody = $('#scheduleBody');

  function render() {
    const { total, unlocked, pending, pendingCredits } = computeForSite(state.site, state.events);
    const pctUnlocked = total > 0 ? (unlocked/total)*100 : 0;
    const pctPending  = total > 0 ? (pending/total)*100 : 0;

    cardTitle.textContent = (state.site === 'csfloat' ? 'CSFloat' : 'YouPin898') + ' — Totals';
    totalBalance.textContent = fmtUSD.format(total);
    unlockedEl.textContent = fmtUSD.format(unlocked);
    pendingEl.textContent = fmtUSD.format(pending);
    unlockedPct.textContent = total > 0 ? `${pctUnlocked.toFixed(1)}% of total` : '—';
    pendingPct.textContent  = total > 0 ? `${pctPending.toFixed(1)}% of total`  : '—';
    totalBar.style.width = `${Math.min(100, Math.max(0, (total>0? (unlocked/total)*100 : 0)))}%`;

    // Schedule
    scheduleTitle.textContent = `Next ${state.horizon} days`;
    const rows = buildSchedule(pendingCredits, state.horizon);
    scheduleBody.innerHTML = '';
    let running = 0;
    for (const r of rows) {
      running += r.unlocking;
      const tr = document.createElement('tr');
      const tdDate = document.createElement('td');
      const tdUnlock = document.createElement('td');
      const tdCum = document.createElement('td');
      tdDate.textContent = fmtDate.format(r.day);
      tdUnlock.textContent = fmtUSD.format(r.unlocking);
      tdCum.textContent = fmtUSD.format(running);
      tdUnlock.className = 'num';
      tdCum.className = 'num';
      tr.append(tdDate, tdUnlock, tdCum);
      scheduleBody.appendChild(tr);
    }

    // Stamp as-of (PT)
    const nowPT = fmtInTZ(new Date().toISOString(), PT_TZ);
    asOf.textContent = `as of ${fmtDate.format(nowPT)} PT`;
  }

  // site tab clicks
  siteTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    siteTabs.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.site = btn.dataset.site;
    render();
  });

  // horizon change
  horizonSel.addEventListener('change', () => {
    state.horizon = parseInt(horizonSel.value, 10);
    render();
  });

  // If you later fetch real data, call setEvents(realEvents)
  function setEvents(arr) {
    state.events = Array.isArray(arr) ? arr : [];
    render();
  }

  // Expose for testing in console
  window.COAHBalance = { setEvents, computeForSite, buildSchedule, LOCK_DAYS };

  // Initial render (with sample)
  render();

  // ------------- OPTIONAL: fetch from your Apps Script JSON -------------
  // Example: publish your sheet to a Web App that returns an array of events matching the schema.
  // Then uncomment and set URL below.
  //
  // fetch('https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec')
  //   .then(r => r.json())
  //   .then(data => { setEvents(data); })
  //   .catch(err => console.error('Failed to load events:', err));

})();
