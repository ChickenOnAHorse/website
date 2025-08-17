const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const searchInput = document.getElementById('search');

document.getElementById('year').textContent = new Date().getFullYear();

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

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

/** e.g. "6 days 3 hours" (with the space you wanted) */
function formatDaysHours(ms) {
  if (ms <= 0) return '0 days 0 hours';
  const days = Math.floor(ms / MS_DAY);
  const hours = Math.floor((ms % MS_DAY) / MS_HOUR);
  return `${days} days ${hours} hours`;
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
        return { ...r, name, purchasedAt, unlockAt };
      })
      .filter((r) => r.name); // no empty cards

    ALL_ITEMS = items;
    render(items);
    statusEl.textContent = '';
    grid.setAttribute('aria-busy', 'false');
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Could not load items. Please try again later.';
    grid.setAttribute('aria-busy', 'false');
  }
}

/** Render items, optionally filtered by search query (name only) */
async function render(items, q = '') {
  const now = Date.now();
  const tpl = document.getElementById('card-tpl');

  // simple name-only search (case-insensitive)
  const query = q.trim().toLowerCase();
  const list = query ? items.filter(i => i.name.toLowerCase().includes(query)) : items;

  grid.innerHTML = '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No matching items.';
    grid.appendChild(p);
    return;
  }

  for (const row of list) {
    const card = /** @type {HTMLElement} */ (tpl.content.cloneNode(true));

    // Title
    card.querySelector('.item-name').textContent = row.name;

    // Image priority: sheet-provided URL -> resolver -> chicken
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
      } catch {
        /* fallback already set */
      }
    }

    // Status + Available on
    const availableWrap = card.querySelector('.available-wrap');
    const availEl = card.querySelector('.available-date');
    const statusLine = card.querySelector('.status-line');

    if (row.unlockAt && row.unlockAt.getTime() <= now) {
      // UNLOCKED
      statusLine.textContent = 'Unlocked';
      // remove the "Available on" row entirely
      availableWrap?.remove();
      // optional badge (kept same styles)
      const badge = document.createElement('span');
      badge.className = 'badge badge-available';
      badge.textContent = 'Ready';
      card.querySelector('.card-head').appendChild(badge);
    } else {
      // LOCKED
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

// --- search wiring (press "/" to focus, live filtering) ---
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
const runSearch = debounce(() => render(ALL_ITEMS, searchInput.value), 150);
searchInput?.addEventListener('input', runSearch);
window.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
});

loadItems();
