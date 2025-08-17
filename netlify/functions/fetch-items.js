// Uses your object-shaped JSON fields (Date, Item, Include, Status, etc.)
exports.handler = async function (event) {
  const APPS_SCRIPT_URL =
    process.env.APPS_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbwzt4pW1SCvLydFXlPgyjYilw431slvRM5rnJo0CHOFLSi9_WJtTrbZb9auc2NNVac/exec";

  // Helpers
  const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";
  const isTruthy = (v) => (v === true) || ["true", "yes", "y", "1", "show", "x"].includes(String(v).trim().toLowerCase());

  try {
    const upstream = await fetch(APPS_SCRIPT_URL, { headers: { accept: "application/json" } });
    if (!upstream.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: `Apps Script responded ${upstream.status}` }) };
    }
    const data = await upstream.json();

    // Normalize to our frontend shape
    const rows = Array.isArray(data) ? data.map((r) => ({
      purchaseDate: r.Date ?? r.date ?? "",
      name: r.Item ?? "",
      special: r["Special Characteristics"] ?? "",
      float: r.Float ?? "",
      include: r.Include,                        // boolean
      status: r.Status ?? "",                    // empty => available
      tag: r["L or K or CH or S or HT"] ?? ""    // optional extra field
    })) : [];

    // Filter: Include is truthy AND Status is blank
    const visible = rows.filter((r) => isTruthy(r.include) && isBlank(r.status));

    // Debug view: add ?debug=1 to inspect counts and samples
    if (event?.queryStringParameters?.debug === "1") {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rawCount: Array.isArray(data) ? data.length : 0,
          normalizedCount: rows.length,
          visibleCount: visible.length,
          normalizedSample: rows.slice(0, 5),
          firstVisibleSample: visible.slice(0, 5)
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(visible)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Fetch failed", detail: String(e) }) };
  }
};
