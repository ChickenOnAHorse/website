// netlify/functions/fetch-items.js
// Reads your Apps Script JSON (objects with Date, Item, Special Characteristics, Float, Include, Status, Image)
// Shows items ONLY when: Include === true AND Status is blank.
// Supports debug view with ?debug=1.

exports.handler = async function (event) {
  const APPS_SCRIPT_URL =
    process.env.APPS_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbwzt4pW1SCvLydFXlPgyjYilw431slvRM5rnJo0CHOFLSi9_WJtTrbZb9auc2NNVac/exec";

  const isBlank = (v) => v == null || String(v).trim() === "";
  const isTrueBool = (v) => v === true || String(v).trim().toLowerCase() === "true";

  try {
    // Fetch once and keep the body for clearer errors
    const upstream = await fetch(APPS_SCRIPT_URL, { headers: { accept: "application/json" } });
    const bodyText = await upstream.text();

    if (!upstream.ok) {
      return {
        statusCode: 502,
        body: `Apps Script responded ${upstream.status}: ${bodyText.slice(0, 500)}`
      };
    }

    // Parse JSON safely
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch (e) {
      return {
        statusCode: 500,
        body: `Apps Script did not return valid JSON. First 300 chars: ${bodyText.slice(0, 300)}`
      };
    }

    // Normalize to our shape
    let rows = [];
    if (Array.isArray(data)) {
      if (data.length && !Array.isArray(data[0])) {
        // Array of objects (your case)
        rows = data.map((r) => ({
          purchaseDate: r.Date ?? r.date ?? "",
          name: r.Item ?? "",
          special: r["Special Characteristics"] ?? "",
          float: r.Float ?? "",
          Include: r.Include,
          Status: r.Status ?? "",
          image: r.Image ?? r["Image URL"] ?? r.image ?? ""   // Column H
        }));
      } else {
        // Array of arrays (fallback A..H)
        rows = data.map((row) => ({
          purchaseDate: row[0],
          name: row[1],
          special: row[2],
          float: row[3],
          Include: row[5],
          Status: row[6],
          image: row[7] || ""
        }));
      }
    }

    // EXACT FILTER
    const visible = rows.filter((r) => isTrueBool(r.Include) && isBlank(r.Status));

    // Debug view
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

    // Return to client
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(visible)
    };
  } catch (e) {
    return { statusCode: 500, body: `Fetch failed: ${String(e)}` };
  }
};
