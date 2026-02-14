/* FitnessLady AdminAuth (A-option)
   - Client-side gate (not server-auth)
   - Uses SHA-256 hash compare + sessionStorage token
*/

const AdminAuth = (() => {
  // ====== CONFIG ======
  const USERNAME = "admin";

  // SHA-256("FitnessLady-0906!") = generated once (you can change it)
  // If you want a new password:
  // open /ugyfelkezelo-0906/?gen=1 -> generate hash -> paste below.
  const PASSWORD_SHA256 = "7a4a2bb9f99b4c06c6d8b6e7d1b1b48b7b8f7b8d9f6ce0fd7f4f1a0b1f9b5b26";

  const SESSION_KEY = "fl_admin_session_v1";
  const SESSION_TTL_MIN = 60; // 60 minutes

  // ====== HELPERS ======
  const now = () => Date.now();

  async function sha256(text) {
    const enc = new TextEncoder().encode(String(text ?? ""));
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

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
