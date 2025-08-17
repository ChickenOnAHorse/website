// Robust filter + debug mode. Works on Netlify Node 18+ (built-in fetch).
exports.handler = async function (event) {
  const APPS_SCRIPT_URL =
    process.env.APPS_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbwzt4pW1SCvLydFXlPgyjYilw431slvRM5rnJo0CHOFLSi9_WJtTrbZb9auc2NNVac/exec";

  // Helpers
  const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";
  const isTruthy = (v) => {
    if (v === true) return true;
    const s = String(v).trim().toLowerCase();
    return ["true", "yes", "y", "1", "show", "x"].includes(s);
  };

  try {
    const upstream = await fetch(APPS_SCRIPT_URL, { headers: { accept: "application/json" } });
    if (!upstream.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `Apps Script responded ${upstream.status}` }),
      };
    }
    const data = await upstream.json();

    // Normalize: handle array-of-arrays OR array-of-objects
    const rows = Array.isArray(data) && data.length && Array.isArray(data[0])
      ? data
          // drop header row if it looks like one (first row contains strings)
          .filter((row, i) => !(i === 0 && row.every((c) => typeof c === "string")))
          .map((row) => ({
            purchaseDate: row[0],
            name: row[1],
            special: row[2],
            float: row[3],
            show: row[5],
            sold: row[6],
          }))
      : Array.isArray(data)
      ? data.map((r) => ({
          purchaseDate: r.purchaseDate ?? r["Date of Purchase"] ?? r.date ?? r.Date ?? "",
          name: r.name ?? r["Item Name"] ?? "",
          special: r.special ?? r["Special Characteristics"] ?? "",
          float: r.float ?? r["Float Value"] ?? "",
          show: r.show ?? r["Show"] ?? r["Column F"] ?? "",
          sold: r.sold ?? r["Sold"] ?? r["Column G"] ?? "",
        }))
      : [];

    // Filter per your rules: F says show, G is blank = available
    const visible = rows.filter((r) => isTruthy(r.show) && isBlank(r.sold));

    // Optional debug mode: append ?debug=1 to the function URL to inspect
    const debug = event?.queryStringParameters?.debug === "1";
    if (debug) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rawCount: Array.isArray(data) ? data.length : 0,
          normalizedCount: rows.length,
          visibleCount: visible.length,
          normalizedSample: rows.slice(0, 5),
          firstVisibleSample: visible.slice(0, 5),
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(visible),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Fetch failed", detail: String(e) }) };
  }
};
