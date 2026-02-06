const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIH-tTccqy_yetPGUaqZ3wULe74ZVSzCX6wA7kZV-iWDu0I1I4_IBjTFggNS2xpZFqQwTXj3mnZeag/pub?gid=0&single=true&output=csv";

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  const normalized = String(text ?? "").replace(/^\uFEFF/, "");

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && normalized[i + 1] === "\n") i++;
      row.push(cur);

      if (row.some((cell) => cell !== "")) rows.push(row);

      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  if (row.some((cell) => cell !== "")) rows.push(row);

  return rows;
}

function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findHeaderIndex(headers, options) {
  return headers.findIndex((header) => {
    const normalizedHeader = normalizeText(header);
    return options.some((option) => normalizedHeader.includes(normalizeText(option)));
  });
}

function loadReviews() {
  const box = document.getElementById("reviews");
  if (!box) return;

  box.innerHTML = "Betöltés…";

  fetch(CSV_URL, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then((csv) => {
      const rows = parseCSV(csv);
      const headers = rows.shift() || [];

      const iRate = findHeaderIndex(headers, ["Mennyire", "értékelés", "rating"]);
      const iText = findHeaderIndex(headers, ["Véleményed", "vélemény", "review"]);
      const iShow = findHeaderIndex(headers, ["Megjelenhet", "publik", "show"]);

      if (iRate < 0 || iText < 0 || iShow < 0) {
        box.innerHTML = "Hiányzó oszlop(ok) a táblázatban.";
        return;
      }

      const approved = rows.filter((r) => {
        const flag = normalizeText(r[iShow]);
        return ["igen", "yes", "true", "1"].includes(flag);
      });

      if (!approved.length) {
        box.innerHTML = "Nincs megjeleníthető vélemény.";
        return;
      }

      box.innerHTML = approved
        .map(
          (r) => `
          <div class="review-card">
            <strong>⭐ ${escapeHTML(r[iRate])}/5</strong><br>
            ${escapeHTML(r[iText])}
          </div>
        `
        )
        .join("");
    })
    .catch(() => {
      box.innerHTML = "Hiba a vélemények betöltésekor.";
    });
}

loadReviews();
