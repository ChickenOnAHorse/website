// netlify/functions/fetch-items.js
// Uses your object-shaped JSON fields (Date, Item, Special Characteristics, Float, Include, Status)
// and applies the exact filter you specified:
//   Include === TRUE  AND  Status is blank
exports.handler = async function (event) {
  const APPS_SCRIPT_URL =
    process.env.APPS_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbwzt4pW1SCvLydFXlPgyjYilw431slvRM5rnJo0CHOFLSi9_WJtTrbZb9auc2NNVac/exec";

  // Helpers
  const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";
  const isTrueBool = (v) => v === true || String(v).trim().toLowerCase() === "true";

  try {
    const upstream = await fetch(APPS_SCRIPT_URL, { headers: { accept: "application/json" } });
    if (!upstream.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: `Apps Script responded ${upstream.status}` }) };
    }
    const data = await upstream.json();

    // Normalize (supports array of objects or array of arrays, just in case)
    const rows = Array.isArray(data) && data.length && !Array.isArray(data[0])
      ? data.map((r) => ({
          purchaseDate: r.Date ?? r.date ?? "",
          name: r.Item ?? "",
          special: r["Special Characteristics"] ?? "",
          float: r.Float ?? "",
          Include: r.Include,     // boolean in your sample
          Status: r.Status ?? "", // blank means available
        }))
      : Array.isArray(data)
      ? data.map((row) => ({
          // Fallback mapping if someone returns rows as arrays: A..G
          purchaseDate: row[0],
          name: row[1],
          special: row[2],
          float: row[3],
          Include: row[5],
          Status: row[6],
        }))
      : [];

    // EXACT FILTER: Include must be TRUE AND Status must be blank
    const visible = rows.filter((r) => isTrueBool(r.Include) && isBlank(r.Status));

    // Optional debug view
    if (event?.queryStringParameters?.debug === "1") {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
