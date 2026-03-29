/**
 * map.js — Carte interactive Leaflet
 * =====================================
 * Affiche les bacs sur OpenStreetMap avec marqueurs colorés selon les seuils.
 * Ouvre un popup au clic avec les données du dernier relevé.
 */

const MapModule = (() => {

  let _map     = null;   // Instance Leaflet
  let _markers = {};     // { bacId: marker }
  let _seuils  = {};     // Seuils chargés depuis config_seuils

  // ===========================================================================
  // Initialisation
  // ===========================================================================

  /** Crée la carte dans l'élément #map */
  function init() {
    _map = L.map("map", {
      center: APP_CONFIG.MAP_CENTER,
      zoom:   APP_CONFIG.MAP_ZOOM_DEFAULT,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_map);

    _addLegend();
  }

  /** Charge les bacs et leurs derniers relevés, puis affiche les marqueurs */
  async function loadBacs() {
    const [bacs, derniersReleves, config] = await Promise.all([
      apiFetchBacs(),
      apiGetDerniersReleves(),
      apiFetchConfig(),
    ]);

    // Lecture des seuils depuis le Sheet (priorité) ou config.js (défaut)
    if (config.seuils?.length) {
      const s  = config.seuils[0];
      _seuils = {
        apport: parseFloat(s.seuilApport) || APP_CONFIG.SEUIL_APPORT_ALERTE,
        broyat: parseFloat(s.seuilBroyat) || APP_CONFIG.SEUIL_BROYAT_ALERTE,
      };
    }

    // Supprime les anciens marqueurs
    Object.values(_markers).forEach(m => m.remove());
    _markers = {};

    bacs.forEach(bac => _addMarker(bac, derniersReleves.get(bac.id)));
  }

  // ===========================================================================
  // Marqueurs
  // ===========================================================================

  function _addMarker(bac, releve) {
    const lat = parseFloat(bac.lat);
    const lng = parseFloat(bac.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const color  = getMarkerColor(releve, _seuils);
    const marker = L.marker([lat, lng], { icon: _createIcon(color) }).addTo(_map);

    marker.bindPopup(_buildPopup(bac, releve), {
      maxWidth:  290,
      className: "compost-popup",
    });

    _markers[bac.id] = marker;
  }

  /** Crée une icône SVG de marqueur coloré */
  function _createIcon(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22S28 23.33 28 14C28 6.27 21.73 0 14 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="14" cy="14" r="5.5" fill="rgba(255,255,255,0.9)"/>
    </svg>`;

    return L.divIcon({
      html:        svg,
      className:   "",
      iconSize:    [28, 36],
      iconAnchor:  [14, 36],
      popupAnchor: [0, -38],
    });
  }

  /** Construit le HTML du popup d'un bac */
  function _buildPopup(bac, releve) {
    if (!releve) {
      return `<div class="popup">
        <h3 class="popup__title">${bac.nom}</h3>
        <p class="popup__empty">Aucun relevé enregistré</p>
        <button class="popup__btn" onclick="Forms.openReleveForm('${bac.id}')">+ Premier relevé</button>
      </div>`;
    }

    const problemes  = parseJsonField(releve.problemes);
    const operations = parseJsonField(releve.operations);

    return `<div class="popup">
      <h3 class="popup__title">${bac.nom}</h3>
      <p class="popup__date">Relevé du <strong>${formatDate(releve.date)}</strong> — ${releve.agent || "—"}</p>
      <div class="popup__grid">
        <span>🌡️ Température</span>  <strong>${releve.temperature ? releve.temperature + " °C" : "—"}</strong>
        <span>📦 Bac apport</span>   <strong>${releve.hauteurApport != null ? releve.hauteurApport + " %" : "—"}</strong>
        <span>🪵 Bac broyat</span>   <strong>${releve.hauteurBroyat != null ? releve.hauteurBroyat + " %" : "—"}</strong>
        <span>💧 Hygrométrie</span>  <strong>${releve.hygrometrie || "—"}</strong>
        <span>⭐ Qualité</span>      <strong>${formatEtoiles(releve.qualiteCompostage)}</strong>
      </div>
      ${problemes.length  ? `<p class="popup__tags popup__tags--danger">⚠️ ${problemes.join(", ")}</p>` : ""}
      ${operations.length ? `<p class="popup__tags">✅ ${operations.join(", ")}</p>` : ""}
      <div class="popup__actions">
        <button class="popup__btn"                onclick="Forms.openReleveForm('${bac.id}')">+ Relevé</button>
        <button class="popup__btn popup__btn--secondary" onclick="Forms.openEditBacForm('${bac.id}')">✏️ Modifier</button>
      </div>
    </div>`;
  }

  // ===========================================================================
  // Légende
  // ===========================================================================

  function _addLegend() {
    const legend = L.control({ position: "bottomleft" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "map-legend");
      div.innerHTML = [
        { color: APP_CONFIG.MARQUEUR_NORMAL,        label: "Normal"        },
        { color: APP_CONFIG.MARQUEUR_ALERTE_APPORT, label: "Apport faible" },
        { color: APP_CONFIG.MARQUEUR_ALERTE_BROYAT, label: "Broyat élevé"  },
      ].map(({ color, label }) =>
        `<div class="map-legend__item">
          <span class="map-legend__dot" style="background:${color}"></span>${label}
        </div>`
      ).join("");
      return div;
    };
    legend.addTo(_map);
  }

  // ===========================================================================
  // API publique
  // ===========================================================================

  /** Centre et zoom sur un bac, ouvre son popup */
  function focusBac(bacId) {
    const marker = _markers[bacId];
    if (!marker) return;
    _map.setView(marker.getLatLng(), 16);
    marker.openPopup();
  }

  /** Recharge tous les marqueurs (après écriture) */
  async function refresh() {
    await loadBacs();
  }

  return { init, loadBacs, focusBac, refresh };

})();
