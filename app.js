/* coah/app.js v2025-08-17T09:07Z – Netlify data, Guns+Kato14, stable card layout */

// -------------------- Data source --------------------
const API_URL = '/.netlify/functions/fetch-items';

// -------------------- Time helpers (PST midnight +8d) --------------------
function toPSTMidnight(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  // Construct as UTC midnight for that PST date; good enough for UI countdown
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
}
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }

// -------------------- Parsing helpers --------------------
function parseFloatSafe(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}
function conditionOf(floatVal) {
  const f = parseFloatSafe(floatVal);
  if (!Number.isFinite(f)) return { label: '-', cls: 'cond-unknown' };

  if (f <= 0.0799) return { label: 'Factory New',  cls: 'cond-fn' };     // 0–0.0799
  if (f <= 0.1499) return { label: 'Minimal Wear', cls: 'cond-mw' };     // 0.08–0.1499
  if (f <= 0.37999) return { label: 'Field-Tested', cls: 'cond-ft' };    // 0.15–0.37999
  if (f <= 0.4499) return { label: 'Well-Worn',     cls: 'cond-ww' };    // 0.38–0.4499
  return                 { label: 'Battle-Scarred', cls: 'cond-bs' };     // 0.45–1
}
// Map a raw float (0–1) into % along the proportional wear bar
function floatToBarPct(fRaw) {
  const f = Math.min(1, Math.max(0, parseFloatSafe(fRaw)));

  // segment lengths in FLOAT domain
  const LEN_FN = 0.0799;          // 7.99%
  const LEN_MW = 0.1499 - 0.08;   // 0.0699 -> 6.99%
  const LEN_FT = 0.37999 - 0.15;  // 0.22999 -> 22.999%
  const LEN_WW = 0.4499 - 0.38;   // 0.0699 -> 6.99%
  const LEN_BS = 1 - 0.45;        // 0.55   -> 55%

  // corresponding BAR widths in %
  const PCT_FN = 7.99;
  const PCT_MW = 6.99;
  const PCT_FT = 22.999;
  const PCT_WW = 6.99;
  const PCT_BS = 55.0;

  const CUT_FN = 0.0799;
  const CUT_MW = 0.1499;
  const CUT_FT = 0.37999;
  const CUT_WW = 0.4499;

  if (f <= CUT_FN)  return (f / LEN_FN) * PCT_FN;

  if (f <= CUT_MW)  {
    const frac = (f - 0.08) / LEN_MW;
    return PCT_FN + frac * PCT_MW;
  }

  if (f <= CUT_FT)  {
    const frac = (f - 0.15) / LEN_FT;
    return PCT_FN + PCT_MW + frac * PCT_FT;
  }

  if (f <= CUT_WW)  {
    const frac = (f - 0.38) / LEN_WW;
    return PCT_FN + PCT_MW + PCT_FT + frac * PCT_WW;
  }

  // BS
  const frac = (f - 0.45) / LEN_BS;
  return PCT_FN + PCT_MW + PCT_FT + PCT_WW + frac * PCT_BS;
}

}
function countdownFromPurchase(purchaseDate) {
  if (!purchaseDate) return null;
  const base = toPSTMidnight(purchaseDate);
  if (!base) return null;
  const unlockAt = addDays(base, 8); // exactly 8 days later at PST midnight
  const now = new Date();
  const diff = unlockAt - now;
  if (diff <= 0) return null;
  const MS_H = 1000 * 60 * 60, MS_D = MS_H * 24;
  const days = Math.floor(diff / MS_D);
  const hours = Math.floor((diff % MS_D) / MS_H);
  return { days, hours };
}

// -------------------- Category + Kato14 --------------------
function getCategory(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('knife')) return 'Knives';
  if (n.includes('glove')) return 'Gloves';
  const guns = [
    'ak-47','ak47','m4a1','m4a4','awp','usp','usp-s','p2000','p250','famas','galil','aug','ssg',
    'scar','scar-20','mac-10','mac10','mp7','mp9','ump','p90','pp-bizon','bizon','nova','xm1014',
    'mag-7','mag7','sawed-off','sawed off','negev','m249','desert eagle','deagle','dual berettas',
    'dualies','five-seven','fiveseven','cz75','tec-9','tec9','glock','sg 553','sg553'
  ];
  if (guns.some(g => n.includes(g))) return 'Guns';
  return 'Other';
}
function isKato14(special) {
  const s = (special || '').toLowerCase();
  return s.includes('kato14') || s.includes('kato') || s.includes('k14');
}

// -------------------- Modal --------------------
function showModalImage(src) {
  const existing = document.querySelector('.modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.addEventListener('click', () => modal.remove());

  const img = document.createElement('img');
  img.className = 'modal-img';
  img.alt = 'Full image';
  img.src = src || 'assets/chicken.png';
  img.addEventListener('click', (e) => e.stopPropagation());

  modal.appendChild(img);
  document.body.appendChild(modal);

  const onKey = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

// -------------------- Card --------------------
function createCard(raw) {
  const name = raw.name || raw.Name || '-';
  const special = raw.special || raw['Special'] || raw['Special Characteristics'] || '';
  const floatVal = raw.float ?? raw.Float;
  const imgSrc = raw.image || raw.Image || 'assets/chicken.png';
  const purchase = raw.purchaseDate || raw.Date;

  const countdown = countdownFromPurchase(purchase);
  const locked = !!countdown;
  const cond = conditionOf(floatVal);

  const card = document.createElement('div');
  card.className = 'card';

  // Title
  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = name;
  card.appendChild(title);

  // Row: badge + condition
  const row = document.createElement('div');
  row.className = 'card-row';

  const badge = document.createElement('span');
  badge.className = `badge ${locked ? 'locked' : 'unlocked'}`;
  badge.textContent = locked ? 'Locked' : 'Unlocked';
  row.appendChild(badge);

  const condEl = document.createElement('span');
  condEl.className = `condition ${cond.cls}`;
  condEl.textContent = cond.label;
  row.appendChild(condEl);

  card.appendChild(row);

  // Image + magnify
  const imgWrap = document.createElement('div');
  imgWrap.className = 'image-container';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = name;
  img.src = imgSrc;

  const mag = document.createElement('button');
  mag.className = 'magnify-btn';
  mag.type = 'button';
  mag.textContent = '🔍';
  mag.addEventListener('click', (e) => { e.stopPropagation(); showModalImage(img.src); });

  imgWrap.appendChild(img);
  imgWrap.appendChild(mag);
  card.appendChild(imgWrap);

  // Wear bar + float value
  const wearWrap = document.createElement('div');
  wearWrap.className = 'wear-wrapper';

  const wearBar = document.createElement('div');
  wearBar.className = 'wear-bar';

  const pointer = document.createElement('div');
  pointer.className = 'wear-pointer';
  const f = parseFloatSafe(floatVal);
const leftPct = Number.isFinite(f) ? floatToBarPct(f) : 0;
pointer.style.left = `${leftPct}%`;
  wearBar.appendChild(pointer);

  wearWrap.appendChild(wearBar);

  const wearVal = document.createElement('div');
  wearVal.className = 'wear-value';
  wearVal.textContent = Number.isFinite(f) ? f.toFixed(10) : '-';
  wearWrap.appendChild(wearVal);

  card.appendChild(wearWrap);

  // Special
  if (special) {
    const specEl = document.createElement('div');
    specEl.className = 'special';
    specEl.textContent = `Special: ${special}`;
    card.appendChild(specEl);
  }

  // Trade status (line at bottom)
  const trade = document.createElement('div');
  trade.className = 'trade';
  if (locked) {
    trade.textContent = `Trade locked for ${countdown.days} days ${countdown.hours} hours`;
  } else {
    trade.textContent = 'Unlocked';
  }
  card.appendChild(trade);

  return card;
}

// -------------------- Rendering with filters --------------------
function renderCards(data, filters) {
  const grid = document.getElementById('cards-container');
  grid.innerHTML = '';

  let list = data.slice();

  // STRICT filter: F must be TRUE, G must be blank
  list = list.filter(it => {
    const includeRaw = it.include ?? it.Include ?? it.show ?? it.Show ?? it.F;
    const gRaw = it.sold ?? it.Sold ?? it.Status ?? it.G;
    const include = (includeRaw === true) || (typeof includeRaw === 'string' && includeRaw.trim().toLowerCase() === 'true');
    const gBlank  = (gRaw === '' || gRaw === null || typeof gRaw === 'undefined');
    const hasName = !!(it.name || it.Name);
    return include && gBlank && hasName;
  });

  // Search
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(it =>
      (it.name || it.Name || '').toLowerCase().includes(q) ||
      (it.special || it['Special'] || it['Special Characteristics'] || '').toLowerCase().includes(q)
    );
  }

  // Category & Kato14
  if (filters.category && filters.category !== 'All') {
    list = list.filter(it => {
      const cat = getCategory(it.name || it.Name || '');
      const kato = isKato14(it.special || it['Special'] || it['Special Characteristics'] || '');
      if (filters.category === 'Kato14') return kato;
      return cat === filters.category;
    });
  }

  // Only unlocked
  if (filters.onlyUnlocked) {
    list = list.filter(it => !countdownFromPurchase(it.purchaseDate || it.Date));
  }

  // Sort
  if (filters.sort === 'Newest' || filters.sort === 'Oldest') {
    list.sort((a, b) => {
      const da = new Date(a.purchaseDate || a.Date || 0).getTime();
      const db = new Date(b.purchaseDate || b.Date || 0).getTime();
      return da - db;
    });
    if (filters.sort === 'Newest') list.reverse();
  }

  // Render
  for (const it of list) grid.appendChild(createCard(it));

  // Count
  const count = document.getElementById('item-count');
  count.textContent = `Showing ${list.length} items`;
}

// -------------------- Fetch --------------------
async function fetchItems() {
  const res = await fetch(API_URL, { cache: 'no-store' });
  if (!res.ok) {
    console.error('[coah] fetch-items failed', res.status, await res.text());
    throw new Error('Could not load items');
  }
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body?.items && Array.isArray(body.items)) return body.items;
  if (body?.data && Array.isArray(body.data)) return body.data;
  if (body?.normalized && Array.isArray(body.normalized)) return body.normalized;
  if (body?.rows && Array.isArray(body.rows)) return body.rows;
  console.warn('[coah] Unexpected payload shape; returning []');
  return [];
}

// -------------------- Init --------------------
(async function init() {
  try {
    const data = await fetchItems();

    const filters = { category: 'All', sort: 'Newest', onlyUnlocked: false, search: '' };

    const $ = id => document.getElementById(id);
    const categorySelect = $('category-filter');
    const sortSelect = $('sort-filter');
    const unlockedCheckbox = $('unlocked-filter');
    const searchInput = $('search-bar');

    categorySelect?.addEventListener('change', () => { filters.category = categorySelect.value; renderCards(data, filters); });
    sortSelect?.addEventListener('change',    () => { filters.sort = sortSelect.value;       renderCards(data, filters); });
    unlockedCheckbox?.addEventListener('change', () => { filters.onlyUnlocked = unlockedCheckbox.checked; renderCards(data, filters); });
    searchInput?.addEventListener('input', () => { filters.search = searchInput.value; renderCards(data, filters); });

    renderCards(data, filters);
  } catch (err) {
    console.error('[coah] init error:', err);
    const grid = document.getElementById('cards-container');
    if (grid) grid.innerHTML = `<div class="error">Could not load items. Please try again later.</div>`;
    const count = document.getElementById('item-count');
    if (count) count.textContent = 'Showing 0 items';
  }
})();
