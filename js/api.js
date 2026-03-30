/**
 * api.js — Couche d'accès aux données
 * =====================================
 * Apps Script est déployé en accès anonyme pour éviter les redirections CORS.
 * La sécurité est assurée par la vérification du token JWT Google dans Code.gs.
 * Sans token valide d'un email autorisé → "Accès refusé".
 */

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

async function apiFetchBacs()    { if (!_cache.bacs)    _cache.bacs    = await _call("getBacs");    return _cache.bacs;    }
async function apiFetchReleves() { if (!_cache.releves) _cache.releves = await _call("getReleves"); return _cache.releves; }
async function apiFetchConfig()  { if (!_cache.config)  _cache.config  = await _call("getConfig");  return _cache.config;  }

async function apiGetDerniersReleves() {
  const releves = await apiFetchReleves();
  const map     = new Map();
  [...releves].sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach(r => { if (!map.has(r.bacId)) map.set(r.bacId, r); });
  return map;
}

// =============================================================================
// Écritures
// =============================================================================

async function apiAddBac(data)    { const r = await _call("addBac",    data);   invalidateCache(); return r; }
async function apiUpdateBac(data) { const r = await _call("updateBac", data);   invalidateCache(); return r; }
async function apiDeleteBac(id)   { const r = await _call("deleteBac", { id }); invalidateCache(); return r; }
async function apiAddReleve(data) { const r = await _call("addReleve", data);   invalidateCache(); return r; }

// =============================================================================
// Requête POST — Content-Type: text/plain pour éviter le preflight CORS
// Apps Script en accès anonyme répond directement sans redirection
// =============================================================================

async function _call(action, payload = {}) {
  const token = Auth.getToken();

  const response = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
    method:  "POST",
    headers: { "Content-Type": "text/plain" },
    body:    JSON.stringify({ action, payload, token }),
  });

  if (!response.ok) throw new Error(`Erreur réseau (${response.status})`);

  const json = await response.json();
  if (!json.success) throw new Error(json.error || "Erreur serveur");
  return json.data;
}
