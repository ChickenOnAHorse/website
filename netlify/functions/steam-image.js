// netlify/functions/steam-image.js
// Strategy: try the exact listing page first (most reliable), then fall back to market search.
// Always normalize to cloudflare host and 512x512. Includes ?debug=1.

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const cache = global.__steamImgCache || (global.__steamImgCache = new Map());

const ok = (body) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  body: JSON.stringify(body),
});

function setCache(key, value) { cache.set(key, { value, exp: Date.now() + CACHE_TTL_MS }); }
function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) { cache.delete(key); return null; }
  return hit.value;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const normalizeHostAndSize = (url) =>
  url
    .replace(/^https:\/\/[^/]+/, 'https://community.cloudflare.steamstatic.com')
    .replace(/\/\d+x\d+(\?.*)?$/i, '') + '/512x512';

exports.handler = async (event) => {
  try {
    const raw = (event.queryStringParameters?.name || '').trim();
    const debug = event.queryStringParameters?.debug === '1';
    if (!raw) return ok({ url: null });

    const key = raw.toLowerCase();
    const cached = getCache(key);
    if (cached !== undefined && cached !== null) return ok(debug ? { url: cached, from: 'cache' } : { url: cached });

    // 1) Exact listing page first
    // e.g., https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline
    const listingUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(raw)}`;
    let finalUrl = null;
    try {
      const page = await fetch(listingUrl, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.8' } });
      if (page.ok) {
        const html = await page.text();
        const og = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1];
        if (og) {
          finalUrl = normalizeHostAndSize(og);
          setCache(key, finalUrl);
          return ok(debug ? { url: finalUrl, from: 'listing-og', listingUrl } : { url: finalUrl });
        }
      }
    } catch {
      // ignore and try search
    }

    // 2) Fallback: market search -> economy/image
    try {
      const searchUrl = `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=50&query=${encodeURIComponent(raw)}`;
      const resp = await fetch(searchUrl, { headers: { 'accept': 'application/json,text/html,*/*', 'user-agent': UA } });
      if (resp.ok) {
        const data = await resp.json();
        const html = String(data.results_html || '');

        // Titles + images
        const titles = [...html.matchAll(/<span class="market_listing_item_name"[^>]*>([^<]+)<\/span>/gi)].map(m => m[1]);
        const imgs   = [...html.matchAll(/https:\/\/[^"'\s]+\/economy\/image\/[^"'\s]+/gi)].map(m => m[0]);

        // pick first, or try to match roughly
        let idx = 0;
        const target = raw.toLowerCase().replace(/™|®/g,'').replace(/\s+/g,' ').trim();
        for (let i = 0; i < titles.length; i++) {
          const t = titles[i]?.toLowerCase().replace(/™|®/g,'').replace(/\s+/g,' ').trim();
          if (t && t.includes(target)) { idx = i; break; }
        }

        const chosen = imgs[idx] || imgs[0];
        if (chosen) {
          finalUrl = normalizeHostAndSize(chosen);
          setCache(key, finalUrl);
          return ok(debug ? { url: finalUrl, from: 'search-economy', matchedTitle: titles[idx] || titles[0] } : { url: finalUrl });
        }
      }
    } catch {
      // ignore
    }

    // Nothing found
    setCache(key, null);
    return ok(debug ? { url: null, from: 'none', listingUrl } : { url: null });
  } catch {
    return ok({ url: null });
  }
};
