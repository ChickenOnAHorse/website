// Exact asset paths
const BLUE_SRC = 'assets/loadout-blue.png';
const GOLD_SRC = 'assets/loadout-gold.png';

// Bands are 28.06% of the image width on each side
const BAND_FRAC = 0.2806;          // 28.06%
const RIGHT_BAND_START = 1 - BAND_FRAC; // start X (0..1) of right band

document.addEventListener('DOMContentLoaded', () => {
  const loadout = document.getElementById('loadout');
  const imgWrap = document.getElementById('imgWrap');
  const img = document.getElementById('loadoutImage');
  const band = document.getElementById('hoverBand');

  if (!loadout || !imgWrap || !img) return;

  // Preload both for fast swaps
  [BLUE_SRC, GOLD_SRC].forEach(src => { const i = new Image(); i.src = src; });

  let isBlue = true; // matches initial src

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
      }, 150);
    }
  }

  // Click handler uses the image wrapper (true image bounds)
  imgWrap.addEventListener('click', (e) => {
    const rect = imgWrap.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width; // 0..1

    if (isBlue && xRel >= RIGHT_BAND_START) {
      swap(true);   // blue -> gold (click in right band)
    } else if (!isBlue && xRel <= BAND_FRAC) {
      swap(false);  // gold -> blue (click in left band)
    }
  });

  // Hover band + pointer cursor (always sized to the image)
  function updateHover(e) {
    const rect = imgWrap.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    let show = false;

    if (isBlue && xRel >= RIGHT_BAND_START) {
      // Right stripe (gold side)
      band.style.display = 'block';
      band.style.left = (rect.width * RIGHT_BAND_START) + 'px';
      band.style.width = (rect.width * BAND_FRAC) + 'px';
      show = true;
    } else if (!isBlue && xRel <= BAND_FRAC) {
      // Left stripe (blue side)
      band.style.display = 'block';
      band.style.left = '0px';
      band.style.width = (rect.width * BAND_FRAC) + 'px';
      show = true;
    } else {
      band.style.display = 'none';
    }

    imgWrap.style.cursor = show ? 'pointer' : 'default';
  }

  imgWrap.addEventListener('mousemove', updateHover);
  imgWrap.addEventListener('mouseleave', () => {
    band.style.display = 'none';
    imgWrap.style.cursor = 'default';
  });

  // Recompute on resize (keeps band aligned if layout changes)
  window.addEventListener('resize', () => {
    band.style.display = 'none';
  });

  // Optional: Spacebar toggles for testing
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      swap(isBlue);
    }
  });
});
