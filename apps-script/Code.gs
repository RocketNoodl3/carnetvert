/**
 * COMPOSTTRACK — Google Apps Script Web App
 * ==========================================
 * Sécurité : token Google ID vérifié + liste blanche d'emails.
 *
 * DÉPLOIEMENT :
 *   1. Extensions > Apps Script > coller ce code
 *   2. Remplissez EMAILS_AUTORISES avec les emails de vos agents
 *   3. Déployer > Nouveau déploiement
 *      - Type                 : Application Web
 *      - Exécuter en tant que : Moi
 *      - Qui a accès          : Tout le monde connecté à Google
 *   4. Copier l'URL dans js/config.js → APPS_SCRIPT_URL
 *
 * AJOUTER / RÉVOQUER UN AGENT :
 *   Modifiez EMAILS_AUTORISES puis : Déployer > Gérer les déploiements
 *   > sélectionner > Nouvelle version.
 */

// ── Liste blanche des emails autorisés ────────────────────────────────────────
// Ajoutez ou retirez des emails pour gérer les accès.
const EMAILS_AUTORISES = [
  "agent1@gmail.com",
  "agent2@gmail.com",
  // Ajoutez autant d'emails que nécessaire
];

// ── Noms des onglets ───────────────────────────────────────────────────────────
const SHEET_BACS         = "bacs";
const SHEET_RELEVES      = "relevés";
const SHEET_SEUILS       = "config_seuils";
const SHEET_AGENTS       = "config_agents";
const SHEET_OPERATIONS   = "config_operations";
const SHEET_PROBLEMES    = "config_problemes";
const SHEET_TYPES_RELEVE = "config_types_releve";

// =============================================================================
// Points d'entrée HTTP
// =============================================================================

function doGet(e) {
  try {
    // Vérification du token et de l'email avant tout traitement
    const email = _verifierToken(e.parameter.token);

    const action = e.parameter.action;
    let data;
    switch (action) {
      case "getBacs":    data = getBacs();    break;
      case "getReleves": data = getReleves(); break;
      case "getConfig":  data = getConfig();  break;
      default: return _response({ error: "Action inconnue : " + action });
    }
    return _response({ success: true, data, email });

  } catch (err) {
    return _response({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // Vérification du token et de l'email avant tout traitement
    const email = _verifierToken(body.token);

    const action  = body.action;
    const payload = body.payload;
    let data;
    switch (action) {
      case "addBac":    data = addBac(payload);       break;
      case "updateBac": data = updateBac(payload);    break;
      case "deleteBac": data = deleteBac(payload.id); break;
      case "addReleve": data = addReleve(payload);    break;
      default: return _response({ error: "Action inconnue : " + action });
    }
    return _response({ success: true, data });

  } catch (err) {
    return _response({ error: err.message });
  }
}

// =============================================================================
// Vérification de sécurité
// =============================================================================

/**
 * Vérifie le token Google ID et contrôle que l'email est dans la liste blanche.
 *
 * Google ID tokens sont des JWT signés par Google.
 * On utilise l'API OAuth2 de Google Apps Script pour les valider —
 * impossible à falsifier sans accès aux serveurs Google.
 *
 * @param  {string} token - Token Google ID envoyé par le navigateur
 * @returns {string}      - Email de l'utilisateur si autorisé
 * @throws  {Error}       - Si token invalide ou email non autorisé
 */
function _verifierToken(token) {
  if (!token) throw new Error("Accès refusé — token manquant.");

  // Validation du token via l'API Google (vérifie signature + expiration)
  let payload;
  try {
    // Décode le JWT Google ID Token (header.payload.signature)
    // et vérifie sa validité via tokeninfo endpoint de Google
    const response = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + token,
      { muteHttpExceptions: true }
    );

    if (response.getResponseCode() !== 200) {
      throw new Error("Token invalide.");
    }

    payload = JSON.parse(response.getContentText());
  } catch (err) {
    throw new Error("Accès refusé — token non vérifiable.");
  }

  // Vérification que le token n'est pas expiré
  if (payload.exp && Date.now() / 1000 > parseInt(payload.exp)) {
    throw new Error("Accès refusé — session expirée.");
  }

  const email = (payload.email || "").toLowerCase();

  // Vérification dans la liste blanche (insensible à la casse)
  const autorise = EMAILS_AUTORISES
    .map(e => e.toLowerCase())
    .includes(email);

  if (!autorise) {
    throw new Error(`Accès refusé — compte non autorisé (${email}).`);
  }

  return email;
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
// Utilitaires internes
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

function _response(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
