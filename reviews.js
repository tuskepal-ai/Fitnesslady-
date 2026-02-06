const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIH-tTccqy_yetPGUaqZ3wULe74ZVSzCX6wA7kZV-iWDu0I1I4_IBjTFggNS2xpZFqQwTXj3mnZeag/pub?gid=0&single=true&output=csv";

function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(Boolean)
    .map(parseCSVLine);
}

function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadReviews() {
  const box = document.getElementById("reviews");
  if (!box) return;

  box.innerHTML = "Betöltés…";

  fetch(CSV_URL, { cache: "no-store" })
    .then((r) => r.text())
    .then((csv) => {
      const rows = parseCSV(csv);
      const headers = rows.shift();

      const iRate = headers.indexOf("Mennyire v");
      const iText = headers.indexOf("Véleményed");
      const iShow = headers.indexOf("Megjelenhet?");

      const approved = rows.filter(
        (r) => String(r[iShow]).toLowerCase() === "igen"
      );

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
