/**
 * api.js — Couche d'accès aux données
 * =====================================
 * Utilise fetch POST avec Content-Type omis (text/plain par défaut).
 * Ce type "simple" ne déclenche pas de preflight CORS.
 * Apps Script reçoit le body et répond directement.
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

async function apiAddBac(data)    { const r = await _call("addBac",    data);   invalidateCache(); return r; }
async function apiUpdateBac(data) { const r = await _call("updateBac", data);   invalidateCache(); return r; }
async function apiDeleteBac(id)   { const r = await _call("deleteBac", { id }); invalidateCache(); return r; }
async function apiAddReleve(data) { const r = await _call("addReleve", data);   invalidateCache(); return r; }

async function _call(action, payload = {}) {
  const token    = Auth.getToken();

  const response = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
    method:      "POST",
    credentials: "omit",
    redirect:    "follow",
    body:        JSON.stringify({ action, payload, token }),
    // Volontairement PAS de header Content-Type
    // → le navigateur envoie "text/plain" qui est une requête "simple"
    // → pas de preflight OPTIONS → pas de blocage CORS
  });

  const text = await response.text();

  // Extrait le premier objet JSON valide de la réponse
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Réponse invalide — redéployez Apps Script en Nouvelle version.");

  const json = JSON.parse(match[0]);
  if (!json.success) throw new Error(json.error || "Erreur serveur");
  return json.data;
}
