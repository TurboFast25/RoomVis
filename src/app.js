import { requestNanoBananaGeneration } from "./services/nanoBanana.js";

const furnitureCatalog = [
  { id: "sofa", name: "Sofa", icon: "🛋️" },
  { id: "chair", name: "Chair", icon: "🪑" },
  { id: "lamp", name: "Lamp", icon: "💡" },
  { id: "table", name: "Coffee Table", icon: "◼️" },
  { id: "plant", name: "Plant", icon: "🪴" },
  { id: "shelf", name: "Shelf", icon: "🧱" },
];

const state = {
  items: [],
  selectedId: null,
  roomImageDataUrl: "",
  showGrid: false,
};

const els = {
  roomUpload: document.querySelector("#room-upload"),
  roomBoard: document.querySelector("#room-board"),
  roomImage: document.querySelector("#room-image"),
  dropHint: document.querySelector("#drop-hint"),
  furnitureLayer: document.querySelector("#furniture-layer"),
  furnitureLibrary: document.querySelector("#furniture-library"),
  libraryTemplate: document.querySelector("#furniture-card-template"),
  placedTemplate: document.querySelector("#placed-item-template"),
  scaleControl: document.querySelector("#scale-control"),
  rotationControl: document.querySelector("#rotation-control"),
  depthControl: document.querySelector("#depth-control"),
  selectionStatus: document.querySelector("#selection-status"),
  removeItem: document.querySelector("#remove-item"),
  promptInput: document.querySelector("#prompt-input"),
  generationLog: document.querySelector("#generation-log"),
  generateScene: document.querySelector("#generate-scene"),
  resetRoom: document.querySelector("#reset-room"),
  toggleGrid: document.querySelector("#toggle-grid"),
  generatedImage: document.querySelector("#generated-image"),
  resultPlaceholder: document.querySelector("#result-placeholder"),
  resultStatus: document.querySelector("#result-status"),
};

renderFurnitureLibrary();
attachEvents();
render();

function attachEvents() {
  els.roomUpload.addEventListener("change", handleRoomUpload);
  els.furnitureLayer.addEventListener("pointerdown", beginExistingItemDrag);
  els.furnitureLayer.addEventListener("click", handlePlacedItemClick);
  els.roomBoard.addEventListener("dragover", handleBoardDragOver);
  els.roomBoard.addEventListener("drop", handleBoardDrop);
  els.scaleControl.addEventListener("input", updateSelectedItemFromControls);
  els.rotationControl.addEventListener("input", updateSelectedItemFromControls);
  els.depthControl.addEventListener("input", updateSelectedItemFromControls);
  els.removeItem.addEventListener("click", removeSelectedItem);
  els.generateScene.addEventListener("click", generateScene);
  els.resetRoom.addEventListener("click", resetRoom);
  els.toggleGrid.addEventListener("click", toggleGrid);
  document.addEventListener("keydown", handleKeydown);
}

function renderFurnitureLibrary() {
  furnitureCatalog.forEach((entry) => {
    const fragment = els.libraryTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".furniture-card");

    button.dataset.furnitureId = entry.id;
    fragment.querySelector(".furniture-icon").textContent = entry.icon;
    fragment.querySelector(".furniture-name").textContent = entry.name;

    button.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", entry.id);
    });

    button.addEventListener("click", () => {
      if (!state.roomImageDataUrl) {
        setLog("Upload a room image before placing furniture.");
        return;
      }

      addFurniture(entry.id, 50, 50);
    });

    els.furnitureLibrary.appendChild(fragment);
  });
}

function handleRoomUpload(event) {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.roomImageDataUrl = String(reader.result);
    state.items = [];
    state.selectedId = null;
    render();
    setLog(`Loaded room image: ${file.name}`);
  };
  reader.readAsDataURL(file);
}

function handleBoardDragOver(event) {
  event.preventDefault();
}

function handleBoardDrop(event) {
  event.preventDefault();
  if (!state.roomImageDataUrl) {
    return;
  }

  const furnitureId = event.dataTransfer.getData("text/plain");
  if (!furnitureId) {
    return;
  }

  const boardRect = els.roomBoard.getBoundingClientRect();
  const x = ((event.clientX - boardRect.left) / boardRect.width) * 100;
  const y = ((event.clientY - boardRect.top) / boardRect.height) * 100;
  addFurniture(furnitureId, x, y);
}

function addFurniture(furnitureId, x, y) {
  const definition = furnitureCatalog.find((item) => item.id === furnitureId);
  if (!definition) {
    return;
  }

  const nextItem = {
    instanceId: crypto.randomUUID(),
    furnitureId,
    name: definition.name,
    icon: definition.icon,
    x,
    y,
    scale: 100,
    rotation: 0,
    elevation: 0,
  };

  state.items = [...state.items, nextItem];
  state.selectedId = nextItem.instanceId;
  render();
}

function beginExistingItemDrag(event) {
  const button = event.target.closest(".placed-item");
  if (!button) {
    return;
  }

  event.preventDefault();
  state.selectedId = button.dataset.instanceId;
  renderSelectionControls();

  const boardRect = els.roomBoard.getBoundingClientRect();

  const move = (moveEvent) => {
    const x = clampPercent(((moveEvent.clientX - boardRect.left) / boardRect.width) * 100);
    const y = clampPercent(((moveEvent.clientY - boardRect.top) / boardRect.height) * 100);

    state.items = state.items.map((item) =>
      item.instanceId === state.selectedId ? { ...item, x, y } : item,
    );

    renderPlacedItems();
  };

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
}

function handlePlacedItemClick(event) {
  const button = event.target.closest(".placed-item");
  if (!button) {
    state.selectedId = null;
    renderSelectionControls();
    renderPlacedItems();
    return;
  }

  state.selectedId = button.dataset.instanceId;
  renderSelectionControls();
  renderPlacedItems();
}

function updateSelectedItemFromControls() {
  const selected = getSelectedItem();
  if (!selected) {
    return;
  }

  state.items = state.items.map((item) =>
    item.instanceId === selected.instanceId
      ? {
          ...item,
          scale: Number(els.scaleControl.value),
          rotation: Number(els.rotationControl.value),
          elevation: Number(els.depthControl.value),
        }
      : item,
  );

  renderPlacedItems();
}

function removeSelectedItem() {
  if (!state.selectedId) {
    return;
  }

  state.items = state.items.filter((item) => item.instanceId !== state.selectedId);
  state.selectedId = null;
  render();
}

function toggleGrid() {
  state.showGrid = !state.showGrid;
  els.roomBoard.classList.toggle("grid-hidden", !state.showGrid);
  els.toggleGrid.textContent = state.showGrid ? "Grid Off" : "Grid On";
}

function resetRoom() {
  state.items = [];
  state.selectedId = null;
  state.roomImageDataUrl = "";
  els.roomUpload.value = "";
  render();
  setLog("Room reset. Upload a new image to start again.");
}

function handleKeydown(event) {
  if (event.key === "Delete" || event.key === "Backspace") {
    removeSelectedItem();
  }
}

async function generateScene() {
  if (!state.roomImageDataUrl) {
    setLog("Generation skipped: upload a room image first.");
    return;
  }

  const payload = {
    roomImageDataUrl: state.roomImageDataUrl,
    prompt: els.promptInput.value.trim(),
    furniture: state.items.map(({ name, x, y, scale, rotation }) => ({
      name,
      x,
      y,
      scale,
      rotation,
    })),
  };

  setLog("Submitting staged room payload to Nano Banana service...");
  setResultState({ status: "Generating...", imageUrl: "" });

  try {
    const result = await requestNanoBananaGeneration(payload);
    setLog(JSON.stringify(result.meta, null, 2));
    setResultState({
      status: result.imageDataUrl ? "Image ready" : "No image returned",
      imageUrl: result.imageDataUrl,
    });
  } catch (error) {
    setLog(`Generation failed: ${error.message}`);
    setResultState({ status: "Generation failed", imageUrl: "" });
  }
}

function render() {
  const ready = Boolean(state.roomImageDataUrl);
  els.roomBoard.classList.toggle("is-ready", ready);
  els.dropHint.hidden = ready;
  els.roomImage.src = state.roomImageDataUrl;
  renderPlacedItems();
  renderSelectionControls();
}

function renderPlacedItems() {
  els.furnitureLayer.innerHTML = "";

  state.items.forEach((item) => {
    const fragment = els.placedTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".placed-item");

    button.dataset.instanceId = item.instanceId;
    button.style.left = `${item.x}%`;
    button.style.top = `${item.y}%`;
    button.style.transform = `translate(-50%, -50%) scale(${item.scale / 100}) rotate(${item.rotation}deg) translateY(${item.elevation}px)`;
    button.classList.toggle("is-selected", item.instanceId === state.selectedId);
    fragment.querySelector(".placed-item__icon").textContent = item.icon;

    els.furnitureLayer.appendChild(fragment);
  });
}

function renderSelectionControls() {
  const selected = getSelectedItem();
  if (!selected) {
    els.selectionStatus.textContent = "Nothing selected";
    els.scaleControl.value = "100";
    els.rotationControl.value = "0";
    els.depthControl.value = "0";
    return;
  }

  els.selectionStatus.textContent = selected.name;
  els.scaleControl.value = String(selected.scale);
  els.rotationControl.value = String(selected.rotation);
  els.depthControl.value = String(selected.elevation);
}

function getSelectedItem() {
  return state.items.find((item) => item.instanceId === state.selectedId) ?? null;
}

function clampPercent(value) {
  return Math.min(96, Math.max(4, value));
}

function setLog(message) {
  els.generationLog.textContent = message;
}

function setResultState({ status, imageUrl }) {
  els.resultStatus.textContent = status;
  if (!imageUrl) {
    els.generatedImage.hidden = true;
    els.generatedImage.removeAttribute("src");
    els.resultPlaceholder.hidden = false;
    return;
  }

  els.generatedImage.src = imageUrl;
  els.generatedImage.hidden = false;
  els.resultPlaceholder.hidden = true;
}
