/**
 * auth.js — Authentification Google Identity Services (GSI)
 * ===========================================================
 * Gère la connexion Google et expose le token ID utilisé par api.js
 * pour sécuriser chaque appel vers l'Apps Script.
 *
 * Fonctionnement :
 *   1. L'agent clique "Se connecter avec Google"
 *   2. Google vérifie ses identifiants et retourne un token JWT signé
 *   3. Ce token est joint à chaque requête Apps Script
 *   4. Apps Script valide le token via l'API Google et vérifie l'email
 */

const Auth = (() => {

  let _token    = null;   // Token Google ID courant (JWT)
  let _userInfo = null;   // { name, email, picture }

  // Callbacks appelés une fois la connexion établie
  const _onLoginCallbacks = [];

  // ===========================================================================
  // Initialisation
  // ===========================================================================

  /**
   * Initialise Google Identity Services.
   * Appeler au chargement de chaque page.
   */
  function init() {
    google.accounts.id.initialize({
      client_id:   APP_CONFIG.GOOGLE_CLIENT_ID,
      callback:    _handleCredentialResponse,
      auto_select: true,    // Reconnexion automatique si session active
    });

    // Rendu du bouton de connexion dans #google-signin-btn si présent
    const btnEl = document.getElementById("google-signin-btn");
    if (btnEl) {
      google.accounts.id.renderButton(btnEl, {
        theme:  "outline",
        size:   "large",
        text:   "signin_with",
        locale: "fr",
        shape:  "rectangular",
      });
    }

    // Affiche le One Tap si l'utilisateur n'est pas encore connecté
    google.accounts.id.prompt();
  }

  /**
   * Appelé par Google après une connexion réussie.
   * Le credential est un JWT Google ID Token signé.
   */
  function _handleCredentialResponse(response) {
    _token = response.credential;

    // Décode le payload JWT (base64url) pour récupérer nom/email/photo
    // Note : la signature est vérifiée côté Apps Script, pas ici
    try {
      const payload = JSON.parse(atob(_token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
      _userInfo = {
        name:    payload.name    || payload.email,
        email:   payload.email   || "",
        picture: payload.picture || "",
      };
    } catch {
      _userInfo = { name: "Agent", email: "", picture: "" };
    }

    _updateUI(true);

    // Déclenche tous les callbacks enregistrés (chargement de l'app)
    _onLoginCallbacks.forEach(cb => cb(_userInfo));
  }

  // ===========================================================================
  // API publique
  // ===========================================================================

  /**
   * Retourne le token JWT courant.
   * Utilisé par api.js pour sécuriser chaque requête.
   * @throws {Error} si non connecté
   */
  function getToken() {
    if (!_token) throw new Error("Non connecté — veuillez vous identifier.");
    return _token;
  }

  /** Retourne true si l'utilisateur est connecté */
  function isLoggedIn() { return !!_token; }

  /** Retourne { name, email, picture } de l'utilisateur connecté */
  function getUserInfo() { return _userInfo; }

  /**
   * Enregistre un callback à appeler après connexion réussie.
   * Si déjà connecté, l'appelle immédiatement.
   */
  function onLogin(callback) {
    _onLoginCallbacks.push(callback);
    if (_userInfo) callback(_userInfo);
  }

  /** Déconnexion et rechargement de la page */
  function logout() {
    google.accounts.id.disableAutoSelect();
    _token    = null;
    _userInfo = null;
    _updateUI(false);
    window.location.reload();
  }

  // ===========================================================================
  // Mise à jour de l'interface
  // ===========================================================================

  function _updateUI(loggedIn) {
    const loginSection  = document.getElementById("auth-login");
    const userSection   = document.getElementById("auth-user");
    const appContent    = document.getElementById("app-content");

    if (loginSection) loginSection.style.display = loggedIn ? "none"  : "flex";
    if (userSection)  userSection.style.display  = loggedIn ? "flex"  : "none";
    if (appContent)   appContent.style.display   = loggedIn ? "block" : "none";

    if (loggedIn && _userInfo) {
      const nameEl   = document.getElementById("user-name");
      const avatarEl = document.getElementById("user-avatar");
      if (nameEl)   nameEl.textContent = _userInfo.name;
      if (avatarEl && _userInfo.picture) {
        avatarEl.src = _userInfo.picture;
        avatarEl.style.display = "block";
      }
    }
  }

  return { init, getToken, isLoggedIn, getUserInfo, onLogin, logout };

})();
