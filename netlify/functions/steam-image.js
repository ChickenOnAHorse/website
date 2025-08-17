// Uses Steam Market search render endpoint to find an economy image (best-effort)
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const cache = global.__steamImgCache || (global.__steamImgCache = new Map());

function setCache(key, value) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}
function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

exports.handler = async function (event) {
  try {
    const name = (event.queryStringParameters?.name || "").trim();
    if (!name) return { statusCode: 200, body: JSON.stringify({ url: null }) };

    const key = name.toLowerCase();
    const cached = getCache(key);
    if (cached !== null && cached !== undefined) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
        body: JSON.stringify({ url: cached }),
      };
    }

    const searchUrl = `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=10&query=${encodeURIComponent(
      name
    )}`;
    const resp = await fetch(searchUrl, { headers: { accept: "application/json,text/html,*/*" } });
    if (!resp.ok) return { statusCode: 200, body: JSON.stringify({ url: null }) };

    const data = await resp.json();
    const html = String(data.results_html || "");
    const matches = [...html.matchAll(/https:\/\/(?:steamcommunity-a\.akamaihd\.net|community\.akamai\.steamstatic\.com)\/economy\/image\/[^"' \t\n\r]+/gi)];
    if (!matches.length) {
      setCache(key, null);
      return { statusCode: 200, body: JSON.stringify({ url: null }) };
    }

    const raw = matches[0][0];
    const normalized = raw.replace(/\/\d+x\d+(\?.*)?$/i, "");
    const finalUrl = `${normalized}/512x512`;

    setCache(key, finalUrl);
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
      body: JSON.stringify({ url: finalUrl }),
    };
  } catch {
    return { statusCode: 200, body: JSON.stringify({ url: null }) };
  }
};
