/**
 * api.js — Couche d'accès aux données
 * =====================================
 * Chaque requête transmet le token Google ID de l'utilisateur connecté.
 * L'Apps Script valide ce token via l'API Google et vérifie la liste blanche.
 * Aucune clé secrète dans le code — la sécurité repose sur Google.
 */

// =============================================================================
// Cache local en mémoire
// =============================================================================

const _cache = {
  bacs:    null,
  releves: null,
  config:  null,
};

function invalidateCache() {
  _cache.bacs    = null;
  _cache.releves = null;
}

// =============================================================================
// Lectures
// =============================================================================

async function apiFetchBacs() {
  if (!_cache.bacs) _cache.bacs = await _get("getBacs");
  return _cache.bacs;
}

async function apiFetchReleves() {
  if (!_cache.releves) _cache.releves = await _get("getReleves");
  return _cache.releves;
}

async function apiFetchConfig() {
  if (!_cache.config) _cache.config = await _get("getConfig");
  return _cache.config;
}

/** Retourne une Map<bacId, dernierRelevé> triée par date décroissante */
async function apiGetDerniersReleves() {
  const releves = await apiFetchReleves();
  const map     = new Map();
  const tries   = [...releves].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const r of tries) {
    if (!map.has(r.bacId)) map.set(r.bacId, r);
  }
  return map;
}

// =============================================================================
// Écritures
// =============================================================================

async function apiAddBac(data)    { const r = await _post("addBac",    data);   invalidateCache(); return r; }
async function apiUpdateBac(data) { const r = await _post("updateBac", data);   invalidateCache(); return r; }
async function apiDeleteBac(id)   { const r = await _post("deleteBac", { id }); invalidateCache(); return r; }
async function apiAddReleve(data) { const r = await _post("addReleve", data);   invalidateCache(); return r; }

// =============================================================================
// Requêtes HTTP internes — token Google joint à chaque appel
// =============================================================================

async function _get(action) {
  // Le token Google ID est passé en paramètre URL.
  // Apps Script le valide via l'API Google avant tout traitement.
  const token = Auth.getToken();
  const url   = `${APP_CONFIG.APPS_SCRIPT_URL}?action=${action}&token=${encodeURIComponent(token)}&t=${Date.now()}`;

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Erreur réseau (${response.status})`);

  const json = await response.json();
  if (!json.success) throw new Error(json.error || "Erreur serveur");
  return json.data;
}

async function _post(action, payload) {
  // Le token Google ID est inclus dans le body JSON.
  const token    = Auth.getToken();
  const response = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
    method:   "POST",
    headers:  { "Content-Type": "text/plain" },  // text/plain évite le preflight CORS
    body:     JSON.stringify({ action, payload, token }),
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`Erreur réseau (${response.status})`);

  const json = await response.json();
  if (!json.success) throw new Error(json.error || "Erreur serveur");
  return json.data;
}
