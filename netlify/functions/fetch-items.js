// netlify/functions/fetch-items.js
// Maps your object-shaped JSON (Date, Item, Special Characteristics, Float, Include, Status)
// Filter rule: Include === true  AND  Status is blank

exports.handler = async function (event) {
  const APPS_SCRIPT_URL =
    process.env.APPS_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbwzt4pW1SCvLydFXlPgyjYilw431slvRM5rnJo0CHOFLSi9_WJtTrbZb9auc2NNVac/exec";

  const isBlank = (v) => v == null || String(v).trim() === "";
  const isTrueBool = (v) => v === true || String(v).trim().toLowerCase() === "true";

  try {
    // Fetch from Apps Script
    const upstream = await fetch(APPS_SCRIPT_URL, { headers: { accept: "application/json" } });
    const bodyText = await upstream.text(); // read once so we can show helpful errors
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

    // Normalize rows to our shape
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
          Status: r.Status ?? ""
        }));
      } else {
        // Array of arrays (fallback if ever needed)
        rows = data.map((row) => ({
          purchaseDate: row[0],
          name: row[1],
          special: row[2],
          float: row[3],
          Include: row[5],
          Status: row[6]
        }));
      }
    }

    // EXACT FILTER: Column F (Include) must be true AND Column G (Status) must be blank
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

    // Return visible rows to the frontend
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(visible)
    };
  } catch (e) {
    // Bubble helpful error
    return { statusCode: 500, body: `Fetch failed: ${String(e)}` };
  }
};
