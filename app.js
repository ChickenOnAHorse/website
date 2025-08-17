const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');

document.getElementById('year').textContent = new Date().getFullYear();

const fmtDate = (d) =>
  new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

/**
 * Compute midnight in PST (fixed UTC-8) for the given Date's calendar day,
 * then add 8 days to get the unlock moment (also midnight PST).
 */
function unlockAtMidnightPST(purchaseDate) {
  if (!purchaseDate) return null;
  const y = purchaseDate.getUTCFullYear();
  const m = purchaseDate.getUTCMonth();   // 0-11
  const d = purchaseDate.getUTCDate();
  // Midnight PST == 08:00 UTC of that same calendar day
  const midnightPST_utcMs = Date.UTC(y, m, d, 8, 0, 0, 0);
  return new Date(midnightPST_utcMs + 8 * MS_DAY); // +8 days at midnight PST
}

/** Format "Xd Y hours" with your requested spacing: "3days 3 hours" */
function formatDaysHours(ms) {
  if (ms <= 0) return '0days 0 hours';
  const days = Math.floor(ms / MS_DAY);
  const hours = Math.floor((ms % MS_DAY) / MS_HOUR);
  return `${days}days ${hours} hours`;
}

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
    const now = Date.now();

    grid.innerHTML = '';

    const items = rows
      .map((r) => {
        const name = (r.name || '').toString().trim();
        const purchasedAt = r.purchaseDate ? new Date(r.purchaseDate) : null;
        const unlockAt = purchasedAt ? unlockAtMidnightPST(purchasedAt) : null;
        return { ...r, name, purchasedAt, unlockAt };
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

      // Image priority: sheet-provided URL -> Steam lookup -> chicken
      const img = card.querySelector('.thumb');
      img.alt = row.name;
      img.src = 'assets/chicken.png'; // safe default
      img.onerror = () => { img.src = 'assets/chicken.png'; }; // hard fallback

      if (row.image && typeof row.image === 'string' && row.image.trim()) {
        img.src = row.image.trim();
      } else {
        try {
          const params = new URLSearchParams({ name: row.name });
          if (row.float != null && row.float !== '') params.set('float', String(row.float));
          const imgRes = await fetch(`/.netlify/functions/resolve-image?${params.toString()}`);
          if (imgRes.ok) {
            const { url } = await imgRes.json();
            if (url) img.src = url; // otherwise stays chicken
          }
        } catch (e) {
          console.debug('resolve-image failed for', row.name, e);
        }
      }

      // Availability date field:
      // - If unlocked => display "-"
      // - If still locked => display the exact unlock date (for buyer clarity)
      const availEl = card.querySelector('.available-date');
      if (row.unlockAt && row.unlockAt.getTime() <= now) {
        availEl.textContent = '-';
      } else {
        availEl.textContent = row.unlockAt ? fmtDate(row.unlockAt) : 'TBD';
      }

      // Status line: "Available" vs "Trade locked for Xdays Y hours"
      const statusLine = card.querySelector('.status-line');
      if (row.unlockAt && row.unlockAt.getTime() <= now) {
        statusLine.textContent = 'Available';
        const badge = document.createElement('span');
        badge.className = 'badge badge-available';
        badge.textContent = 'Ready';
        card.querySelector('.card-head').appendChild(badge);
      } else {
        const msLeft = row.unlockAt ? (row.unlockAt.getTime() - now) : 0;
        statusLine.textContent = `Trade locked for ${formatDaysHours(msLeft)}`;
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
