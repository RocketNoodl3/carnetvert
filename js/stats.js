/**
 * stats.js — Page Statistiques
 * ==============================
 * 5 graphiques Chart.js + 6 KPI globaux.
 * Filtres : période (semaine/mois/année) + sélection des sites.
 *
 * Graphiques :
 *   1. Taux de remplissage apport + broyat par période → courbes (pleine largeur)
 *   2. Température moyenne par période → courbes avec aire
 *   3. Note de qualité moyenne par site → barres
 *   4. Fréquence des problèmes constatés → donut
 *   5. Nombre de relevés par période → barres (activité)
 */

const StatsModule = (() => {

  const _charts  = {};   // Instances Chart.js actives

  // Palette de couleurs pour les sites (une couleur par site)
  const PALETTE = [
    "#2d6a4f", "#52b788", "#e07b39", "#3a7abf",
    "#b5838d", "#e9c46a", "#264653", "#a8dadc",
  ];

  // ===========================================================================
  // Initialisation
  // ===========================================================================

  async function init() {
    const [bacs, releves] = await Promise.all([apiFetchBacs(), apiFetchReleves()]);

    _buildSiteSelector(bacs);
    _fillKpis(bacs, releves);

    // Réagit aux changements de filtres
    document.getElementById("stats-periode")
      ?.addEventListener("change", () => _render(bacs, releves));
    document.getElementById("stats-sites")
      ?.addEventListener("change", () => _render(bacs, releves));

    _render(bacs, releves);
  }

  // ===========================================================================
  // Sélecteur de sites
  // ===========================================================================

  function _buildSiteSelector(bacs) {
    const container = document.getElementById("stats-sites");
    if (!container) return;
    container.innerHTML = "";

    bacs.forEach((bac, i) => {
      const label = document.createElement("label");
      label.className = "stats-site-label";
      label.innerHTML = `
        <input type="checkbox" value="${bac.id}" checked>
        <span class="stats-site-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
        ${bac.nom}`;
      container.appendChild(label);
    });
  }

  function _getSelectedIds() {
    return [...document.querySelectorAll("#stats-sites input:checked")].map(cb => cb.value);
  }

  function _getPeriode() {
    return document.getElementById("stats-periode")?.value || "mois";
  }

  // ===========================================================================
  // KPI globaux
  // ===========================================================================

  function _fillKpis(bacs, releves) {
    const set  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? "—"; };
    const moy  = field => {
      const vals = releves.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
      return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : "—";
    };

    set("kpi-total-bacs",    bacs.length);
    set("kpi-total-releves", releves.length);
    set("kpi-moy-apport",    moy("hauteurApport") + (moy("hauteurApport") !== "—" ? " %" : ""));
    set("kpi-moy-broyat",    moy("hauteurBroyat") + (moy("hauteurBroyat") !== "—" ? " %" : ""));
    set("kpi-moy-temp",      moy("temperature")   + (moy("temperature")   !== "—" ? " °C" : ""));
    set("kpi-moy-qualite",   moy("qualiteCompostage") + (moy("qualiteCompostage") !== "—" ? " / 5" : ""));
  }

  // ===========================================================================
  // Rendu des graphiques
  // ===========================================================================

  function _render(bacs, releves) {
    const periode      = _getPeriode();
    const selectedIds  = _getSelectedIds();
    const bacsFiltres  = bacs.filter(b => selectedIds.includes(b.id));

    // Détruit les anciens graphiques avant de les recréer
    Object.values(_charts).forEach(c => c?.destroy());

    _chartRemplissage(bacsFiltres, releves, periode);
    _chartTemperature(bacsFiltres, releves, periode);
    _chartQualite(bacsFiltres, releves);
    _chartProblemes(releves, selectedIds);
    _chartActivite(releves, selectedIds, periode);
  }

  // ── Graphique 1 : Taux de remplissage ─────────────────────────────────────

  function _chartRemplissage(bacs, releves, periode) {
    const ctx = _ctx("chart-remplissage");
    if (!ctx) return;

    const labels   = _allLabels(releves, periode);
    const datasets = [];

    bacs.forEach((bac, i) => {
      const color   = PALETTE[i % PALETTE.length];
      const relevesBac = releves.filter(r => r.bacId === bac.id);
      const groupes = grouperRelevesPar(relevesBac, periode);

      // Courbe apport (trait plein)
      datasets.push({
        label:           `${bac.nom} — Apport`,
        data:            labels.map(l => _moyGroupe(groupes[l], "hauteurApport")),
        borderColor:     color,
        backgroundColor: color + "18",
        tension: 0.3, fill: false, spanGaps: true,
      });

      // Courbe broyat (pointillé)
      datasets.push({
        label:           `${bac.nom} — Broyat`,
        data:            labels.map(l => _moyGroupe(groupes[l], "hauteurBroyat")),
        borderColor:     color,
        borderDash:      [6, 3],
        backgroundColor: "transparent",
        tension: 0.3, fill: false, spanGaps: true,
      });
    });

    _charts.remplissage = new Chart(ctx, {
      type: "line",
      data: { labels: _formatLabels(labels, periode), datasets },
      options: _optsLine("Taux de remplissage (%)", 0, 100),
    });
  }

  // ── Graphique 2 : Température ──────────────────────────────────────────────

  function _chartTemperature(bacs, releves, periode) {
    const ctx = _ctx("chart-temperature");
    if (!ctx) return;

    const labels   = _allLabels(releves, periode);
    const datasets = bacs.map((bac, i) => {
      const color      = PALETTE[i % PALETTE.length];
      const relevesBac = releves.filter(r => r.bacId === bac.id);
      const groupes    = grouperRelevesPar(relevesBac, periode);
      return {
        label:           bac.nom,
        data:            labels.map(l => _moyGroupe(groupes[l], "temperature")),
        borderColor:     color,
        backgroundColor: color + "28",
        tension: 0.3, fill: true, spanGaps: true,
      };
    });

    _charts.temperature = new Chart(ctx, {
      type: "line",
      data: { labels: _formatLabels(labels, periode), datasets },
      options: _optsLine("Température (°C)"),
    });
  }

  // ── Graphique 3 : Note qualité par site ────────────────────────────────────

  function _chartQualite(bacs, releves) {
    const ctx = _ctx("chart-qualite");
    if (!ctx) return;

    _charts.qualite = new Chart(ctx, {
      type: "bar",
      data: {
        labels: bacs.map(b => b.nom),
        datasets: [{
          label:           "Note moyenne / 5",
          data:            bacs.map(bac => {
            const notes = releves.filter(r => r.bacId === bac.id)
              .map(r => parseFloat(r.qualiteCompostage)).filter(v => !isNaN(v));
            return notes.length ? +(moyenne(notes).toFixed(2)) : null;
          }),
          backgroundColor: bacs.map((_, i) => PALETTE[i % PALETTE.length] + "bb"),
          borderColor:     bacs.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth: 2, borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        scales:  { y: { min: 0, max: 5, ticks: { stepSize: 1 } } },
        plugins: {
          legend: { display: false },
          title:  { display: true, text: "Note de qualité moyenne par site" },
        },
      },
    });
  }

  // ── Graphique 4 : Fréquence des problèmes ─────────────────────────────────

  function _chartProblemes(releves, selectedIds) {
    const ctx = _ctx("chart-problemes");
    if (!ctx) return;

    const compteur = {};
    releves
      .filter(r => selectedIds.includes(r.bacId))
      .forEach(r => parseJsonField(r.problemes).forEach(p => {
        compteur[p] = (compteur[p] || 0) + 1;
      }));

    const labels = Object.keys(compteur);
    const data   = Object.values(compteur);

    if (!labels.length) {
      // Aucun problème enregistré
      const wrapper = document.getElementById("chart-problemes")?.parentElement;
      if (wrapper) wrapper.innerHTML += `<p style="text-align:center;color:#aaa;font-size:.85rem;margin-top:.5rem">Aucun problème enregistré</p>`;
      return;
    }

    _charts.problemes = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: PALETTE.slice(0, labels.length).map(c => c + "cc"),
          borderColor:     PALETTE.slice(0, labels.length),
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          title:  { display: true, text: "Fréquence des problèmes constatés" },
          legend: { position: "bottom" },
        },
      },
    });
  }

  // ── Graphique 5 : Activité (nombre de relevés) ────────────────────────────

  function _chartActivite(releves, selectedIds, periode) {
    const ctx = _ctx("chart-activite");
    if (!ctx) return;

    const filtres = releves.filter(r => selectedIds.includes(r.bacId));
    const groupes = grouperRelevesPar(filtres, periode);
    const labels  = _allLabels(releves, periode);

    _charts.activite = new Chart(ctx, {
      type: "bar",
      data: {
        labels: _formatLabels(labels, periode),
        datasets: [{
          label:           "Nombre de relevés",
          data:            labels.map(l => (groupes[l] || []).length),
          backgroundColor: "#52b78888",
          borderColor:     "#2d6a4f",
          borderWidth: 2, borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        scales:  { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        plugins: {
          legend: { display: false },
          title:  { display: true, text: "Activité — nombre de relevés" },
        },
      },
    });
  }

  // ===========================================================================
  // Utilitaires internes
  // ===========================================================================

  function _optsLine(yLabel, min, max) {
    return {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: {
          beginAtZero: true,
          ...(min !== undefined && { min }),
          ...(max !== undefined && { max }),
          title: { display: true, text: yLabel },
        },
      },
      plugins: { legend: { position: "bottom" } },
    };
  }

  /** Retourne toutes les clés de période triées couvrant l'ensemble des relevés */
  function _allLabels(releves, periode) {
    const cles = releves.map(r => {
      const d = new Date(r.date);
      if (isNaN(d)) return null;
      if (periode === "semaine") {
        const s = _semaine(d);
        return `${d.getFullYear()}-S${String(s).padStart(2,"0")}`;
      }
      if (periode === "mois") return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      return `${d.getFullYear()}`;
    }).filter(Boolean);
    return [...new Set(cles)].sort();
  }

  function _semaine(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const debut = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - debut) / 86400000) + 1) / 7);
  }

  /** Reformate les clés internes en libellés lisibles pour l'axe X */
  function _formatLabels(labels, periode) {
    if (periode !== "mois") return labels;
    return labels.map(l => {
      const [y, m] = l.split("-");
      return new Date(+y, +m - 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    });
  }

  /** Calcule la moyenne d'un champ sur un groupe de relevés, arrondie à 1 décimale */
  function _moyGroupe(groupe, field) {
    if (!groupe?.length) return null;
    const m = moyenne(groupe.map(r => r[field]));
    return m !== null ? Math.round(m * 10) / 10 : null;
  }

  /** Récupère le contexte 2D d'un canvas */
  function _ctx(id) {
    return document.getElementById(id)?.getContext("2d") || null;
  }

  return { init };

})();
