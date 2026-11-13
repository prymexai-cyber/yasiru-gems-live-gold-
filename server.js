// YASIRU GEMS LIVE — Sri Lanka gold / silver / platinum & currency rates
// Zero-dependency Node.js server (Node 18+). Deploy on Render as a Web Service.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { SHOPS, htmlToText, sane } = require('./shops');

// ---------- Settings (Render → Environment variables) ----------
const PORT = Number(process.env.PORT || 3000);
const REFRESH_MINUTES = Number(process.env.REFRESH_MINUTES || 5);            // world prices + currencies
const SHOP_REFRESH_MINUTES = Number(process.env.SHOP_REFRESH_MINUTES || 30); // jeweller websites
const ADMIN_KEY = process.env.ADMIN_KEY || '';                                // /admin password
const CURRENCIES = (process.env.CURRENCIES || 'usd,eur,gbp,aud,cad,jpy,inr,aed,sar,kwd')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 10);
const MOCK = process.env.MOCK === '1';

const OZ_GRAMS = 31.1034768;
const PAWN_GRAMS = 8;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SHOP_FILE = path.join(DATA_DIR, 'shops.json');

// ---------- Helpers ----------
async function fetchRaw(url, { timeoutMs = 12000, json = true } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        Accept: json ? 'application/json' : 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json ? await res.json() : await res.text();
  } finally {
    clearTimeout(t);
  }
}
async function firstOk(urls) {
  let lastErr;
  for (const u of urls) {
    try { return await fetchRaw(u); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
const isoDate = d => d.toISOString().slice(0, 10);
const colomboDate = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}
const pct = (now, before) => (now && before ? ((now - before) / before) * 100 : null);

// =====================================================================
// 1) JEWELLER SHOP PRICES (Devi, Ravi, Vogue …)
// =====================================================================
// stored: { shops: { devi: {k22,k24,date,fetchedAt,ok,error} }, history: { '2026-11-12': { devi:{k22,k24} } } }
let store = { shops: {}, history: {} };
try { store = JSON.parse(fs.readFileSync(SHOP_FILE, 'utf8')); } catch (_) {}
store.shops ||= {}; store.history ||= {};

function saveStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // keep only last 60 days
    const days = Object.keys(store.history).sort();
    days.slice(0, Math.max(0, days.length - 60)).forEach(d => delete store.history[d]);
    fs.writeFileSync(SHOP_FILE, JSON.stringify(store, null, 1));
  } catch (e) { console.error('save failed', e.message); }
}

function recordPrice(id, k22, k24, date) {
  const prev = store.shops[id] || {};
  const changed = prev.k22 !== k22 || prev.k24 !== k24;
  store.shops[id] = { ...prev, k22, k24, date: date || colomboDate(), fetchedAt: new Date().toISOString(), ok: true, error: null,
    changedAt: changed ? new Date().toISOString() : prev.changedAt || new Date().toISOString() };
  const day = colomboDate();
  store.history[day] ||= {};
  store.history[day][id] = { k22, k24 };
}

async function scrapeShop(shop) {
  try {
    const html = MOCK ? MOCK_HTML[shop.id] : await fetchRaw(shop.url, { json: false, timeoutMs: 20000 });
    const r = shop.parse(htmlToText(html));
    const k22 = sane(r.k22), k24 = sane(r.k24);
    if (!k22 && !k24) throw new Error('Price not found on page (website layout changed?)');
    recordPrice(shop.id, k22, k24, r.date);
    console.log(`[shop] ${shop.name}: 22K ${k22 ?? '-'} | 24K ${k24 ?? '-'}`);
  } catch (e) {
    store.shops[shop.id] = { ...(store.shops[shop.id] || {}), ok: false, error: e.message, triedAt: new Date().toISOString() };
    console.error(`[shop] ${shop.name} failed: ${e.message}`);
  }
}

async function refreshShops() {
  await Promise.all(SHOPS.filter(s => s.type === 'scrape').map(scrapeShop));
  const m = marketPrice();
  if (m) {
    const day = colomboDate();
    store.history[day] ||= {};
    store.history[day].market = { k22: m.k22, k24: m.k24 };
  }
  saveStore();
}

function previousDayValue(id, key) {
  const today = colomboDate();
  const days = Object.keys(store.history).filter(d => d < today).sort().reverse();
  for (const d of days) {
    const v = store.history[d][id] && store.history[d][id][key];
    if (v) return v;
  }
  return null;
}

// admin view only (names are never shown on the public site)
function shopsView() {
  return SHOPS.map(s => {
    const st = store.shops[s.id] || {};
    return { id: s.id, name: s.name, k22: st.k22 || null, k24: st.k24 || null, updatedAt: st.fetchedAt || null, error: st.ok === false ? st.error : null };
  });
}

function median(arr) {
  const a = arr.filter(v => typeof v === 'number').sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// Sri Lanka market price = admin override (today) OR median of all jeweller sources
function marketPrice() {
  const ov = store.override;
  if (ov && ov.date === colomboDate()) return { k22: ov.k22, k24: ov.k24, updatedAt: ov.at };
  const live = SHOPS.map(s => store.shops[s.id]).filter(st => st && (st.k22 || st.k24));
  if (!live.length) return null;
  return {
    k22: median(live.map(s => s.k22)),
    k24: median(live.map(s => s.k24)),
    updatedAt: live.map(s => s.fetchedAt).sort().pop(),
  };
}

function localGold() {
  const m = marketPrice();
  if (!m || (!m.k22 && !m.k24)) return null;
  const base24 = m.k24 || m.k22 * (24 / 22);
  const k22 = m.k22 || base24 * (22 / 24);
  const karats = [
    { karat: 24, perPawn: base24, estimated: !m.k24 },
    { karat: 22, perPawn: k22, estimated: !m.k22 },
    { karat: 21, perPawn: base24 * (21 / 24), estimated: true },
    { karat: 18, perPawn: base24 * (18 / 24), estimated: true },
  ].map(k => ({ ...k, perGram: k.perPawn / PAWN_GRAMS }));
  const prev = m.k24 ? previousDayValue('market', 'k24') : previousDayValue('market', 'k22');
  return { updatedAt: m.updatedAt, changePercent: pct(m.k24 || m.k22, prev), karats };
}

// =====================================================================
// 2) WORLD PRICES + CURRENCIES (silver, platinum, FX)
// =====================================================================
const pastRatesCache = new Map();
async function getRates(date = 'latest') {
  if (MOCK) return mockRates(date);
  if (date !== 'latest' && pastRatesCache.has(date)) return pastRatesCache.get(date);
  const data = await firstOk([
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/usd.json`,
  ]);
  if (!data || !data.usd || !data.usd.lkr) throw new Error('Bad rates payload');
  if (date !== 'latest') pastRatesCache.set(date, data);
  return data;
}
async function getSpot(symbol, rates) {
  const fallback = 1 / rates.usd[symbol.toLowerCase()];
  if (MOCK) return fallback * (1 + (Math.random() - 0.5) * 0.002);
  try {
    const d = await fetchRaw(`https://api.gold-api.com/price/${symbol}`, { timeoutMs: 8000 });
    if (typeof d.price === 'number' && d.price > 0) return d.price;
  } catch (_) {}
  return fallback;
}
const lkrPerGram = (usdPerOz, usdLkr) => (usdPerOz / OZ_GRAMS) * usdLkr;
const lkrPerUnit = (usd, c) => (c === 'usd' ? usd.lkr : usd.lkr / usd[c]);
function metalsFromDaily(rates) {
  const u = rates.usd;
  return { gold24Gram: lkrPerGram(1 / u.xau, u.lkr), silverGram: lkrPerGram(1 / u.xag, u.lkr), platinumGram: lkrPerGram(1 / u.xpt, u.lkr) };
}

let world = null;
let worldError = null;
async function refreshWorld() {
  try {
    const today = await getRates('latest');
    const [yest, xau, xag, xpt] = await Promise.all([
      getRates(shiftDate(today.date, -1)).catch(() => null),
      getSpot('XAU', today), getSpot('XAG', today), getSpot('XPT', today),
    ]);
    const usdLkr = today.usd.lkr;
    const g24 = lkrPerGram(xau, usdLkr), ag = lkrPerGram(xag, usdLkr), pt = lkrPerGram(xpt, usdLkr);
    const prev = yest ? metalsFromDaily(yest) : null;
    world = {
      updatedAt: new Date().toISOString(),
      spotUsdPerOz: { gold: xau, silver: xag, platinum: xpt },
      usdLkr,
      worldGold24Pawn: g24 * PAWN_GRAMS,
      worldGoldChange: prev ? pct(g24, prev.gold24Gram) : null,
      silver: { perGram: ag, per10Gram: ag * 10, changePercent: prev ? pct(ag, prev.silverGram) : null },
      platinum: { perPawn: pt * PAWN_GRAMS, perGram: pt, changePercent: prev ? pct(pt, prev.platinumGram) : null },
      currencies: CURRENCIES.filter(c => c === 'usd' || today.usd[c]).map(c => {
        const now = lkrPerUnit(today.usd, c);
        const before = yest && (c === 'usd' || yest.usd[c]) ? lkrPerUnit(yest.usd, c) : null;
        return { code: c.toUpperCase(), lkr: now, changePercent: pct(now, before) };
      }),
    };
    worldError = null;
  } catch (e) {
    worldError = e.message;
    console.error('World refresh failed:', e.message);
  }
}

let historyCache = { at: 0, days: 0, data: null };
async function getHistory(days) {
  if (historyCache.data && historyCache.days === days && Date.now() - historyCache.at < 3 * 3600e3) return historyCache.data;
  const today = await getRates('latest');
  const dates = Array.from({ length: days }, (_, i) => shiftDate(today.date, -(days - 1 - i)));
  const rows = await Promise.all(dates.map(d =>
    (d === today.date ? Promise.resolve(today) : getRates(d)).then(r => ({ d, r })).catch(() => null)));
  const data = rows.filter(Boolean).map(({ d, r }) => {
    const m = metalsFromDaily(r);
    const shopDay = store.history[d] && store.history[d].market;
    return { date: d, gold24Pawn: m.gold24Gram * PAWN_GRAMS, localGold24Pawn: shopDay ? shopDay.k24 || null : null,
      silverGram: m.silverGram, platinumPawn: m.platinumGram * PAWN_GRAMS, usdLkr: r.usd.lkr };
  });
  historyCache = { at: Date.now(), days, data };
  return data;
}

// =====================================================================
// MOCK data (npm run dev) — offline testing
// =====================================================================
const MOCK_HTML = {
  devi: `<div class="rate"><h4>Today&#8217;s Price</h4><p><strong>Gold (22KT) &#8211; 334,000.00 LKR /g</strong> <img src="down.svg"></p>
         <p><strong>Gold (24KT) &#8211; 363,000.00 LKR /g</strong></p></div>`,
  ravi: `<div>GOLD RATE</div><div>DATE: 02/10/2025</div><div><b>22Kt</b> <b>LKR 283,000</b></div>
         <div>DATE: 12/11/2026</div><div>22KT LKR 334,000</div>`,
};
function mockRates(date) {
  const d = date === 'latest' ? isoDate(new Date()) : date;
  const seed = [...d].reduce((a, c) => a + c.charCodeAt(0), 0);
  const w = Math.sin(seed) * 0.01;
  return { date: d, usd: { lkr: 299.5 * (1 + w / 3), xau: 1 / (4050 * (1 + w)), xag: 1 / (50.2 * (1 + w * 1.5)), xpt: 1 / (1560 * (1 - w)),
    eur: 0.862, gbp: 0.758, aud: 1.53, cad: 1.4, jpy: 154.2, inr: 88.6, aed: 3.6725, sar: 3.75, kwd: 0.3068 } };
}

// =====================================================================
// HTTP server
// =====================================================================
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 1e4) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/prices') {
      if (!world) await refreshWorld();
      return sendJSON(res, 200, {
        ...(world || {}),
        refreshMinutes: REFRESH_MINUTES,
        shopRefreshMinutes: SHOP_REFRESH_MINUTES,
        gold: localGold(),
        stale: Boolean(worldError),
      });
    }
    if (url.pathname === '/api/history') {
      const days = Math.min(30, Math.max(2, Number(url.searchParams.get('days')) || 7));
      return sendJSON(res, 200, await getHistory(days));
    }
    if (url.pathname === '/api/admin/manual' && req.method === 'POST') {
      if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) return sendJSON(res, 401, { error: 'Wrong admin key' });
      const b = await readBody(req);
      if (b.clear) { delete store.override; saveStore(); return sendJSON(res, 200, { ok: true, cleared: true }); }
      const k22 = b.k22 ? sane(Number(b.k22)) : null, k24 = b.k24 ? sane(Number(b.k24)) : null;
      if (!k22 && !k24) return sendJSON(res, 400, { error: 'Price eka waradi (pawn price ekak danna, e.g. 334000)' });
      store.override = { k22, k24, date: colomboDate(), at: new Date().toISOString() };
      const day = colomboDate();
      store.history[day] ||= {};
      store.history[day].market = { k22, k24 };
      saveStore();
      return sendJSON(res, 200, { ok: true, override: store.override });
    }
    if (url.pathname === '/api/admin/refresh' && req.method === 'POST') {
      if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) return sendJSON(res, 401, { error: 'Wrong admin key' });
      await Promise.all([refreshShops(), refreshWorld()]);
      return sendJSON(res, 200, { ok: true, shops: shopsView(), market: marketPrice() });
    }
    if (url.pathname === '/health') return sendJSON(res, 200, { ok: true });

    const rel = url.pathname === '/' ? 'index.html' : url.pathname === '/admin' ? 'admin.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
      res.end(buf);
    });
  } catch (e) {
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`YASIRU GEMS LIVE running on port ${PORT}${MOCK ? ' (MOCK data)' : ''}`);
  refreshWorld();
  refreshShops();
  setInterval(refreshWorld, REFRESH_MINUTES * 60 * 1000);
  setInterval(refreshShops, SHOP_REFRESH_MINUTES * 60 * 1000);
});
