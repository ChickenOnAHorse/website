document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  const grid = document.getElementById("grid");
  const tpl = document.getElementById("card-tpl");
  const status = document.getElementById("status");
  try {
    const res = await fetch("/.netlify/functions/fetch-items");
    const items = await res.json();
    grid.innerHTML = "";
    items.forEach(it => {
      const node = tpl.content.cloneNode(true);
      node.querySelector(".item-name").textContent = it.name;
      node.querySelector(".thumb").src = it.image || "assets/chicken.png";
      node.querySelector(".available-date").textContent = it.available;
      node.querySelector(".float").textContent = it.float || "—";
      node.querySelector(".special").textContent = it.special || "";
      grid.appendChild(node);
    });
    status.textContent = items.length ? "" : "No items available.";
  } catch(err){
    status.textContent = "Error loading items.";
    console.error(err);
  }
});
