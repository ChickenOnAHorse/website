// netlify/functions/steam-image.js

// Simple in-memory cache for warm functions
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const cache = global.__steamImgCache || (global.__steamImgCache = new Map());

function setCache(key, value) { cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS }); }
function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { cache.delete(key); return null; }
  return hit.value;
}

exports.handler = async function (event) {
  try {
    const name = (event.queryStringParameters?.name || '').trim();
    if (!name) return ok({ url: null });

    const key = name.toLowerCase();
    const cached = getCache(key);
    if (cached !== undefined && cached !== null) return ok({ url: cached });

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
    const searchUrl = `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=25&query=${encodeURIComponent(name)}`;
    const resp = await fetch(searchUrl, { headers: { 'accept': 'application/json,text/html,*/*', 'user-agent': ua } });
    if (!resp.ok) return okNull(key);

    const data = await resp.json();
    const html = String(data.results_html || '');

    // collect {title, img}
    const titles = [...html.matchAll(/<span class="market_listing_item_name"[^>]*>([^<]+)<\/span>/gi)].map(m => m[1]);
    const imgs =   [...html.matchAll(/https:\/\/[^"'\s]+\/economy\/image\/[^"'\s]+/gi)].map(m => m[0]);
    const rows = [];
    const n = Math.min(titles.length, imgs.length);
    for (let i = 0; i < n; i++) rows.push({ title: titles[i], img: imgs[i] });

    if (!rows.length) return okNull(key);

    const normName = name.toLowerCase();
    const best = rows.find(r => r.title?.toLowerCase().includes(normName)) || rows[0];

    // normalize host + size
    const normalizedPath = best.img.replace(/^https:\/\/[^/]+/, 'https://community.cloudflare.steamstatic.com')
                                   .replace(/\/\d+x\d+(\?.*)?$/i, '');
    const finalUrl = `${normalizedPath}/512x512`;

    setCache(key, finalUrl);
    return ok({ url: finalUrl });
  } catch {
    return ok({ url: null });
  }
};

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
    body: JSON.stringify(body),
  };
}
function okNull(key) { setCache(key, null); return ok({ url: null }); }
