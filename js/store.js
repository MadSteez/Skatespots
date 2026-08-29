import { GitHubStore } from "./github.js";
import { SITE_CONFIG } from "./site-config.js";
import { utf8ToB64, b64ToUtf8, compressImage, blobToRawBase64, blobToDataUrl } from "./utils.js";

const TOKEN_KEY = "skatespots_token";
const LEGACY_CONFIG_KEY = "skatespots_config"; // older versions saved a whole config object here, including owner/repo — that could permanently shadow site-config.js, so it's no longer read except to migrate a saved token out of it once.
const LOCAL_DATA_KEY = "skatespots_local_data";
const SPOTS_PATH = "data/spots.json";

let cachedSpots = [];

function migrateLegacyToken() {
  if (localStorage.getItem(TOKEN_KEY) !== null) return;
  try {
    const raw = localStorage.getItem(LEGACY_CONFIG_KEY);
    if (raw) {
      const legacy = JSON.parse(raw);
      if (legacy && legacy.token) localStorage.setItem(TOKEN_KEY, legacy.token);
    }
  } catch (_) {}
}

export function getToken() {
  migrateLegacyToken();
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, (token || "").trim());
}

/**
 * A GitHub Pages URL already encodes the owner and repo:
 *  - project page: https://<owner>.github.io/<repo>/...
 *  - user/org page: https://<owner>.github.io/  (repo is literally "<owner>.github.io")
 * Used only as a fallback when site-config.js hasn't been filled in.
 */
export function detectRepoFromLocation() {
  try {
    const host = window.location.hostname;
    const m = host.match(/^([^.]+)\.github\.io$/i);
    if (!m) return null;
    const owner = m[1];
    const segments = window.location.pathname.split("/").filter(Boolean);
    const repo = segments.length > 0 ? segments[0] : `${owner}.github.io`;
    return { owner, repo };
  } catch (_) {
    return null;
  }
}

export function getConfig() {
  const token = getToken();
  if (SITE_CONFIG.owner && SITE_CONFIG.repo) {
    return { mode: "github", owner: SITE_CONFIG.owner, repo: SITE_CONFIG.repo, branch: SITE_CONFIG.branch || "", token };
  }
  const detected = detectRepoFromLocation();
  if (detected) {
    return { mode: "github", owner: detected.owner, repo: detected.repo, branch: "", token };
  }
  return { mode: "local" };
}

export function isGithubConfigured(cfg = getConfig()) {
  return cfg.mode === "github" && !!cfg.owner && !!cfg.repo;
}

export function canWrite(cfg = getConfig()) {
  if (cfg.mode === "local") return true;
  return isGithubConfigured(cfg) && !!cfg.token;
}

function ghFromConfig(cfg) {
  return new GitHubStore(cfg);
}

/** Load the current spot list from wherever it lives. */
export async function loadSpots() {
  const cfg = getConfig();
  if (cfg.mode === "github") {
    if (!isGithubConfigured(cfg)) {
      cachedSpots = [];
      return { spots: [], needsSetup: true };
    }
    const gh = ghFromConfig(cfg);
    const file = await gh.getFile(SPOTS_PATH);
    cachedSpots = file ? JSON.parse(b64ToUtf8(file.content)) : [];
    return { spots: cachedSpots, needsSetup: false };
  }
  const raw = localStorage.getItem(LOCAL_DATA_KEY);
  cachedSpots = raw ? JSON.parse(raw) : [];
  return { spots: cachedSpots, needsSetup: false };
}

async function persist(spotsArray, message) {
  const cfg = getConfig();
  if (cfg.mode === "github") {
    const gh = ghFromConfig(cfg);
    const latest = await gh.getFile(SPOTS_PATH); // refetch right before writing to minimize clobbering concurrent edits
    const sha = latest ? latest.sha : undefined;
    const contentB64 = utf8ToB64(JSON.stringify(spotsArray, null, 2));
    await gh.putFile(SPOTS_PATH, contentB64, message, sha);
  } else {
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(spotsArray));
  }
  cachedSpots = spotsArray;
}

const branchCache = new Map(); // "owner/repo" -> resolved default branch name

async function resolveBranch(cfg) {
  if (cfg.branch) return cfg.branch;
  const key = `${cfg.owner}/${cfg.repo}`;
  if (branchCache.has(key)) return branchCache.get(key);
  try {
    const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`);
    if (res.ok) {
      const json = await res.json();
      if (json.default_branch) {
        branchCache.set(key, json.default_branch);
        return json.default_branch;
      }
    }
  } catch (_) {
    /* fall through to guess */
  }
  return "main"; // last-resort guess if the API call itself failed
}

async function uploadImages(files, spotId, onProgress) {
  const cfg = getConfig();
  const urls = [];
  const branch = cfg.mode === "github" ? await resolveBranch(cfg) : null;
  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i + 1, files.length);
    const blob = await compressImage(files[i]);
    if (cfg.mode === "github") {
      const gh = ghFromConfig(cfg);
      const b64 = await blobToRawBase64(blob);
      const filename = `images/${spotId}-${Date.now()}-${i}.jpg`;
      await gh.putFile(filename, b64, `Add photo for spot ${spotId}`);
      urls.push(`https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${branch}/${filename}`);
    } else {
      urls.push(await blobToDataUrl(blob));
    }
  }
  return urls;
}

/**
 * Create or update a spot.
 * @param {object} spotData - full spot object (id, name, description, lat, lng, tags, images[])
 * @param {File[]} newFiles - newly chosen image files to upload
 * @param {string[]} keepImageUrls - existing image URLs the user kept (others are treated as removed)
 */
export async function saveSpot(spotData, newFiles = [], keepImageUrls = null, onProgress) {
  const cfgCheck = getConfig();
  if (cfgCheck.mode === "github" && !isGithubConfigured(cfgCheck)) {
    throw new Error("Set the repo owner and name in Setup & sync first.");
  }
  const { spots } = await loadSpots();
  const existing = spots.find((s) => s.id === spotData.id);
  const kept = keepImageUrls ?? (existing ? existing.images : []);
  const uploaded = newFiles.length ? await uploadImages(newFiles, spotData.id, onProgress) : [];
  const finalSpot = {
    ...spotData,
    images: [...kept, ...uploaded],
    updatedAt: new Date().toISOString(),
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
  };
  const idx = spots.findIndex((s) => s.id === spotData.id);
  const next = idx >= 0 ? spots.map((s, i) => (i === idx ? finalSpot : s)) : [...spots, finalSpot];
  await persist(next, `${idx >= 0 ? "Update" : "Add"} spot: ${finalSpot.name}`);
  return finalSpot;
}

export async function deleteSpot(id) {
  const cfgCheck = getConfig();
  if (cfgCheck.mode === "github" && !isGithubConfigured(cfgCheck)) {
    throw new Error("Set the repo owner and name in Setup & sync first.");
  }
  const { spots } = await loadSpots();
  const spot = spots.find((s) => s.id === id);
  const remaining = spots.filter((s) => s.id !== id);
  await persist(remaining, `Delete spot: ${spot ? spot.name : id}`);

  const cfg = getConfig();
  if (cfg.mode === "github" && spot && spot.images && spot.images.length) {
    const gh = ghFromConfig(cfg);
    const marker = `/${cfg.branch}/`;
    for (const url of spot.images) {
      try {
        const idx = url.indexOf(marker);
        if (idx === -1) continue;
        const path = url.slice(idx + marker.length);
        const f = await gh.getFile(path);
        if (f) await gh.deleteFile(path, `Delete photo for spot ${spot.name}`, f.sha);
      } catch (_) {
        /* best effort only */
      }
    }
  }
  return remaining;
}

export function exportSpotsAsFile(spots) {
  const blob = new Blob([JSON.stringify(spots, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "spots.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importSpotsFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("File does not contain a list of spots.");
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export async function importAndPersist(file) {
  const parsed = await importSpotsFromFile(file);
  await persist(parsed, "Import spots.json");
  return parsed;
}
