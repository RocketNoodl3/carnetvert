/**
 * table.js — Tableau récapitulatif des bacs
 * ===========================================
 * Affiche tous les bacs avec les données de leur dernier relevé.
 * Tri par clic sur en-tête, filtre textuel global, colorisation des alertes.
 */

const TableModule = (() => {

  let _donnees    = [];    // Lignes fusionnées bac + dernier relevé
  let _sortCol    = null;  // Colonne de tri active
  let _sortAsc    = true;  // Direction du tri
  let _filtreTerm = "";    // Terme de recherche

  // Définition des colonnes du tableau
  const COLONNES = [
    { key: "nom",               label: "Site de compostage" },
    { key: "date",              label: "Date relevé",        format: formatDate },
    { key: "agent",             label: "Agent" },
    { key: "typeReleve",        label: "Type" },
    { key: "temperature",       label: "Temp. (°C)" },
    { key: "hauteurApport",     label: "Apport (%)" },
    { key: "hauteurBroyat",     label: "Broyat (%)" },
    { key: "hygrometrie",       label: "Hygrométrie" },
    { key: "qualiteApports",    label: "Qualité apports" },
    { key: "qualiteCompostage", label: "Note ★",             format: formatEtoiles },
    { key: "problemes",         label: "Problèmes",          format: v => parseJsonField(v).join(", ") || "—" },
    { key: "operations",        label: "Opérations",         format: v => parseJsonField(v).join(", ") || "—" },
  ];

  // ===========================================================================
  // Chargement
  // ===========================================================================

  async function load() {
    _setLoading(true);

    const [bacs, derniersReleves] = await Promise.all([
      apiFetchBacs(),
      apiGetDerniersReleves(),
    ]);

    // Fusion bac + dernier relevé en un objet ligne unique
    _donnees = bacs.map(bac => ({
      ...bac,
      ...(derniersReleves.get(bac.id) || {}),
      _bacId: bac.id,
      // On écrase l'id potentiellement ambigu avec celui du bac
      nom: bac.nom,
    }));

    _setLoading(false);
    _render();
  }

  function _setLoading(loading) {
    const tbody = document.getElementById("table-body");
    if (tbody && loading) {
      tbody.innerHTML = `<tr><td colspan="${COLONNES.length + 1}" class="table__loading">
        <span class="spinner"></span> Chargement…
      </td></tr>`;
    }
  }

  // ===========================================================================
  // Rendu
  // ===========================================================================

  function _render() {
    _renderHeader();
    _renderBody();
  }

  function _renderHeader() {
    const thead = document.getElementById("table-head");
    if (!thead) return;

    const ths = COLONNES.map(col => {
      const actif = _sortCol === col.key;
      const arrow = actif ? (_sortAsc ? " ↑" : " ↓") : "";
      return `<th class="table__th${actif ? " table__th--active" : ""}" data-col="${col.key}">
        ${col.label}${arrow}
      </th>`;
    });

    thead.innerHTML = `<tr><th class="table__th table__th--actions">Actions</th>${ths.join("")}</tr>`;

    thead.querySelectorAll("th[data-col]").forEach(th =>
      th.addEventListener("click", () => {
        _sortCol = th.dataset.col;
        _sortAsc = _sortCol === th.dataset.col ? !_sortAsc : true;
        _sortCol = th.dataset.col;
        _renderBody();
        _renderHeader();
      })
    );
  }

  function _renderBody() {
    const tbody = document.getElementById("table-body");
    if (!tbody) return;

    let lignes = [..._donnees];

    // Filtre textuel global
    if (_filtreTerm) {
      const term = _filtreTerm.toLowerCase();
      lignes = lignes.filter(row =>
        COLONNES.some(col => String(row[col.key] ?? "").toLowerCase().includes(term))
      );
    }

    // Tri
    if (_sortCol) {
      lignes.sort((a, b) => {
        const va = a[_sortCol] ?? "";
        const vb = b[_sortCol] ?? "";
        const cmp = String(va).localeCompare(String(vb), "fr", { numeric: true });
        return _sortAsc ? cmp : -cmp;
      });
    }

    if (!lignes.length) {
      tbody.innerHTML = `<tr><td colspan="${COLONNES.length + 1}" class="table__empty">Aucun résultat</td></tr>`;
      return;
    }

    tbody.innerHTML = lignes.map(_renderRow).join("");

    tbody.querySelectorAll("[data-action]").forEach(btn =>
      btn.addEventListener("click", _handleAction)
    );
  }

  function _renderRow(row) {
    const cells = COLONNES.map(col => {
      const rawVal = row[col.key];
      let   val    = rawVal != null && rawVal !== "" ? rawVal : "—";
      if (col.format && val !== "—") val = col.format(val);

      // Colorisation conditionnelle des alertes
      let cls = "table__td";
      if (col.key === "hauteurApport" && parseInt(row.hauteurApport) <= APP_CONFIG.SEUIL_APPORT_ALERTE) {
        cls += " table__td--alerte-apport";
      }
      if (col.key === "hauteurBroyat" && parseInt(row.hauteurBroyat) >= APP_CONFIG.SEUIL_BROYAT_ALERTE) {
        cls += " table__td--alerte-broyat";
      }

      return `<td class="${cls}">${val}</td>`;
    });

    const id = row._bacId;
    const actions = `<td class="table__td table__td--actions">
      <button class="table__action-btn" data-action="focus"  data-id="${id}" title="Voir sur la carte">📍</button>
      <button class="table__action-btn" data-action="releve" data-id="${id}" title="Nouveau relevé">📋</button>
      <button class="table__action-btn" data-action="edit"   data-id="${id}" title="Modifier le bac">✏️</button>
      <button class="table__action-btn table__action-btn--danger" data-action="delete" data-id="${id}" title="Supprimer">🗑️</button>
    </td>`;

    return `<tr class="table__row">${actions}${cells.join("")}</tr>`;
  }

  // ===========================================================================
  // Interactions
  // ===========================================================================

  function _handleAction(e) {
    const { action, id } = e.currentTarget.dataset;
    switch (action) {
      case "focus":  MapModule.focusBac(id);  break;
      case "releve": Forms.openReleveForm(id); break;
      case "edit":   Forms.openEditBacForm(id); break;
      case "delete": _confirmDelete(id);       break;
    }
  }

  async function _confirmDelete(id) {
    const bac = _donnees.find(d => d._bacId === id);
    if (!confirm(`Supprimer le bac "${bac?.nom}" ?\nTous ses relevés resteront dans le Sheet mais ne seront plus rattachés à ce bac.`)) return;
    try {
      await apiDeleteBac(id);
      showToast("Bac supprimé");
      await load();
      await MapModule.refresh();
    } catch (err) {
      showToast("Erreur : " + err.message, "error");
    }
  }

  // ===========================================================================
  // API publique
  // ===========================================================================

  /** Filtre le tableau selon un terme de recherche */
  function setFiltre(terme) {
    _filtreTerm = terme;
    _renderBody();
  }

  /** Recharge les données depuis le Sheet */
  async function refresh() {
    await load();
  }

  return { load, setFiltre, refresh };

})();
