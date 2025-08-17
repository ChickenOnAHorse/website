const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const searchInput = document.getElementById('search');
const countEl = document.getElementById('count');

// filter controls
const cbKnives = document.getElementById('cat-knives');
const cbGloves = document.getElementById('cat-gloves');
const cbWeapons = document.getElementById('cat-weapons');
const cbOther  = document.getElementById('cat-other');
const sortSel  = document.getElementById('sort');
const onlyUnlocked = document.getElementById('only-unlocked');

document.getElementById('year').textContent = new Date().getFullYear();

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY  = 24 * MS_HOUR;

const KNIFE_WORDS = [
  'knife','bayonet','karambit','butterfly','shadow daggers','bowie','falchion','huntsman',
  'navaja','stiletto','talon','ursus','classic knife','paracord','survival knife','skeleton',
  'nomad','daggers'
];
const GLOVE_WORDS = [
  'gloves','hand wraps','driver gloves','specialist gloves','sport gloves','hydra gloves',
  'bloodhound gloves','moto gloves','broken fang gloves'
];
const WEAPONS = [
  'ak-47','m4a4','m4a1-s','awp','ssg 08','aug','famas','galil ar','sg 553',
  'glock-18','usp-s','p2000','p250','five-seveN','tec-9','cz75-auto','dual berettas','desert eagle','r8 revolver','zeus x27',
  'mac-10','mp9','mp7','mp5-sd','ump-45','p90','pp-bizon',
  'nova','xm1014','mag-7','sawed-off',
  'scar-20','g3sg1',
  'm249','negev'
].map(s=>s.toLowerCase());

const fmtDate = (d) =>
  new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);

/** Midnight PST (fixed UTC-8), then +8 days at midnight PST */
function unlockAtMidnightPST(purchaseDate) {
  if (!purchaseDate) return null;
  const y = purchaseDate.getUTCFullYear();
  const m = purchaseDate.getUTCMonth();
  const d = purchaseDate.getUTCDate();
  const midnightPST_utcMs = Date.UTC(y, m, d, 8, 0, 0, 0);
  return new Date(midnightPST_utcMs + 8 * MS_DAY);
}

/** e.g. "6 days 3 hours" */
function formatDaysHours(ms) {
  if (ms <= 0) return '0 days 0 hours';
  const days = Math.floor(ms / MS_DAY);
  const hours = Math.floor((ms % MS_DAY) / MS_HOUR);
  return `${days} days ${hours} hours`;
}

function getCategory(name) {
  const n = name.toLowerCase();
  if (KNIFE_WORDS.some(w => n.includes(w))) return 'Knives';
  if (GLOVE_WORDS.some(w => n.includes(w))) return 'Gloves';
  if (WEAPONS.some(w => n.includes(w)))   return 'Weapons';
  return 'Other';
}

let ALL_ITEMS = [];

async function loadItems() {
  try {
    statusEl.textContent = 'Loading inventory…';
    const res = await fetch('/.netlify/functions/fetch-items', { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`fetch-items failed ${res.status}: ${text}`);
    }

    /** @type {Array<any>} */
    const rows = await res.json();
    const items = rows
      .map((r) => {
        const name = (r.name || '').toString().trim();
        const purchasedAt = r.purchaseDate ? new Date(r.purchaseDate) : null;
        const unlockAt = purchasedAt ? unlockAtMidnightPST(purchasedAt) : null;
        const category = name ? getCategory(name) : 'Other';
        return { ...r, name, purchasedAt, unlockAt, category };
      })
      .filter((r) => r.name);

    ALL_ITEMS = items;
    applyAndRender();
    statusEl.textContent = '';
    grid.setAttribute('aria-busy', 'false');
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Could not load items. Please try again later.';
    grid.setAttribute('aria-busy', 'false');
  }
}

function applyAndRender() {
  const now = Date.now();
  const q = (searchInput?.value || '').trim().toLowerCase();

  const cats = new Set();
  if (cbKnives.checked)  cats.add('Knives');
  if (cbGloves.checked)  cats.add('Gloves');
  if (cbWeapons.checked) cats.add('Weapons');
  if (cbOther.checked)   cats.add('Other');

  let list = ALL_ITEMS.filter(i => cats.has(i.category));
  if (q) list = list.filter(i => i.name.toLowerCase().includes(q));
  if (onlyUnlocked.checked) list = list.filter(i => i.unlockAt && i.unlockAt.getTime() <= now);

  list.sort((a, b) => {
    const at = a.purchasedAt ? a.purchasedAt.getTime() : 0;
    const bt = b.purchasedAt ? b.purchasedAt.getTime() : 0;
    return sortSel.value === 'oldest' ? at - bt : bt - at;
  });

  // NEW: update the live count
  if (countEl) countEl.textContent = `Showing ${list.length} item${list.length === 1 ? '' : 's'}`;

  render(list);
}

async function render(items) {
  const now = Date.now();
  const tpl = document.getElementById('card-tpl');
  grid.innerHTML = '';

  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No matching items.';
    grid.appendChild(p);
    return;
  }

  for (const row of items) {
    const card = /** @type {HTMLElement} */ (tpl.content.cloneNode(true));

    // Title
    card.querySelector('.item-name').textContent = row.name;

    // Image priority: Column H -> resolver -> chicken
    const img = card.querySelector('.thumb');
    img.alt = row.name;
    img.src = 'assets/chicken.png';
    img.onerror = () => { img.src = 'assets/chicken.png'; };

    if (row.image && typeof row.image === 'string' && row.image.trim()) {
      img.src = row.image.trim();
    } else {
      try {
        const params = new URLSearchParams({ name: row.name });
        if (row.float != null && row.float !== '') params.set('float', String(row.float));
        const imgRes = await fetch(`/.netlify/functions/resolve-image?${params.toString()}`);
        if (imgRes.ok) {
          const { url } = await imgRes.json();
          if (url) img.src = url;
        }
      } catch { /* keep chicken */ }
    }

    // NEW: hook up zoom button/pane
    const thumbWrap = card.querySelector('.thumb-wrap');
    const zoomBtn   = thumbWrap.querySelector('.zoom-btn');
    const zoomPane  = thumbWrap.querySelector('.zoom-pane');
    const zoomImg   = thumbWrap.querySelector('.zoom-img');

    zoomBtn.addEventListener('click', () => {
      // use the currently displayed image URL
      const fullSrc = img.currentSrc || img.src;
      zoomImg.src = fullSrc;
      zoomImg.alt = row.name;
      zoomPane.classList.add('open');
      zoomPane.setAttribute('aria-hidden', 'false');
    });
    // close on click outside image
    zoomPane.addEventListener('click', (e) => {
      if (e.target === zoomPane) {
        zoomPane.classList.remove('open');
        zoomPane.setAttribute('aria-hidden', 'true');
      }
    });
    // close on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && zoomPane.classList.contains('open')) {
        zoomPane.classList.remove('open');
        zoomPane.setAttribute('aria-hidden', 'true');
      }
    });

    // Status + Available on
    const availableWrap = card.querySelector('.available-wrap');
    const availEl = card.querySelector('.available-date');
    const statusLine = card.querySelector('.status-line');

    if (row.unlockAt && row.unlockAt.getTime() <= now) {
      statusLine.textContent = 'Unlocked';
      availableWrap?.remove();
      const badge = document.createElement('span');
      badge.className = 'badge badge-available';
      badge.textContent = 'Ready';
      card.querySelector('.card-head').appendChild(badge);
    } else {
      const msLeft = row.unlockAt ? (row.unlockAt.getTime() - now) : 0;
      statusLine.textContent = `Trade locked for ${formatDaysHours(msLeft)}`;
      availEl.textContent = row.unlockAt ? fmtDate(row.unlockAt) : 'TBD';
      const badge = document.createElement('span');
      badge.className = 'badge badge-locked';
      badge.textContent = 'Locked';
      card.querySelector('.card-head').appendChild(badge);
    }

    // Float + Special
    card.querySelector('.float').textContent = (row.float ?? '').toString();
    const spec = (row.special ?? '').toString().trim();
    const specialWrap = card.querySelector('.special-wrap');
    if (spec) {
      card.querySelector('.special').textContent = spec;
    } else {
      specialWrap.remove();
    }

    grid.appendChild(card);
  }
}

// wiring
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
const runSearch = debounce(() => applyAndRender(), 150);
searchInput?.addEventListener('input', runSearch);
window.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement !== searchInput) { e.preventDefault(); searchInput.focus(); } });
[cbKnives, cbGloves, cbWeapons, cbOther, sortSel, onlyUnlocked].forEach(el => el?.addEventListener('change', applyAndRender));

loadItems();
