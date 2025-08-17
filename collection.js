// ==== Config ==============================================================
const BLUE_SRC = 'assets/loadout-blue.png';
const GOLD_SRC = 'assets/loadout-gold.png';

// Bands: exactly 28.06% on each side (matches your spec)
const BAND_FRAC = 0.2806;
const RIGHT_BAND_START = 1 - BAND_FRAC;

// JSON location for hotspots
const HOTSPOTS_URL = 'assets/weapons.json';

// ==== Boot ================================================================
document.addEventListener('DOMContentLoaded', () => {
  const loadout   = document.getElementById('loadout');
  const imgWrap   = document.getElementById('imgWrap');
  const img       = document.getElementById('loadoutImage');
  const band      = document.getElementById('hoverBand');
  const spotsEl   = document.getElementById('hotspots');

  const modal     = document.getElementById('weaponModal');
  const modalImg  = document.getElementById('weaponImg');
  const modalTitle= document.getElementById('weaponTitle');
  const modalClose= document.getElementById('modalClose');

  if (!loadout || !imgWrap || !img || !band || !spotsEl || !modal || !modalImg || !modalTitle || !modalClose) {
    console.error('[coah] collection.js: required elements missing; check collection.html IDs.');
    return;
  }

  // Preload base images
  [BLUE_SRC, GOLD_SRC].forEach(src => { const i = new Image(); i.src = src; });

  let isBlue = true;          // initial matches BLUE_SRC in collection.html
  let DEBUG_UI = false;       // will be set from JSON ("debug": true/false)
  let HOTSPOTS = { blue: [], gold: [] };

  // ---- Load JSON ---------------------------------------------------------
  (async function init() {
    try {
      const res = await fetch(HOTSPOTS_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load ${HOTSPOTS_URL}: ${res.status}`);
      const data = await res.json();

      // Basic shape validation
      if (!data || !data.hotspots || !Array.isArray(data.hotspots.blue) || !Array.isArray(data.hotspots.gold)) {
        throw new Error('weapons.json missing required {hotspots:{blue:[], gold:[]}}');
      }
      HOTSPOTS = { blue: data.hotspots.blue, gold: data.hotspots.gold };
      DEBUG_UI = !!data.debug;

      // Render first time
      renderHotspots();
      wireInteractions();
    } catch (err) {
      console.error('[coah] weapons.json error:', err);
      // Fail soft: still wire swap so the page isn’t dead
      wireSwapOnly();
    }
  })();

  // ---- Hotspots rendering ------------------------------------------------
  function renderHotspots() {
    const list = isBlue ? HOTSPOTS.blue : HOTSPOTS.gold;
    spotsEl.innerHTML = '';

    list.forEach(h => {
      // guard invalid entries
      if (typeof h.x !== 'number' || typeof h.y !== 'number' || typeof h.w !== 'number' || typeof h.h !== 'number') return;

      const el = document.createElement('div');
      el.className = 'hotspot';
      el.style.left   = `${h.x}%`;
      el.style.top    = `${h.y}%`;
      el.style.width  = `${h.w}%`;
      el.style.height = `${h.h}%`;
      el.setAttribute('aria-label', h.title || h.id || 'weapon');

      if (DEBUG_UI) {
        el.style.boxShadow = '0 0 0 2px rgba(96,165,250,.65)';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = h.title || h.id || '';
        el.appendChild(label);
      }

      el.addEventListener('click', (ev) => {
        ev.stopPropagation(); // prevent side-band swap underneath
        openModal(h.title || h.id || '', h.image || '');
      });

      spotsEl.appendChild(el);
    });
  }

  // ---- Modal -------------------------------------------------------------
  function openModal(title, src) {
    modalTitle.textContent = title || '';
    modalImg.src = src || '';
    modal.classList.remove('hidden');
    document.addEventListener('keydown', escClose);
  }
  function closeModal() {
    modal.classList.add('hidden');
    modalImg.src = '';
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e){ if (e.key === 'Escape') closeModal(); }

  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  modalClose.addEventListener('click', closeModal);

  // ---- Swap logic (bands) ------------------------------------------------
  function wireInteractions() {
    // click to swap
    imgWrap.addEventListener('click', (e) => {
      const rect = imgWrap.getBoundingClientRect();
      const xRel = (e.clientX - rect.left) / rect.width;

      if (isBlue && xRel >= RIGHT_BAND_START) {
        swap(true);
      } else if (!isBlue && xRel <= BAND_FRAC) {
        swap(false);
      }
    });

    // hover band + cursor
    imgWrap.addEventListener('mousemove', (e) => {
      const rect = imgWrap.getBoundingClientRect();
      const xRel = (e.clientX - rect.left) / rect.width;
      let show = false;

      if (isBlue && xRel >= RIGHT_BAND_START) {
        band.style.display = 'block';
        band.style.left  = (rect.width * RIGHT_BAND_START) + 'px';
        band.style.width = (rect.width * BAND_FRAC) + 'px';
        show = true;
      } else if (!isBlue && xRel <= BAND_FRAC) {
        band.style.display = 'block';
        band.style.left  = '0px';
        band.style.width = (rect.width * BAND_FRAC) + 'px';
        show = true;
      } else {
        band.style.display = 'none';
      }
      imgWrap.style.cursor = show ? 'pointer' : 'default';
    });

    imgWrap.addEventListener('mouseleave', () => {
      band.style.display = 'none';
      imgWrap.style.cursor = 'default';
    });

    // Keyboard toggle (space)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        swap(isBlue); // toggles
      }
    });
  }

  function wireSwapOnly() {
    // same as above but without hotspots render
    imgWrap.addEventListener('click', (e) => {
      const rect = imgWrap.getBoundingClientRect();
      const xRel = (e.clientX - rect.left) / rect.width;
      if (isBlue && xRel >= RIGHT_BAND_START) swap(true);
      else if (!isBlue && xRel <= BAND_FRAC)  swap(false);
    });
    imgWrap.addEventListener('mousemove', (e) => {
      const rect = imgWrap.getBoundingClientRect();
      const xRel = (e.clientX - rect.left) / rect.width;
      let show = (isBlue && xRel >= RIGHT_BAND_START) || (!isBlue && xRel <= BAND_FRAC);
      if (show) {
        const rectW = rect.width;
        band.style.display = 'block';
        band.style.left  = isBlue ? (rectW * RIGHT_BAND_START) + 'px' : '0px';
        band.style.width = (rectW * BAND_FRAC) + 'px';
      } else {
        band.style.display = 'none';
      }
      imgWrap.style.cursor = show ? 'pointer' : 'default';
    });
    imgWrap.addEventListener('mouseleave', () => {
      band.style.display = 'none';
      imgWrap.style.cursor = 'default';
    });
  }

  function swap(toGold) {
    const nextSrc = toGold ? GOLD_SRC : BLUE_SRC;
    const nextIsBlue = !toGold;
    if ((isBlue && !nextIsBlue) || (!isBlue && nextIsBlue)) {
      img.classList.add('fade-out');
      setTimeout(() => {
        img.onload = () => requestAnimationFrame(() => img.classList.remove('fade-out'));
        img.src = nextSrc;
        isBlue = nextIsBlue;
        loadout.dataset.state = isBlue ? 'blue' : 'gold';
        // re-render hotspots for the new side (if we have data)
        if (HOTSPOTS.blue.length || HOTSPOTS.gold.length) renderHotspots();
      }, 150);
    }
  }
});
