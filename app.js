// ================== CONFIG ==================
const sheetID = "YOUR_SHEET_ID_HERE";
const apiKey = "YOUR_API_KEY_HERE";
const range = "Skins!A:Z"; // adjust if needed

const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sheetID}/values/${range}?key=${apiKey}`;

// ================== HELPERS ==================
function parseCondition(float) {
  if (float < 0.07) return "Factory New";
  if (float < 0.15) return "Minimal Wear";
  if (float < 0.38) return "Field-Tested";
  if (float < 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

function formatTimeRemaining(unlockDate) {
  const now = new Date();
  const unlock = new Date(unlockDate);
  const diffMs = unlock - now;
  if (diffMs <= 0) return null;

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(
    (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );

  return `Trade locked for ${diffDays} days ${diffHours} hours`;
}

// ================== RENDER ==================
function createCard(skin) {
  const card = document.createElement("div");
  card.className = "card";

  const imgContainer = document.createElement("div");
  imgContainer.className = "image-container";

  const img = document.createElement("img");
  img.src = skin.Image || "assets/chicken.png";
  img.alt = skin.Name;
  img.loading = "lazy";

  // magnify button
  const magnifyBtn = document.createElement("button");
  magnifyBtn.className = "magnify-btn";
  magnifyBtn.innerHTML = "🔍";
  magnifyBtn.onclick = () => showModalImage(skin.Image || "assets/chicken.png");

  imgContainer.appendChild(img);
  imgContainer.appendChild(magnifyBtn);

  const title = document.createElement("h3");
  title.textContent = skin.Name;

  const condition = document.createElement("p");
  condition.textContent = `Condition: ${parseCondition(parseFloat(skin.Float))}`;

  const special = document.createElement("p");
  special.textContent = `Special: ${skin.Special || "-"}`;

  const status = document.createElement("p");
  if (skin.Status === "Available") {
    status.textContent = "Unlocked";
    status.className = "status unlocked";
  } else {
    const timeRemaining = formatTimeRemaining(skin.UnlockDate);
    if (timeRemaining) {
      status.textContent = timeRemaining;
      status.className = "status locked";
    } else {
      status.textContent = "Unlocked";
      status.className = "status unlocked";
    }
  }

  card.appendChild(imgContainer);
  card.appendChild(title);
  card.appendChild(condition);
  if (skin.Special) card.appendChild(special);
  card.appendChild(status);

  return card;
}

// ================== MODAL ==================
function showModalImage(src) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.onclick = () => modal.remove();

  const modalImg = document.createElement("img");
  modalImg.src = src;
  modalImg.className = "modal-img";

  modal.appendChild(modalImg);
  document.body.appendChild(modal);
}

// ================== FILTERING ==================
function getCategory(skin) {
  const name = skin.Name.toLowerCase();
  const special = (skin.Special || "").toLowerCase();

  if (name.includes("knife")) return "Knives";
  if (name.includes("glove")) return "Gloves";

  // CS guns dictionary
  const guns = [
    "ak-47",
    "m4a1",
    "m4a4",
    "awp",
    "usp",
    "p250",
    "famas",
    "galil",
    "aug",
    "ssg",
    "scar",
    "mac",
    "mp7",
    "mp9",
    "ump",
    "p90",
    "pp-bizon",
    "nova",
    "xm1014",
    "mag-7",
    "sawed-off",
    "negev",
    "m249",
    "desert eagle",
    "dual berettas",
    "five-seven",
    "cz75",
    "tec-9",
    "glock"
  ];

  if (guns.some((gun) => name.includes(gun))) return "Guns";

  // if nothing else, it's Other
  return "Other";
}

function isKato14(skin) {
  const special = (skin.Special || "").toLowerCase();
  return (
    special.includes("kato") ||
    special.includes("k14") ||
    special.includes("kato14")
  );
}

function renderCards(data, filters) {
  const container = document.getElementById("cards-container");
  container.innerHTML = "";

  let filtered = data.filter((skin) => {
    const category = getCategory(skin);
    const kato14 = isKato14(skin);

    let matchesCategory = true;
    if (filters.category && filters.category !== "All") {
      if (filters.category === "Kato14") {
        matchesCategory = kato14;
      } else {
        matchesCategory = category === filters.category;
      }
    }

    let matchesUnlocked = true;
    if (filters.onlyUnlocked) {
      matchesUnlocked = skin.Status === "Available";
    }

    let matchesSearch = true;
    if (filters.search) {
      matchesSearch = skin.Name.toLowerCase().includes(
        filters.search.toLowerCase()
      );
    }

    return matchesCategory && matchesUnlocked && matchesSearch;
  });

  // sorting
  if (filters.sort === "Newest") {
    filtered = filtered.reverse();
  }

  // render
  filtered.forEach((skin) => {
    const card = createCard(skin);
    container.appendChild(card);
  });

  // update count
  document.getElementById(
    "item-count"
  ).textContent = `Showing ${filtered.length} items`;
}

// ================== MAIN ==================
async function init() {
  const res = await fetch(endpoint);
  const json = await res.json();
  const rows = json.values;
  const headers = rows[0];
  const data = rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });

  const filters = {
    category: "All",
    sort: "Newest",
    onlyUnlocked: false,
    search: ""
  };

  // wiring filters
  const categorySelect = document.getElementById("category-filter");
  const sortSelect = document.getElementById("sort-filter");
  const unlockedCheckbox = document.getElementById("unlocked-filter");
  const searchInput = document.getElementById("search-bar");

  categorySelect.onchange = () => {
    filters.category = categorySelect.value;
    renderCards(data, filters);
  };
  sortSelect.onchange = () => {
    filters.sort = sortSelect.value;
    renderCards(data, filters);
  };
  unlockedCheckbox.onchange = () => {
    filters.onlyUnlocked = unlockedCheckbox.checked;
    renderCards(data, filters);
  };
  searchInput.oninput = () => {
    filters.search = searchInput.value;
    renderCards(data, filters);
  };

  renderCards(data, filters);
}

init();
