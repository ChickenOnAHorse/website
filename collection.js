// --- Config --------------------------------------------------------------
const BLUE_SRC = 'assets/loadout-blue.png';
const GOLD_SRC = 'assets/loadout-gold.png';

// Bands are exactly 28.06% of the image width on each side
const BAND_FRAC = 0.2806;
const RIGHT_BAND_START = 1 - BAND_FRAC;

// Show labels/borders while aligning hotspots (set to false when done)
const DEBUG = true;

// Example hotspots for each loadout (percentages of the image)
const HOTSPOTS = {
  blue: [
    { id: 'ak',    x: 12, y: 52, w: 14, h: 12, title: 'AK-47 | Example',       image: 'assets/weapons/ak.png' },
    { id: 'awp',   x: 30, y: 28, w: 15, h: 12, title: 'AWP | Example',         image: 'assets/weapons/awp.png' },
    { id: 'knife', x: 70, y: 60, w: 10, h: 12, title: 'Knife | Example',       image: 'assets/weapons/knife.png' }
  ],
  gold: [
    // Start with same coordinates; tweak if gold layout shifts slightly
    { id: 'ak',    x: 12, y: 52, w: 14, h: 12, title: 'AK-47 | Example',       image: 'assets/weapons/ak.png' },
    { id: 'awp',   x: 30, y: 28, w: 15, h: 12, title: 'AWP | Example',         image: 'assets/weapons/awp.png' },
    { id: 'knife', x: 70, y: 60, w: 10, h: 12, title: 'Knife | Example',       image: 'assets/weapons/knife.png' }
  ]
};

// ------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  const loadout  = document.getElementById('loadout');
  const imgWrap  = document.getElementById('imgWrap');
  const img      = document.getElementById('loadoutImage');
  const band     = document.getElementById('hoverBand');
  const spotsEl  = document.getElementById('hotspots');

  const modal    = document.getElementById('weaponModal');
  const modalImg = document.getElementById('weaponImg');
  const modalTitle = document.getElementById('weaponTitle');
  const modalClose = document.getElementById('modalClose');

  if (!loadout || !imgWrap || !img || !spotsEl) return;

  // Preload both base images
  [BLUE_SRC, GOLD_SRC].forEach(src => { const i = new Image(); i.src = src; });

  let isBlue = true; // initial matches BLUE_SRC

  // ----- Loadout swap (click side bands) -----
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
        renderHotspots(); // refresh hotspots for the new side
      }, 150);
    }
  }

  imgWrap.addEventListener('click', (e) => {
    const rect = imgWrap.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;

    if (isBlue && xRel >= RIGHT_BAND_START) {
      swap(true);   // blue -> gold
    } else if (!isBlue && xRel <= BAND_FRAC) {
      swap(false);  // gold -> blue
    }
  });

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

  // ----- Hotspots rendering -----
  function renderHotspots() {
    const list = isBlue ? HOTSPOTS.blue : HOTSPOTS.gold;
    spotsEl.innerHTML = '';

    list.forEach(h => {
      const el = document.createElement('div');
      el.className = 'hotspot';
      el.style.left   = `${h.x}%`;
      el.style.top    = `${h.y}%`;
      el.style.width  = `${h.w}%`;
      el.style.height = `${h.h}%`;
      el.dataset.id = h.id;
      el.dataset.title = h.title || h.id;

      if (DEBUG) {
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = h.title || h.id;
        el.appendChild(label);
      }

      // open modal on click
      el.addEventListener('click', (ev) => {
        ev.stopPropagation(); // prevent band-swap click underneath
        openModal(h.title || h.id, h.image);
      });

      spotsEl.appendChild(el);
    });
  }

  // ----- Modal controls -----
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

  modal.addEventListener('click', (e) => {
    // close when clicking outside the inner panel
    if (e.target === modal) closeModal();
  });
  modalClose.addEventListener('click', closeModal);

  // Initial render
  renderHotspots();
});
