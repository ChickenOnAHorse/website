// Config: exact asset paths
const BLUE_SRC = 'assets/loadout-blue.png';
const GOLD_SRC = 'assets/loadout-gold.png';

// Clickable band sizes (as fraction of width)
const RIGHT_BAND = 0.22; // right 22% (blue -> gold)
const LEFT_BAND  = 0.22; // left 22%  (gold -> blue)

document.addEventListener('DOMContentLoaded', () => {
  const loadout = document.getElementById('loadout');
  const img = document.getElementById('loadoutImage');
  const band = document.getElementById('hoverBand');

  if (!loadout || !img) return;

  // Preload both for fast swaps
  [BLUE_SRC, GOLD_SRC].forEach(src => { const i = new Image(); i.src = src; });

  let isBlue = true; // matches initial src

  function swap(toGold) {
    const nextSrc = toGold ? GOLD_SRC : BLUE_SRC;
    const nextIsBlue = !toGold;
    if ((isBlue && !nextIsBlue) || (!isBlue && nextIsBlue)) {
      // fade out, swap, fade in
      img.classList.add('fade-out');
      setTimeout(() => {
        img.onload = () => {
          requestAnimationFrame(() => img.classList.remove('fade-out'));
        };
        img.src = nextSrc;
        isBlue = nextIsBlue;
        loadout.dataset.state = isBlue ? 'blue' : 'gold';
      }, 150);
    }
  }

  // Click anywhere in the loadout container
  loadout.addEventListener('click', (e) => {
    const rect = loadout.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width; // 0..1

    if (isBlue && xRel >= 1 - RIGHT_BAND) {
      swap(true);  // blue -> gold
    } else if (!isBlue && xRel <= LEFT_BAND) {
      swap(false); // gold -> blue
    }
  });

  // Hover band + pointer cursor
  loadout.addEventListener('mousemove', (e) => {
    const rect = loadout.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    let show = false;

    if (isBlue && xRel >= 1 - RIGHT_BAND) {
      // right stripe (gold)
      band.style.display = 'block';
      band.style.left = (rect.width * (1 - RIGHT_BAND)) + 'px';
      band.style.width = (rect.width * RIGHT_BAND) + 'px';
      show = true;
    } else if (!isBlue && xRel <= LEFT_BAND) {
      // left stripe (blue)
      band.style.display = 'block';
      band.style.left = '0px';
      band.style.width = (rect.width * LEFT_BAND) + 'px';
      show = true;
    } else {
      band.style.display = 'none';
    }
    loadout.style.cursor = show ? 'pointer' : 'default';
  });

  loadout.addEventListener('mouseleave', () => {
    band.style.display = 'none';
    loadout.style.cursor = 'default';
  });

  // Optional: keyboard toggle for testing
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      swap(isBlue); // toggles
    }
  });
});
