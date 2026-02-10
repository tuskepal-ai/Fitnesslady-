(async () => {
  const MANIFEST_URL = "/hu/upgrade/manifest.json";
  const ANCHOR_SELECTOR = 'script[data-upgrade-anchor="true"]';

  function log(...a) { console.log("[upgrade]", ...a); }
  function warn(...a) { console.warn("[upgrade]", ...a); }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
    return await res.json();
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Text fetch failed: ${res.status} (${url})`);
    return await res.text();
  }

  function getAnchor() {
    const explicit = document.querySelector(ANCHOR_SELECTOR);
    if (explicit) return explicit;
    return document.body.lastElementChild || document.body;
  }

  function injectHTML(html, beforeEl) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    const nodes = Array.from(tpl.content.childNodes);

    const inserted = [];
    for (const n of nodes) {
      if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) continue;
      inserted.push(n);
    }

    if (beforeEl && beforeEl.parentNode) {
      for (const n of inserted) beforeEl.parentNode.insertBefore(n, beforeEl);
    } else {
      for (const n of inserted) document.body.appendChild(n);
    }
  }

  function injectScript(src, afterEl) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Script load failed: ${src}`));

      if (afterEl && afterEl.parentNode) {
        afterEl.parentNode.insertBefore(s, afterEl.nextSibling);
      } else {
        document.body.appendChild(s);
      }
    });
  }

  try {
    const manifest = await fetchJSON(MANIFEST_URL);
    const modules = manifest?.modules || {};
    const anchor = getAnchor();

    const enabled = Object.entries(modules)
      .filter(([, cfg]) => cfg && cfg.enabled)
      .map(([name, cfg]) => ({ name, cfg }));

    if (!enabled.length) {
      log("No enabled modules");
      return;
    }

    for (const { name, cfg } of enabled) {
      try {
        if (cfg.html) {
          const html = await fetchText(cfg.html);
          injectHTML(html, anchor);
        }
        if (cfg.js) {
          await injectScript(cfg.js, anchor);
        }
        log(`Loaded module: ${name}`);
      } catch (e) {
        warn(`Module failed: ${name}`, e);
      }
    }
  } catch (e) {
    warn("Loader failed", e);
  }
})();
