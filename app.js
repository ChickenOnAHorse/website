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
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);

    /** @type {Array<any>} */
    const rows = await res.json();
    const now = new Date();

    grid.innerHTML = '';

    // We show *all* filtered rows from the server, but never render truly empty ones (no name).
    const items = rows
      .map((r) => {
        const name = (r.name || '').toString().trim();
        const purchasedAt = r.purchaseDate ? new Date(r.purchaseDate) : null;
        const availableAt = purchasedAt ? addDays(purchasedAt, 8) : null;
        return { ...r, name, purchasedAt, availableAt };
      })
      .filter((r) => r.name); // prevent empty cards

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

      // Image: Steam → fallback chicken
      const img = card.querySelector('.thumb');
      img.alt = row.name;
      try {
        const imgRes = await fetch(`/.netlify/functions/steam-image?name=${encodeURIComponent(row.name)}`);
        if (imgRes.ok) {
          const { url } = await imgRes.json();
          img.src = url || 'assets/chicken.png';
        } else {
          img.src = 'assets/chicken.png';
        }
      } catch {
        img.src = 'assets/chicken.png';
      }

      // Availability date (always show the date, if known)
      const availEl = card.querySelector('.available-date');
      if (row.availableAt) {
        availEl.textContent = fmtDate(row.availableAt);
      } else {
        availEl.textContent = 'TBD';
      }

      // Status line
      const statusLine = card.querySelector('.status-line');
      if (row.availableAt && row.availableAt <= now) {
        statusLine.textContent = 'Available';
        const badge = document.createElement('span');
        badge.className = 'badge badge-available';
        badge.textContent = 'Ready';
        card.querySelector('.card-head').appendChild(badge);
      } else {
        const daysLeft = row.availableAt ? ceilDays(row.availableAt - now) : null;
        if (daysLeft !== null) {
          statusLine.textContent = `Trade locked for ${daysLeft} more ${daysLeft === 1 ? 'day' : 'days'}`;
        } else {
          statusLine.textContent = 'Trade lock unknown';
        }
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
