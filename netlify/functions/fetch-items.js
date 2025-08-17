// Standard Netlify Functions (CommonJS) – no node-fetch needed on Node 18+
exports.handler = async function () {
  const APPS_SCRIPT_URL =
    process.env.APPS_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbwzt4pW1SCvLydFXlPgyjYilw431slvRM5rnJo0CHOFLSi9_WJtTrbZb9auc2NNVac/exec";

  if (!APPS_SCRIPT_URL) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing APPS_SCRIPT_URL" }) };
  }

  try {
    const upstream = await fetch(APPS_SCRIPT_URL, { headers: { accept: "application/json" } });
    if (!upstream.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `Apps Script responded ${upstream.status}` }),
      };
    }
    const data = await upstream.json();

    // Normalize: accept array-of-arrays OR array-of-objects
    const rows = Array.isArray(data) && data.length && Array.isArray(data[0])
      ? data.map((row) => ({
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

    // Filter (Column F == "TRUE") and Column G blank
    const visible = rows.filter(
      (r) => String(r.show).toUpperCase() === "TRUE" && (!r.sold || String(r.sold).trim() === "")
    );

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(visible),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Fetch failed", detail: String(e) }) };
  }
};
