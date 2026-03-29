/**
 * export.js — Export Excel des relevés
 * ======================================
 * Génère un fichier .xlsx téléchargeable directement dans le navigateur.
 * Utilise la librairie SheetJS (xlsx) chargée depuis CDN.
 *
 * Données exportées (toutes colonnes) :
 *   - Informations du bac : nom, latitude, longitude
 *   - Toutes les colonnes du relevé
 *   - Problèmes et opérations sous forme de texte lisible
 *   - Note qualité en chiffre (1-5)
 *
 * Filtres disponibles :
 *   - Date début / Date fin
 *   - Sélection de sites de compostage
 */

const ExportModule = (() => {

  // ===========================================================================
  // Ouverture de la modale d'export
  // ===========================================================================

  /** Ouvre la modale d'export et pré-remplit la liste des sites */
  async function openExportModal() {
    try {
      const bacs = await apiFetchBacs();
      _fillSiteSelector(bacs);

      // Dates par défaut : 1 an glissant
      const today     = new Date();
      const lastYear  = new Date(today);
      lastYear.setFullYear(lastYear.getFullYear() - 1);

      const elDebut = document.getElementById("export-date-debut");
      const elFin   = document.getElementById("export-date-fin");
      if (elDebut) elDebut.value = lastYear.toISOString().split("T")[0];
      if (elFin)   elFin.value   = today.toISOString().split("T")[0];

      openModal("modal-export");
    } catch (err) {
      showToast("Erreur : " + err.message, "error");
    }
  }

  /** Remplit la liste des checkboxes de sites dans la modale d'export */
  function _fillSiteSelector(bacs) {
    const container = document.getElementById("export-sites");
    if (!container) return;
    container.innerHTML = bacs.map(bac => `
      <label class="checkbox-label">
        <input type="checkbox" name="export-site" value="${bac.id}" checked>
        <span>${bac.nom}</span>
      </label>`).join("");
  }

  // ===========================================================================
  // Génération et téléchargement du fichier Excel
  // ===========================================================================

  /** Déclenche l'export après validation des filtres */
  async function runExport() {
    const btn = document.getElementById("btn-export-go");
    setButtonLoading(btn, true);

    try {
      // ── Lecture des filtres ────────────────────────────────────────────────
      const dateDebut   = document.getElementById("export-date-debut")?.value || "";
      const dateFin     = document.getElementById("export-date-fin")?.value   || "";
      const sitesCochés = [...document.querySelectorAll("input[name='export-site']:checked")]
                            .map(cb => cb.value);

      if (!sitesCochés.length) {
        showToast("Sélectionnez au moins un site", "error");
        return;
      }

      // ── Chargement des données ─────────────────────────────────────────────
      const [bacs, releves] = await Promise.all([apiFetchBacs(), apiFetchReleves()]);

      // Map pour accès rapide aux infos du bac par ID
      const bacsMap = new Map(bacs.map(b => [b.id, b]));

      // ── Filtrage des relevés ───────────────────────────────────────────────
      const releves_filtres = releves.filter(r => {
        const date = r.date || "";
        if (dateDebut && date < dateDebut) return false;
        if (dateFin   && date > dateFin)   return false;
        if (!sitesCochés.includes(r.bacId))  return false;
        return true;
      });

      if (!releves_filtres.length) {
        showToast("Aucun relevé pour cette sélection", "error");
        return;
      }

      // ── Construction des données tabulaires ───────────────────────────────
      const lignes = releves_filtres.map(r => {
        const bac = bacsMap.get(r.bacId) || {};
        return _buildRow(r, bac);
      });

      // ── Tri par date puis par site ─────────────────────────────────────────
      lignes.sort((a, b) => {
        const dateCmp = String(a["Date"]).localeCompare(String(b["Date"]));
        return dateCmp !== 0 ? dateCmp : String(a["Site"]).localeCompare(String(b["Site"]));
      });

      // ── Création du classeur Excel ─────────────────────────────────────────
      _generateXlsx(lignes, dateDebut, dateFin);
      showToast(`${lignes.length} relevé(s) exporté(s) ✓`);
      closeModal("modal-export");

    } catch (err) {
      showToast("Erreur export : " + err.message, "error");
      console.error(err);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  /**
   * Construit un objet ligne pour le tableur à partir d'un relevé et de son bac.
   * L'ordre des clés définit l'ordre des colonnes dans Excel.
   */
  function _buildRow(r, bac) {
    return {
      // ── Informations du bac ──────────────────────────────────────────────
      "Site":               bac.nom  || "—",
      "Latitude":           bac.lat  || "",
      "Longitude":          bac.lng  || "",

      // ── Informations du relevé ───────────────────────────────────────────
      "Date":               r.date         || "",
      "Agent":              r.agent        || "",
      "Type de relevé":     r.typeReleve   || "",
      "Température (°C)":   _num(r.temperature),
      "Hauteur apport (%)": _num(r.hauteurApport),
      "Hauteur broyat (%)": _num(r.hauteurBroyat),
      "Hygrométrie":        r.hygrometrie  || "",
      "Qualité des apports":r.qualiteApports || "",

      // ── Problèmes et opérations (texte lisible) ───────────────────────────
      "Problèmes constatés":    parseJsonField(r.problemes).join(", ")  || "",
      "Opérations réalisées":   parseJsonField(r.operations).join(", ") || "",
      "Opérations — précision": r.operationsAutre || "",
      "Actions à planifier":    parseJsonField(r.actionsPlanif).join(", ") || "",
      "Actions — précision":    r.actionsAutre || "",

      // ── Note qualité en chiffre ───────────────────────────────────────────
      "Note qualité (1-5)":     _num(r.qualiteCompostage),

      // ── Métadonnées ───────────────────────────────────────────────────────
      "ID relevé":          r.id    || "",
      "ID bac":             r.bacId || "",
      "Enregistré le":      r.createdAt ? r.createdAt.split("T")[0] : "",
    };
  }

  /**
   * Génère le fichier .xlsx et déclenche le téléchargement.
   * @param {Object[]} lignes     - Tableau de lignes (objets clé:valeur)
   * @param {string}   dateDebut
   * @param {string}   dateFin
   */
  function _generateXlsx(lignes, dateDebut, dateFin) {
    // Vérifie que SheetJS est chargé
    if (typeof XLSX === "undefined") {
      throw new Error("La librairie Excel (SheetJS) n'est pas chargée.");
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(lignes);

    // ── Largeurs de colonnes adaptées au contenu ───────────────────────────
    ws["!cols"] = [
      { wch: 28 },  // Site
      { wch: 12 },  // Latitude
      { wch: 12 },  // Longitude
      { wch: 12 },  // Date
      { wch: 18 },  // Agent
      { wch: 22 },  // Type de relevé
      { wch: 14 },  // Température
      { wch: 14 },  // Apport
      { wch: 14 },  // Broyat
      { wch: 14 },  // Hygrométrie
      { wch: 18 },  // Qualité apports
      { wch: 35 },  // Problèmes
      { wch: 35 },  // Opérations
      { wch: 25 },  // Opérations autre
      { wch: 35 },  // Actions planif
      { wch: 25 },  // Actions autre
      { wch: 14 },  // Note
      { wch: 18 },  // ID relevé
      { wch: 18 },  // ID bac
      { wch: 14 },  // Enregistré le
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Relevés");

    // ── Onglet de synthèse (métadonnées de l'export) ───────────────────────
    const meta = [
      { "Paramètre": "Date de l'export",    "Valeur": new Date().toLocaleDateString("fr-FR") },
      { "Paramètre": "Période du",          "Valeur": dateDebut || "début" },
      { "Paramètre": "Période au",          "Valeur": dateFin   || "aujourd'hui" },
      { "Paramètre": "Nombre de relevés",   "Valeur": lignes.length },
    ];
    const wsMeta = XLSX.utils.json_to_sheet(meta);
    wsMeta["!cols"] = [{ wch: 22 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsMeta, "Informations export");

    // ── Nom du fichier avec la période ────────────────────────────────────
    const suffix = dateDebut && dateFin
      ? `_${dateDebut}_${dateFin}`
      : `_${new Date().toISOString().split("T")[0]}`;
    const filename = `composttrack_releves${suffix}.xlsx`;

    XLSX.writeFile(wb, filename);
  }

  // ===========================================================================
  // Utilitaires
  // ===========================================================================

  /** Convertit en nombre ou retourne une chaîne vide (évite les "null" dans Excel) */
  function _num(val) {
    const n = parseFloat(val);
    return isNaN(n) ? "" : n;
  }

  return { openExportModal, runExport };

})();
