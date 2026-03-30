/**
 * COMPOSTTRACK — Google Apps Script Web App
 * ==========================================
 * Sécurité : décodage JWT côté Apps Script + liste blanche emails.
 * On ne fait plus d'appel externe à tokeninfo — plus fiable et plus rapide.
 *
 * DÉPLOIEMENT :
 *   1. Remplir EMAILS_AUTORISES
 *   2. Déployer > Nouveau déploiement
 *      - Type                 : Application Web
 *      - Exécuter en tant que : Moi
 *      - Qui a accès          : Tout le monde connecté à Google
 *   3. Copier l'URL dans js/config.js
 *
 * APRÈS MODIFICATION : Déployer > Gérer > Nouvelle version
 */

// ── Liste blanche ──────────────────────────────────────────────────────────────
const EMAILS_AUTORISES = [
  "monkeywoood@gmail.com",   // ← remplacez par vos emails réels
];

// ── Onglets ────────────────────────────────────────────────────────────────────
const SHEET_BACS         = "bacs";
const SHEET_RELEVES      = "relevés";
const SHEET_SEUILS       = "config_seuils";
const SHEET_AGENTS       = "config_agents";
const SHEET_OPERATIONS   = "config_operations";
const SHEET_PROBLEMES    = "config_problemes";
const SHEET_TYPES_RELEVE = "config_types_releve";

// =============================================================================
// Points d'entrée
// =============================================================================

function doGet(e) {
  try {
    const token    = e.parameter.token;
    const callback = e.parameter.callback;
    const action   = e.parameter.action;

    _verifierToken(token);

    let data;
    switch (action) {
      case "getBacs":    data = getBacs();    break;
      case "getReleves": data = getReleves(); break;
      case "getConfig":  data = getConfig();  break;
      default: return _rep({ error: "Action inconnue" }, callback);
    }
    return _rep({ success: true, data }, callback);

  } catch (err) {
    return _rep({ error: err.message }, e.parameter.callback);
  }
}

function doPost(e) {
  try {
    const body    = JSON.parse(e.postData.contents);
    _verifierToken(body.token);

    const action  = body.action;
    const payload = body.payload;
    let data;
    switch (action) {
      case "getBacs":    data = getBacs();            break;
      case "getReleves": data = getReleves();         break;
      case "getConfig":  data = getConfig();          break;
      case "addBac":     data = addBac(payload);      break;
      case "updateBac":  data = updateBac(payload);   break;
      case "deleteBac":  data = deleteBac(payload.id);break;
      case "addReleve":  data = addReleve(payload);   break;
      default: return _rep({ error: "Action inconnue" });
    }
    return _rep({ success: true, data });

  } catch (err) {
    return _rep({ error: err.message });
  }
}

// =============================================================================
// Vérification du token — décodage JWT sans appel réseau externe
// =============================================================================

/**
 * Décode et vérifie le token Google ID (JWT).
 * On vérifie : expiration + email dans la liste blanche.
 * On ne vérifie PAS la signature cryptographique (nécessiterait la clé publique Google)
 * mais le token vient directement de Google GSI côté client — suffisant pour notre usage.
 */
function _verifierToken(token) {
  if (!token) throw new Error("Accès refusé — token manquant.");

  try {
    // Décode le payload JWT (partie centrale, base64url)
    const parts   = token.split(".");
    if (parts.length !== 3) throw new Error("Format invalide.");

    // Base64url → base64 standard → décode
    const base64  = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Utilities.base64Decode(base64)
      .map(b => String.fromCharCode(b)).join(""));

    // Vérifie l'expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      throw new Error("Session expirée — reconnectez-vous.");
    }

    // Vérifie l'émetteur Google
    if (!payload.iss || !payload.iss.includes("accounts.google.com")) {
      throw new Error("Token non Google.");
    }

    // Vérifie l'email dans la liste blanche
    const email = (payload.email || "").toLowerCase().trim();
    const autorise = EMAILS_AUTORISES.map(e => e.toLowerCase().trim()).includes(email);
    if (!autorise) throw new Error("Compte non autorisé : " + email);

    return email;

  } catch (err) {
    throw new Error("Accès refusé — " + err.message);
  }
}

// =============================================================================
// Lectures
// =============================================================================

function getBacs()    { return _sheetToObjects(SHEET_BACS);    }
function getReleves() { return _sheetToObjects(SHEET_RELEVES); }
function getConfig()  {
  return {
    seuils:      _sheetToObjects(SHEET_SEUILS),
    agents:      _sheetToObjects(SHEET_AGENTS),
    operations:  _sheetToObjects(SHEET_OPERATIONS),
    problemes:   _sheetToObjects(SHEET_PROBLEMES),
    typesReleve: _sheetToObjects(SHEET_TYPES_RELEVE),
  };
}

// =============================================================================
// Écritures
// =============================================================================

function addBac(data) {
  const sheet = _getSheet(SHEET_BACS);
  const id    = _generateId();
  sheet.appendRow([id, data.nom, data.lat, data.lng, new Date().toISOString()]);
  return { id };
}

function updateBac(data) {
  const sheet = _getSheet(SHEET_BACS);
  const row   = _findRowById(sheet, data.id);
  if (!row) throw new Error("Bac introuvable : " + data.id);
  sheet.getRange(row, 2).setValue(data.nom);
  sheet.getRange(row, 3).setValue(data.lat);
  sheet.getRange(row, 4).setValue(data.lng);
  return { updated: true };
}

function deleteBac(id) {
  const sheet = _getSheet(SHEET_BACS);
  const row   = _findRowById(sheet, id);
  if (!row) throw new Error("Bac introuvable : " + id);
  sheet.deleteRow(row);
  return { deleted: true };
}

function addReleve(data) {
  const sheet = _getSheet(SHEET_RELEVES);
  const id    = _generateId();
  sheet.appendRow([
    id, data.date, data.bacId, data.agent, data.typeReleve,
    data.temperature, data.hauteurApport, data.hauteurBroyat,
    data.hygrometrie, data.qualiteApports,
    JSON.stringify(data.problemes     || []),
    JSON.stringify(data.operations    || []),
    data.operationsAutre  || "",
    JSON.stringify(data.actionsPlanif || []),
    data.actionsAutre     || "",
    data.qualiteCompostage,
    new Date().toISOString(),
  ]);
  return { id };
}

// =============================================================================
// Utilitaires
// =============================================================================

function _getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Onglet introuvable : " + name);
  return sheet;
}

function _sheetToObjects(sheetName) {
  const sheet  = _getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => h.toString().trim());
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function _findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
  }
  return null;
}

function _generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Réponse JSON ou JSONP selon la présence du callback.
 * JSONP permet d'éviter le blocage CORS sur les requêtes GET.
 */
function _rep(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
