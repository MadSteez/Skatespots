import { createMapController } from "./map.js";
import * as store from "./store.js";
import { escapeHtml, showToast, setLoading, debounce, uid } from "./utils.js";

const COMMON_TAGS = [
  "ledge", "stairs", "rail", "gap", "manual pad", "bank",
  "hubba", "quarter pipe", "bowl", "curb", "drop", "flat bar",
];

// ---------------- state ----------------
let allSpots = [];
let activeTagFilters = new Set();
let searchQuery = "";
let mobileView = "map"; // 'map' | 'list'

let previewItems = []; // { type:'existing', url } | { type:'pending', file, previewUrl }
let editingSpotId = null;
let currentDetailId = null;

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);
const layoutEl = document.querySelector(".layout");
const spotListEl = $("spotList");
const emptyStateEl = $("emptyState");
const tagChipsEl = $("tagChips");
const clearFiltersBtn = $("clearFiltersBtn");
const resultCountEl = $("resultCount");

const detailModal = $("detailModal");
const formModal = $("formModal");
const settingsModal = $("settingsModal");
const lightboxModal = $("lightboxModal");

const mapCtrl = createMapController("map");

// ============================================================
// Rendering
// ============================================================
function allTags() {
  const set = new Set();
  allSpots.forEach((s) => (s.tags || []).forEach((t) => set.add(t)));
  return [...set].sort();
}

function filteredSpots() {
  const q = searchQuery.trim().toLowerCase();
  return allSpots.filter((s) => {
    const matchesQuery = !q || s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
    const matchesTags = activeTagFilters.size === 0 || (s.tags || []).some((t) => activeTagFilters.has(t));
    return matchesQuery && matchesTags;
  });
}

function renderTagChips() {
  const tags = allTags();
  tagChipsEl.innerHTML = tags
    .map(
      (t) =>
        `<button class="chip${activeTagFilters.has(t) ? " is-active" : ""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
    )
    .join("");
  clearFiltersBtn.classList.toggle("hidden", activeTagFilters.size === 0 && !searchQuery);
}

function renderTagPills(tags = []) {
  return tags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("");
}

function renderList(spots) {
  if (spots.length === 0) {
    spotListEl.innerHTML = "";
    emptyStateEl.classList.remove("hidden");
    emptyStateEl.querySelector("p:last-child").textContent =
      allSpots.length === 0
        ? "Be the first — drop a pin and tell your crew where to roll up."
        : "Nothing matches your search or filters.";
    return;
  }
  emptyStateEl.classList.add("hidden");
  spotListEl.innerHTML = spots
    .map((spot) => {
      const thumb = spot.images && spot.images[0]
        ? `<img class="spot-card__thumb" src="${spot.images[0]}" alt="${escapeHtml(spot.name)}" loading="lazy">`
        : `<div class="spot-card__thumb spot-card__thumb--empty"><svg class="icon" width="28" height="28"><use href="#icon-image"/></svg></div>`;
      return `
        <article class="spot-card" data-id="${spot.id}">
          ${thumb}
          <div class="spot-card__body">
            <h3 class="spot-card__name">${escapeHtml(spot.name)}</h3>
            <p class="spot-card__desc">${escapeHtml(spot.description || "No description yet.")}</p>
            <div class="spot-card__tags">${renderTagPills(spot.tags)}</div>
          </div>
        </article>`;
    })
    .join("");
}

function render() {
  const spots = filteredSpots();
  renderTagChips();
  renderList(spots);
  mapCtrl.setSpots(spots, openDetailModal);
  resultCountEl.textContent = `${spots.length} spot${spots.length === 1 ? "" : "s"}`;
}

async function refreshAll({ silent = false } = {}) {
  try {
    if (!silent) setLoading(true, "Loading spots…");
    const { spots, needsSetup } = await store.loadSpots();
    allSpots = spots;
    render();
    if (needsSetup) {
      showToast("GitHub sync isn't set up yet — open Setup & sync.", { error: true, duration: 4500 });
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't load spots.", { error: true, duration: 5000 });
  } finally {
    if (!silent) setLoading(false);
  }
}

// ============================================================
// Detail modal
// ============================================================
function openDetailModal(id) {
  const spot = allSpots.find((s) => s.id === id);
  if (!spot) return;
  currentDetailId = id;

  const gallery = $("detailGallery");
  gallery.innerHTML = spot.images && spot.images.length
    ? spot.images.map((src) => `<img src="${src}" alt="${escapeHtml(spot.name)}">`).join("")
    : `<div class="detail__gallery--empty">No photos yet</div>`;

  $("detailName").textContent = spot.name;
  $("detailTags").innerHTML = renderTagPills(spot.tags);
  $("detailDesc").textContent = spot.description || "No description yet.";
  $("detailCoords").textContent = `${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}`;

  detailModal.classList.remove("hidden");
  mapCtrl.focusSpot(id);
}

function openLightbox(src, alt = "") {
  $("lightboxImg").src = src;
  $("lightboxImg").alt = alt;
  lightboxModal.classList.remove("hidden");
}

$("detailGallery").addEventListener("click", (e) => {
  const img = e.target.closest("img");
  if (img) openLightbox(img.src, img.alt);
});

function requireWriteAccess() {
  if (store.canWrite()) return true;
  showToast("Add a GitHub token in Setup & sync before adding, editing, or deleting spots.", { error: true, duration: 5500 });
  openSettingsModal();
  return false;
}

$("detailEditBtn").addEventListener("click", () => {
  if (!requireWriteAccess()) return;
  const spot = allSpots.find((s) => s.id === currentDetailId);
  closeModal(detailModal);
  if (spot) openFormModal(spot);
});

$("detailDeleteBtn").addEventListener("click", async () => {
  if (!requireWriteAccess()) return;
  const spot = allSpots.find((s) => s.id === currentDetailId);
  if (!spot) return;
  if (!confirm(`Delete "${spot.name}"? This can't be undone.`)) return;
  try {
    setLoading(true, "Deleting…");
    await store.deleteSpot(spot.id);
    closeModal(detailModal);
    await refreshAll({ silent: true });
    showToast("Spot deleted.");
  } catch (err) {
    showToast(err.message || "Couldn't delete spot.", { error: true, duration: 5000 });
  } finally {
    setLoading(false);
  }
});

// ============================================================
// Form modal (add / edit)
// ============================================================
function resetForm() {
  $("spotForm").reset();
  previewItems = [];
  editingSpotId = null;
  $("pickHint").textContent = "";
  renderImagePreviews();
}

function openFormModal(spot = null) {
  resetForm();
  if (spot) {
    editingSpotId = spot.id;
    $("formTitle").textContent = "Edit spot";
    $("fieldName").value = spot.name;
    $("fieldDescription").value = spot.description || "";
    $("fieldLat").value = spot.lat;
    $("fieldLng").value = spot.lng;
    $("fieldTags").value = (spot.tags || []).join(", ");
    previewItems = (spot.images || []).map((url) => ({ type: "existing", url }));
  } else {
    $("formTitle").textContent = "New spot";
  }
  renderTagSuggestions();
  renderImagePreviews();
  formModal.classList.remove("hidden");
}

function renderTagSuggestions() {
  $("tagSuggestions").innerHTML = COMMON_TAGS.map((t) => `<button type="button" class="chip" data-add-tag="${t}">+ ${t}</button>`).join("");
}

$("tagSuggestions").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add-tag]");
  if (!btn) return;
  const tagField = $("fieldTags");
  const current = tagField.value.split(",").map((t) => t.trim()).filter(Boolean);
  const toAdd = btn.dataset.addTag;
  if (!current.includes(toAdd)) current.push(toAdd);
  tagField.value = current.join(", ");
});

function renderImagePreviews() {
  const el = $("imagePreviews");
  el.innerHTML = previewItems
    .map((item, i) => {
      const src = item.type === "existing" ? item.url : item.previewUrl;
      return `<div class="image-preview" data-idx="${i}">
        <img src="${src}" alt="">
        <button type="button" class="image-preview__remove" data-remove-idx="${i}" aria-label="Remove photo">×</button>
      </div>`;
    })
    .join("");
}

$("imagePreviews").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove-idx]");
  if (!btn) return;
  const idx = Number(btn.dataset.removeIdx);
  const [removed] = previewItems.splice(idx, 1);
  if (removed?.type === "pending") URL.revokeObjectURL(removed.previewUrl);
  renderImagePreviews();
});

$("chooseImagesBtn").addEventListener("click", () => $("fieldImages").click());

$("fieldImages").addEventListener("change", (e) => {
  const files = [...e.target.files];
  const remainingSlots = 10 - previewItems.length;
  if (remainingSlots <= 0) {
    showToast("You've already got 10 photos on this spot — remove one first.", { error: true });
    e.target.value = "";
    return;
  }
  files.slice(0, remainingSlots).forEach((file) => {
    previewItems.push({ type: "pending", file, previewUrl: URL.createObjectURL(file) });
  });
  if (files.length > remainingSlots) {
    showToast(`Only added ${remainingSlots} — 10 photos max per spot.`, { error: true });
  }
  e.target.value = "";
  renderImagePreviews();
});

function isMobileLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

$("pickOnMapBtn").addEventListener("click", () => {
  const wasMobileView = mobileView;
  formModal.classList.add("hidden");
  if (isMobileLayout()) switchMobileView("map");
  showToast("Tap the map to set this spot's location.");
  mapCtrl.enablePickMode((lat, lng) => {
    $("fieldLat").value = lat.toFixed(6);
    $("fieldLng").value = lng.toFixed(6);
    $("pickHint").textContent = "Location set from the map.";
    mapCtrl.disablePickMode();
    formModal.classList.remove("hidden");
    if (isMobileLayout()) switchMobileView(wasMobileView);
  });
});

$("spotForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("fieldName").value.trim();
  const description = $("fieldDescription").value.trim();
  const lat = parseFloat($("fieldLat").value);
  const lng = parseFloat($("fieldLng").value);
  const tags = [...new Set($("fieldTags").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

  if (!name) return showToast("Give the spot a name.", { error: true });
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return showToast("Set a valid location (pick on the map or enter coordinates).", { error: true });
  }
  if (previewItems.length > 10) return showToast("Max 10 photos per spot.", { error: true });

  const keepImageUrls = previewItems.filter((p) => p.type === "existing").map((p) => p.url);
  const newFiles = previewItems.filter((p) => p.type === "pending").map((p) => p.file);
  const spotData = { id: editingSpotId || uid(), name, description, lat, lng, tags };

  const saveBtn = $("saveSpotBtn");
  saveBtn.disabled = true;
  try {
    setLoading(true, newFiles.length ? `Uploading photos (0/${newFiles.length})…` : "Saving…");
    await store.saveSpot(spotData, newFiles, keepImageUrls, (done, total) => {
      setLoading(true, `Uploading photos (${done}/${total})…`);
    });
    closeModal(formModal);
    await refreshAll({ silent: true });
    showToast(editingSpotId ? "Spot updated." : "Spot added.");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't save spot.", { error: true, duration: 5500 });
  } finally {
    saveBtn.disabled = false;
    setLoading(false);
  }
});

// ============================================================
// Settings modal
// ============================================================
function openSettingsModal() {
  const cfg = store.getConfig();
  const configured = cfg.mode === "github";
  $("repoInfoNote").classList.toggle("hidden", !configured);
  $("notConfiguredNote").classList.toggle("hidden", configured);
  if (configured) {
    $("repoInfoText").textContent = `${cfg.owner}/${cfg.repo}${cfg.branch ? " @ " + cfg.branch : ""}`;
  }
  $("cfgToken").value = cfg.token || "";
  settingsModal.classList.remove("hidden");
}

$("saveSettingsBtn").addEventListener("click", async () => {
  store.saveToken($("cfgToken").value);
  closeModal(settingsModal);
  await refreshAll();
  showToast("Token saved.");
});

// ============================================================
// Generic modal handling
// ============================================================
function closeModal(modalEl) {
  modalEl.classList.add("hidden");
  mapCtrl.disablePickMode();
  mapCtrl.clearTempMarker();
}
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", (e) => closeModal(e.target.closest(".modal-overlay")));
});
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  let mousedownWasOnOverlay = false;
  overlay.addEventListener("mousedown", (e) => {
    mousedownWasOnOverlay = e.target === overlay;
  });
  overlay.addEventListener("click", (e) => {
    if (mousedownWasOnOverlay && e.target === overlay) closeModal(overlay);
    mousedownWasOnOverlay = false;
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(closeModal);
  }
});

// ============================================================
// Mobile view switching
// ============================================================
function switchMobileView(view) {
  mobileView = view;
  layoutEl.classList.toggle("view-map", view === "map");
  layoutEl.classList.toggle("view-list", view === "list");
  document.querySelectorAll(".mobile-tabs__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  if (view === "map") mapCtrl.invalidateSize();
}
document.querySelectorAll(".mobile-tabs__btn").forEach((btn) => {
  btn.addEventListener("click", () => switchMobileView(btn.dataset.view));
});

// ============================================================
// Top-level wiring
// ============================================================
$("addSpotBtn").addEventListener("click", () => {
  if (requireWriteAccess()) openFormModal();
});
$("addSpotBtnMobile").addEventListener("click", () => {
  if (requireWriteAccess()) openFormModal();
});
$("settingsBtn").addEventListener("click", openSettingsModal);
$("locateBtn").addEventListener("click", () => mapCtrl.locate());

$("searchInput").addEventListener(
  "input",
  debounce((e) => {
    searchQuery = e.target.value;
    render();
  }, 150)
);

tagChipsEl.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-tag]");
  if (!chip) return;
  const tag = chip.dataset.tag;
  if (activeTagFilters.has(tag)) activeTagFilters.delete(tag);
  else activeTagFilters.add(tag);
  render();
});

clearFiltersBtn.addEventListener("click", () => {
  activeTagFilters.clear();
  searchQuery = "";
  $("searchInput").value = "";
  render();
});

spotListEl.addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (card) openDetailModal(card.dataset.id);
});

// ============================================================
// Boot
// ============================================================
switchMobileView("map");
refreshAll().then(() => {
  mapCtrl.fitToMarkers();
  const cfg = store.getConfig();
  const alreadySeenTip = localStorage.getItem("skatespots_seen_tip");
  if (!alreadySeenTip) {
    localStorage.setItem("skatespots_seen_tip", "1");
    if (cfg.mode === "github" && !cfg.token) {
      showToast("Showing this repo's shared spots. Open Setup & sync and add a token to contribute your own.", { duration: 5500 });
    } else if (cfg.mode === "local") {
      showToast("This page hasn't been set up to sync yet — see Setup & sync for details.", { duration: 5500 });
    }
  }
});
