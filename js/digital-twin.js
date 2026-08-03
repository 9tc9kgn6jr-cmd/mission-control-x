const TWIN_STORAGE_KEY = "mcx-v2-digital-twin";

const DEFAULT_TWIN_ITEMS = [
  { id: "torch", name: "Torch Coral", type: "LPS", x: 22, y: 54, status: "good", note: "Observe polyp extension and tissue condition." },
  { id: "zoas", name: "Zoanthids", type: "Soft Coral", x: 36, y: 72, status: "good", note: "Track opening percentage and growth." },
  { id: "monti", name: "Montipora", type: "SPS", x: 67, y: 48, status: "watch", note: "Watch coloration and edge growth." },
  { id: "hammer", name: "Hammer Coral", type: "LPS", x: 78, y: 70, status: "good", note: "Monitor flow and extension." },
  { id: "fish", name: "Fish Community", type: "Livestock", x: 52, y: 28, status: "good", note: "Observe appetite, breathing, and behavior." }
];

const loadTwinItems = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(TWIN_STORAGE_KEY) || "null");
    return Array.isArray(saved) && saved.length ? saved : DEFAULT_TWIN_ITEMS.map((item) => ({ ...item }));
  } catch (error) {
    return DEFAULT_TWIN_ITEMS.map((item) => ({ ...item }));
  }
};

const saveTwinItems = (items) => {
  localStorage.setItem(TWIN_STORAGE_KEY, JSON.stringify(items));
};

const twinStatusLabel = (status) => {
  if (status === "alert") return "Action Required";
  if (status === "watch") return "Watch";
  return "Stable";
};

const renderTwinList = () => {
  const list = document.getElementById("twin-list");
  if (!list) return;

  const items = loadTwinItems();

  list.innerHTML = items.map((item) => `
    <div class="twin-list-item">
      <div>
        <strong>${item.name}</strong>
        <span>${item.type} · ${twinStatusLabel(item.status)}</span>
      </div>
      <button type="button" data-remove-id="${item.id}">Remove</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.removeId;
      const next = loadTwinItems().filter((item) => item.id !== id);
      saveTwinItems(next);
      renderDigitalTwin();
      renderTwinList();
    });
  });
};

const selectTwinItem = (item, button) => {
  document.querySelectorAll(".twin-node").forEach((node) => node.classList.remove("active"));
  button.classList.add("active");

  document.getElementById("twin-selected").textContent = `${item.name} · ${item.type}`;
  document.getElementById("twin-selected-status").textContent = twinStatusLabel(item.status);
  document.getElementById("twin-selected-note").textContent = item.note || "No observation note yet.";
};

const renderDigitalTwin = () => {
  const map = document.getElementById("twin-map");
  if (!map) return;

  map.querySelectorAll(".twin-node").forEach((node) => node.remove());

  loadTwinItems().forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `twin-node ${item.status || "good"}`;
    button.style.left = `${Number(item.x) || 50}%`;
    button.style.top = `${Number(item.y) || 50}%`;
    button.innerHTML = `
      <strong><span class="twin-dot"></span>${item.name}</strong>
      <span>${item.type}</span>
    `;
    button.addEventListener("click", () => selectTwinItem(item, button));
    map.appendChild(button);
  });
};

const attachTwinEditor = () => {
  const addButton = document.getElementById("twin-add");
  const resetButton = document.getElementById("twin-reset");

  addButton?.addEventListener("click", () => {
    const name = document.getElementById("twin-name").value.trim();
    const type = document.getElementById("twin-type").value.trim() || "Livestock";
    const status = document.getElementById("twin-status").value;
    const note = document.getElementById("twin-note").value.trim();
    const [rawX, rawY] = document.getElementById("twin-position").value
      .split(",")
      .map((value) => Number(value.trim()));

    if (!name) {
      alert("Enter a livestock name first.");
      return;
    }

    const items = loadTwinItems();
    items.push({
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      name,
      type,
      status,
      note,
      x: Number.isFinite(rawX) ? Math.max(8, Math.min(92, rawX)) : 50,
      y: Number.isFinite(rawY) ? Math.max(12, Math.min(88, rawY)) : 50
    });

    saveTwinItems(items);
    renderDigitalTwin();
    renderTwinList();

    document.getElementById("twin-name").value = "";
    document.getElementById("twin-type").value = "";
    document.getElementById("twin-note").value = "";
    document.getElementById("twin-position").value = "";
  });

  resetButton?.addEventListener("click", () => {
    localStorage.removeItem(TWIN_STORAGE_KEY);
    renderDigitalTwin();
    renderTwinList();
  });
};

window.initDigitalTwin = () => {
  renderDigitalTwin();
  renderTwinList();
  attachTwinEditor();
};
