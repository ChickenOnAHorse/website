const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');

document.getElementById('year').textContent = new Date().getFullYear();

const fmtDate = (d) =>
  new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const ceilDays = (ms) => Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));

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
    const now = new Date();

    grid.innerHTML = '';

    const items = rows
      .map((r) => {
        const name = (r.name || '').toString().trim();
        const purchasedAt = r.purchaseDate ? new Date(r.purchaseDate) : null;
        const availableAt = purchasedAt ? addDays(purchasedAt, 8) : null;
        return { ...r, name, purchasedAt, availableAt };
      })
      .filter((r) => r.name); // never render empty names

    if (!items.length) {
      statusEl.textContent = 'No items currently available.';
      grid.setAttribute('aria-busy', 'false');
      return;
    }

    const tpl = document.getElementById('card-tpl');

    for (const row of items) {
      const card = /** @type {HTMLElement} */ (tpl.content.cloneNode(true));

      // Title
      card.querySelector('.item-name').textContent = row.name;

      // Image: default to chicken, then try Steam
      const img = card.querySelector('.thumb');
      img.alt = row.name;
      img.src = 'assets/chicken.png'; // safe default
      img.onerror = () => { img.src = 'assets/chicken.png'; }; // hard fallback

      try {
        const imgRes = await fetch(`/.netlify/functions/steam-image?name=${encodeURIComponent(row.name)}`);
        if (imgRes.ok) {
          const { url } = await imgRes.json();
          if (url) {
            img.src = url;
          } // else keep chicken
        }
      } catch (e) {
        // keep chicken; also helpful for debugging
        console.debug('steam-image lookup failed for', row.name, e);
      }

      // Status + Available date
      const availEl = card.querySelector('.available-date');
      if (row.availableAt) {
        availEl.textContent = fmtDate(row.availableAt);
      } else {
        availEl.textContent = 'TBD';
      }

      const statusLine = card.querySelector('.status-line');
      if (row.availableAt && row.availableAt <= now) {
        statusLine.textContent = 'Available';
        const badge = document.createElement('span');
        badge.className = 'badge badge-available';
        badge.textContent = 'Ready';
        card.querySelector('.card-head').appendChild(badge);
      } else {
        const daysLeft = row.availableAt ? ceilDays(row.availableAt - now) : null;
        statusLine.textContent =
          daysLeft !== null
            ? `Trade locked for ${daysLeft} more ${daysLeft === 1 ? 'day' : 'days'}`
            : 'Trade lock unknown';
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

    statusEl.textContent = '';
    grid.setAttribute('aria-busy', 'false');
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Could not load items. Please try again later.';
    grid.setAttribute('aria-busy', 'false');
  }
}

loadItems();
