/* coah/app.js v2025-08-17T08:14Z – strict filtering + Guns/Kato14 + uniform images */

// ================== DATA SOURCE ==================
const API_URL = '/.netlify/functions/fetch-items';

// Time helpers (PST midnight + 8 days)
function toPSTMidnight(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
}
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }

// ================== HELPERS ==================
function parseCondition(v) {
  const f = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(f)) return '-';
  if (f < 0.07) return 'Factory New';
  if (f < 0.15) return 'Minimal Wear';
  if (f < 0.38) return 'Field-Tested';
  if (f < 0.45) return 'Well-Worn';
  return 'Battle-Scarred';
}
function formatLockCountdown(purchaseDate) {
  if (!purchaseDate) return null;
  const base = toPSTMidnight(purchaseDate);
  if (!base) return null;
  const unlockAt = addDays(base, 8);
  const now = new Date();
  const diff = unlockAt - now;
  if (diff <= 0) return null;
  const MS_H = 1000 * 60 * 60, MS_D = MS_H * 24;
  const days = Math.floor(diff / MS_D);
  const hours = Math.floor((diff % MS_D) / MS_H);
  return `Trade locked for ${days} days ${hours} hours`;
}

// Category + Kato14
function getCategory(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('knife')) return 'Knives';
  if (n.includes('glove')) return 'Gloves';
  const guns = [
    'ak-47','ak47','m4a1','m4a4','awp','usp','usp-s','p2000','p250','famas','galil','aug','ssg',
    'scar','scar-20','mac-10','mac10','mp7','mp9','ump','p90','pp-bizon','bizon','nova','xm1014',
    'mag-7','mag7','sawed-off','sawed off','negev','m249','desert eagle','deagle','dual berettas',
    'dualies','five-seven','fiveseven','cz75','tec-9','tec9','glock'
  ];
  if (guns.some(g => n.includes(g))) return 'Guns';
  return 'Other';
}
function isKato14(special) {
  const s = (special || '').toLowerCase();
  return s.includes('kato') || s.includes('k14') || s.includes('kato14');
}

// ================== RENDER ==================
function showModalImage(src) {
  // Clean up any existing modal
  const existing = document.querySelector('.modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.addEventListener('click', () => modal.remove());

  const img = document.createElement('img');
  img.className = 'modal-img';
  img.alt = 'Full image';
  img.src = src || 'assets/chicken.png';
  img.addEventListener('click', (e) => e.stopPropagation()); // don't close when clicking the image

  modal.appendChild(img);
  document.body.appendChild(modal);

  // Esc to close
  const onKey = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

function createCard(it) {
  const name = it.name || it.Name || '-';
  const special = it.special || it['Special'] || it['Special Characteristics'] || '';
  const floatVal = it.float ?? it.Float;

  const card = document.createElement('div');
  card.className = 'card';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'image-container';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = name;
  img.src = it.image || it.Image || 'assets/chicken.png';

  const mag = document.createElement('button');
  mag.className = 'magnify-btn';
  mag.type = 'button';
  mag.textContent = '🔍';
  mag.addEventListener('click', (e) => { e.stopPropagation(); showModalImage(img.src); });

  imgWrap.appendChild(img);
  imgWrap.appendChild(mag);

  const title = document.createElement('h3');
  title.textContent = name;

  const cond = document.createElement('p');
  cond.textContent = `Condition: ${parseCondition(floatVal)}`;

  const specialEl = document.createElement('p');
  if (special) specialEl.textContent = `Special: ${special}`;

  const status = document.createElement('p');
  status.className = 'status';
  const purchase = it.purchaseDate || it.Date;
  const countdown = formatLockCountdown(purchase);
  if (countdown) {
    status.textContent = countdown;
    status.classList.add('locked');
  } else {
    status.textContent = 'Unlocked';
    status.classList.add('unlocked');
  }

  card.appendChild(imgWrap);
  card.appendChild(title);
  card.appendChild(cond);
  if (special) card.appendChild(specialEl);
  card.appendChild(status);
  return card;
}

function renderCards(data, filters) {
  const grid = document.getElementById('cards-container');
  grid.innerHTML = '';

  let list = data.slice();

  // STRICT FILTER: Column F must be TRUE; Column G must be BLANK
  list = list.filter(it => {
    const includeRaw = it.include ?? it.Include ?? it.show ?? it.Show ?? it.F;
    const soldRaw    = it.sold ?? it.Sold ?? it.Status ?? it.G; // Column G in your sheet often came through as "Status"
    const name       = it.name || it.Name;

    const include = (includeRaw === true) || (typeof includeRaw === 'string' && includeRaw.trim().toLowerCase() === 'true');
    const gBlank  = (soldRaw === '' || soldRaw === null || typeof soldRaw === 'undefined');

    return include && gBlank && !!name;
  });

  // SEARCH
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(it =>
      (it.name || it.Name || '').toLowerCase().includes(q) ||
      (it.special || it['Special'] || it['Special Characteristics'] || '').toLowerCase().includes(q)
    );
  }

  // CATEGORY (+ Kato14, non-exclusive tagging)
  if (filters.category && filters.category !== 'All') {
    list = list.filter(it => {
      const cat = getCategory(it.name || it.Name || '');
      const kato = isKato14(it.special || it['Special'] || it['Special Characteristics'] || '');
      if (filters.category === 'Kato14') return kato;
      return cat === filters.category;
    });
  }

  // ONLY UNLOCKED
  if (filters.onlyUnlocked) {
    list = list.filter(it => !formatLockCountdown(it.purchaseDate || it.Date));
  }

  // SORT
  if (filters.sort === 'Newest' || filters.sort === 'Oldest') {
    list.sort((a, b) => {
      const da = new Date(a.purchaseDate || a.Date || 0).getTime();
      const db = new Date(b.purchaseDate || b.Date || 0).getTime();
      return da - db;
    });
    if (filters.sort === 'Newest') list.reverse();
  }

  // RENDER
  for (const it of list) grid.appendChild(createCard(it));

  // COUNT
  const count = document.getElementById('item-count');
  count.textContent = `Showing ${list.length} items`;
}

// ================== MAIN ==================
async function fetchItems() {
  const res = await fetch(API_URL, { cache: 'no-store' });
  if (!res.ok) {
    console.error('[coah] fetch-items failed', res.status, await res.text());
    throw new Error('Could not load items');
  }
  const body = await res.json();
  // Accept common shapes
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.items)) return body.items;
  if (body && Array.isArray(body.data)) return body.data;
  // Some debug endpoints send {normalized:[...]} or {rows:[...]}
  if (body && Array.isArray(body.normalized)) return body.normalized;
  if (body && Array.isArray(body.rows)) return body.rows;
  console.warn('[coah] Unexpected payload shape; returning []');
  return [];
}

(async function init() {
  try {
    const data = await fetchItems();

    const filters = { category: 'All', sort: 'Newest', onlyUnlocked: false, search: '' };

    // Wire controls
    const $ = id => document.getElementById(id);
    const categorySelect = $('category-filter');
    const sortSelect = $('sort-filter');
    const unlockedCheckbox = $('unlocked-filter');
    const searchInput = $('search-bar');

    categorySelect?.addEventListener('change', () => { filters.category = categorySelect.value; renderCards(data, filters); });
    sortSelect?.addEventListener('change', () => { filters.sort = sortSelect.value; renderCards(data, filters); });
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
