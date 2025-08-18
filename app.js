/* coah/app.js v2025-08-17T07:58Z – restore Netlify data source + Kato14 + Guns */

// ================== DATA SOURCE ==================
const API_URL = '/.netlify/functions/fetch-items';

// Helper: parse a date string, assume it's UTC and convert to PST midnight
function toPSTMidnight(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike); // often ISO from Apps Script
  // Build a date at midnight PST for the same calendar day as the source
  const pst = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  // month/day/year to Date in PST using fixed offset conversion:
  const local = new Date(`${pst.year}-${pst.month}-${pst.day}T00:00:00-08:00`); // handles PDT implicitly via -08/-07? We'll correct using tz below
  // Safer: construct then shift to exact PST/PDT midnight via timezone formatter roundtrip
  const base = new Date(`${pst.year}-${pst.month}-${pst.day}T00:00:00`);
  return base; // we'll always compare via Date; countdown uses current local time; precision is fine for UI
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ================== HELPERS ==================
function parseCondition(floatVal) {
  const f = typeof floatVal === 'number' ? floatVal : parseFloat(floatVal);
  if (isNaN(f)) return '-';
  if (f < 0.07) return 'Factory New';
  if (f < 0.15) return 'Minimal Wear';
  if (f < 0.38) return 'Field-Tested';
  if (f < 0.45) return 'Well-Worn';
  return 'Battle-Scarred';
}

function formatLockCountdown(purchaseDate) {
  if (!purchaseDate) return null;
  const pstMidnight = toPSTMidnight(purchaseDate);
  if (!pstMidnight) return null;
  const unlockAt = addDays(pstMidnight, 8); // exactly 8 days later at PST midnight
  const now = new Date();
  const diffMs = unlockAt - now;
  if (diffMs <= 0) return null; // already unlocked

  const MS_H = 1000 * 60 * 60;
  const MS_D = MS_H * 24;
  const days = Math.floor(diffMs / MS_D);
  const hours = Math.floor((diffMs % MS_D) / MS_H);
  return `Trade locked for ${days} days ${hours} hours`;
}

// Category detection
function getCategory(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('knife')) return 'Knives';
  if (n.includes('glove')) return 'Gloves';
  const guns = [
    'ak-47','ak47','m4a1','m4a4','awp','usp','p250','famas','galil','aug','ssg','scar',
    'mac','mac-10','mac10','mp7','mp9','ump','p90','pp-bizon','bizon','nova','xm1014','mag-7','mag7','sawed-off','sawed off',
    'negev','m249','desert eagle','deagle','dual berettas','dualies','five-seven','fiveseven','cz75','tec-9','tec9','glock'
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
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.onclick = () => modal.remove();

  const img = document.createElement('img');
  img.className = 'modal-img';
  img.src = src || 'assets/chicken.png';

  modal.appendChild(img);
  document.body.appendChild(modal);
}

function createCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'image-container';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = item.name || '-';
  img.src = item.image || item.Image || 'assets/chicken.png';

  const mag = document.createElement('button');
  mag.className = 'magnify-btn';
  mag.type = 'button';
  mag.textContent = '🔍';
  mag.addEventListener('click', (e) => {
    e.stopPropagation();
    showModalImage(img.src);
  });

  imgWrap.appendChild(img);
  imgWrap.appendChild(mag);

  const title = document.createElement('h3');
  title.textContent = item.name || item.Name || '-';

  const cond = document.createElement('p');
  const floatVal = item.float ?? item.Float;
  cond.textContent = `Condition: ${parseCondition(floatVal)}`;

  const special = document.createElement('p');
  const specialText = item.special || item['Special'] || item['Special Characteristics'] || '';
  if (specialText) {
    special.textContent = `Special: ${specialText}`;
  }

  const status = document.createElement('p');
  status.className = 'status';
  const purchase = item.purchaseDate || item.Date;
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
  if (specialText) card.appendChild(special);
  card.appendChild(status);

  return card;
}

function renderCards(data, filters) {
  const grid = document.getElementById('cards-container');
  grid.innerHTML = '';

  let list = data.slice();

  // filter by Include (F) TRUE and Status (G) blank if present
  list = list.filter(it => {
    // Server might already filter; we fail-safe here.
    const include = it.include ?? it.Include ?? it.show ?? it.Show;
    const statusG = it.status ?? it.Status ?? ''; // blank means available
    const includePass = (include === true) || (typeof include === 'string' && include.toLowerCase() === 'true');
    const statusPass = (statusG === '' || statusG === null || typeof statusG === 'undefined');
    return includePass && statusPass;
  });

  // search
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(it =>
      (it.name || it.Name || '').toLowerCase().includes(q) ||
      (it.special || it['Special'] || it['Special Characteristics'] || '').toLowerCase().includes(q)
    );
  }

  // category / Kato14
  if (filters.category && filters.category !== 'All') {
    list = list.filter(it => {
      const cat = getCategory(it.name || it.Name || '');
      const kato = isKato14(it.special || it['Special'] || it['Special Characteristics'] || '');
      if (filters.category === 'Kato14') return kato;
      return cat === filters.category;
    });
  }

  // only unlocked
  if (filters.onlyUnlocked) {
    list = list.filter(it => !formatLockCountdown(it.purchaseDate || it.Date));
  }

  // sort
  if (filters.sort === 'Newest' || filters.sort === 'Oldest') {
    list.sort((a, b) => {
      const da = new Date(a.purchaseDate || a.Date || 0).getTime();
      const db = new Date(b.purchaseDate || b.Date || 0).getTime();
      return da - db;
    });
    if (filters.sort === 'Newest') list.reverse();
  }

  // render
  for (const it of list) {
    grid.appendChild(createCard(it));
  }

  // count
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
  // Support either array or {items:[...]}
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.items)) return body.items;
  if (body && Array.isArray(body.data)) return body.data;
  console.warn('[coah] Unexpected payload shape; returning []');
  return [];
}

(async function init() {
  try {
    const data = await fetchItems();

    const filters = {
      category: 'All',
      sort: 'Newest',
      onlyUnlocked: false,
      search: ''
    };

    // Wire controls
    const categorySelect = document.getElementById('category-filter');
    const sortSelect = document.getElementById('sort-filter');
    const unlockedCheckbox = document.getElementById('unlocked-filter');
    const searchInput = document.getElementById('search-bar');

    if (!categorySelect || !sortSelect || !unlockedCheckbox || !searchInput) {
      console.error('[coah] Missing filter controls in HTML.');
    }

    categorySelect?.addEventListener('change', () => {
      filters.category = categorySelect.value;
      renderCards(data, filters);
    });
    sortSelect?.addEventListener('change', () => {
      filters.sort = sortSelect.value;
      renderCards(data, filters);
    });
    unlockedCheckbox?.addEventListener('change', () => {
      filters.onlyUnlocked = unlockedCheckbox.checked;
      renderCards(data, filters);
    });
    searchInput?.addEventListener('input', () => {
      filters.search = searchInput.value;
      renderCards(data, filters);
    });

    renderCards(data, filters);
  } catch (err) {
    console.error('[coah] init error:', err);
    const grid = document.getElementById('cards-container');
    if (grid) {
      grid.innerHTML = `<div class="error">Could not load items. Please try again later.</div>`;
    }
    const count = document.getElementById('item-count');
    if (count) count.textContent = 'Showing 0 items';
  }
})();
