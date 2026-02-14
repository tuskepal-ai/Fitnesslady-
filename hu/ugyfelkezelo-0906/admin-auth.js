// admin-auth.js
const AdminAuth = (() => {
  // ✅ ÚJ belépési adatok
  const USERNAME = "Palko";
  const PASSWORD_SHA256 = "9d7475cc6d85354c4a3016ecf6d8747f23c54baccc77671eba46be852d9bb753";

  const SESSION_KEY = "fl_admin_session_v1";
  const SESSION_TTL_MIN = 60; // perc

  function now() { return Date.now(); }

  function setSession() {
    const payload = { t: now(), ttl: SESSION_TTL_MIN };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  }

  function isLoggedIn() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const v = JSON.parse(raw);
      const ageMin = (now() - Number(v.t || 0)) / 60000;
      return ageMin <= Number(v.ttl || SESSION_TTL_MIN);
    } catch {
      return false;
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function login(u, p) {
    if (!u || !p) return false;
    if (String(u).trim() !== USERNAME) return false;

    const h = await sha256(p);
    if (h !== PASSWORD_SHA256) return false;

    setSession();
    return true;
  }

  return { login, logout, isLoggedIn, sha256 };
})();
