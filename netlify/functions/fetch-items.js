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

    // Normalize to ou
