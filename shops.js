// Jeweller websites → today's gold price (per pawn / 8 g)
// Aluth kadayak add karanna: me list ekata object ekak danna.
//   type: 'scrape'  → website eken auto ganna (url + parse function)

const SHOPS = [
  {
    id: 'devi',
    name: 'Devi Jewellers',
    url: 'https://devijewellers.lk/',
    type: 'scrape',
    // Page text: "Gold (22KT) – 334,000.00 LKR /g   Gold (24KT) – 363,000.00 LKR /g"
    // (site eke "/g" kiyala thibbata me mila pawuma (8g) ekaka mila)
    parse(text) {
      const k22 = num(text.match(/Gold\s*\(\s*22\s*KT\s*\)\s*[-–—:]?\s*(?:LKR|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i));
      const k24 = num(text.match(/Gold\s*\(\s*24\s*KT\s*\)\s*[-–—:]?\s*(?:LKR|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i));
      return { k22, k24, date: null };
    },
  },
  {
    id: 'ravi',
    name: 'Ravi Jewellers',
    url: 'https://ravijewellers.lk/contact-us/',
    type: 'scrape',
    // Page text: "GOLD RATE DATE: 02/10/2025 22Kt LKR 283,000 DATE: 12/11/2026 22KT LKR 334,000"
    // → aluthma date eke price eka ganna
    parse(text) {
      const re = /DATE:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(2[24])\s*K[Tt]?\s*(?:LKR|Rs\.?)\s*([\d,]+(?:\.\d+)?)/gi;
      let best = {};
      for (const m of text.matchAll(re)) {
        const date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        const key = 'k' + m[4];
        const val = Number(m[5].replace(/,/g, ''));
        if (!best.date || date > best.date) best = { date };
        if (date === best.date) best[key] = val;
      }
      return { k22: best.k22 || null, k24: best.k24 || null, date: best.date || null };
    },
  },
];

function num(m) {
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

// HTML → plain text (tags remove, entities decode)
function htmlToText(html) {
  const named = { nbsp: ' ', ndash: '–', mdash: '—', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: "'", lsquo: "'" };
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ');
}

// Pawuma ekaka mila hariyata thiyenavada kiyala check karanna (wrong numbers block)
const MIN_PAWN = Number(process.env.MIN_PAWN_PRICE || 100000);
const MAX_PAWN = Number(process.env.MAX_PAWN_PRICE || 2000000);
const sane = v => (typeof v === 'number' && v >= MIN_PAWN && v <= MAX_PAWN ? v : null);

module.exports = { SHOPS, htmlToText, sane };
