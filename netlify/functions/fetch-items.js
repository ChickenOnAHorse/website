// netlify/functions/fetch-items.js
// Maps object-shaped JSON (Date, Item, Special Characteristics, Float, Include, Status, Image)
// Filter rule: Include === true  AND  Status is blank

exports.handler = async function (event) {
  const APPS_SCRIPT_URL =
    process.env.APPS_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbwzt4pW1SCvLydFXlPgyjYilw431slvRM5rnJo0CHOFLSi9_WJtTrbZb9auc2NNVac/exec";

  const isBlank = (v) => v == null || String(v).trim() === "";
  const isTrueBool = (v) => v === true || String(v).trim().toLowerCase() === "true";

  try {
    const upstream = await fetch(APPS_SCRIPT_URL, { headers: { accept: "application/json" } });
    const bodyText = await upstream.text();
    if (!upstream.ok) {
      return { statusCode: 502, body: `Apps Script responded ${upstream.status}: ${bodyText.slice(0, 500)}` };
    }

    let data;
    try { data = JSON.parse(bodyText); }
    catch { return { statusCode: 500, body: `Apps Script did not return valid JSON. First 300 chars: ${bodyText.slice(0,300)}` }; }

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
          image: r.Image ?? r["Image URL"] ?? r.image ?? ""   // Column H (Image)
        }));
      } else {
        // Fallback for array-of-arrays if ever used (A..H)
        rows = data.map((row) => ({
          purchaseDate: row[0],
          name: row[1],
          special: row[2],
          float: row[3],
          Include: row[5],
          Status: row[6],
          image: row[7] || ""                                  // Column H
        }));
      }
    }

    // EXACT FILTER
    const visible = rows.filter((r) => isTrueBool(r.Include) && isBlank(r.Status));

    if (event?.queryStringParameters?.debug === "1") {
      return {
        statusCode: 200,
