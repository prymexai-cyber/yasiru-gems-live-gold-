(function () {
  const POLL_MS = 60 * 1000; // browser checks the server every minute
  const $ = id => document.getElementById(id);

  const CUR = {
    USD: ['🇺🇸', 'US Dollar'], EUR: ['🇪🇺', 'Euro'], GBP: ['🇬🇧', 'British Pound'], AUD: ['🇦🇺', 'Australian Dollar'],
    CAD: ['🇨🇦', 'Canadian Dollar'], JPY: ['🇯🇵', 'Japanese Yen'], INR: ['🇮🇳', 'Indian Rupee'], AED: ['🇦🇪', 'UAE Dirham'],
    SAR: ['🇸🇦', 'Saudi Riyal'], KWD: ['🇰🇼', 'Kuwaiti Dinar'], QAR: ['🇶🇦', 'Qatari Riyal'], SGD: ['🇸🇬', 'Singapore Dollar'],
    CNY: ['🇨🇳', 'Chinese Yuan'], CHF: ['🇨🇭', 'Swiss Franc'], MYR: ['🇲🇾', 'Malaysian Ringgit'], NZD: ['🇳🇿', 'NZ Dollar'],
    OMR: ['🇴🇲', 'Omani Rial'], BHD: ['🇧🇭', 'Bahraini Dinar'], KRW: ['🇰🇷', 'Korean Won'], ILS: ['🇮🇱', 'Israeli Shekel'],
  };

  const rs = (n, d = 0) => 'Rs ' + Number(n).toLocaleString('en-LK', { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pctTxt = p => (p == null ? '—' : (p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p).toFixed(2) + '%');
  const cls = p => (p == null || Math.abs(p) < 0.005 ? '' : p > 0 ? 'up' : 'down');

  // ---------- theme ----------
  const root = document.documentElement;
  $('themeBtn').addEventListener('click', () => {
    const t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('ygl-theme', t); } catch (e) {}
    document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#0b0d12' : '#faf7f0';
    if (history) drawSparks();
  });
  $('yr').textContent = new Date().getFullYear();

  // ---------- helpers ----------
  const prevVals = {};
  function setVal(id, text, raw) {
    const el = $(id);
    el.classList.remove('skel');
    if (prevVals[id] != null && raw != null && raw !== prevVals[id]) {
      const c = raw > prevVals[id] ? 'flash-up' : 'flash-down';
      el.classList.add(c);
      setTimeout(() => el.classList.remove(c), 1500);
    }
    prevVals[id] = raw;
    el.textContent = text;
  }
  function setChip(id, p) {
    const el = $(id);
    el.className = 'chip ' + cls(p);
    el.textContent = pctTxt(p);
    el.title = 'Change vs yesterday';
  }

  // ---------- sparklines ----------
  let history = null;
  function spark(svg, values, color) {
    if (!values || values.length < 2) { svg.innerHTML = ''; return; }
    const W = 220, H = 64, pad = 4;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - pad - ((v - min) / span) * (H - pad * 2)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const id = 'sg' + svg.id;
    const last = pts[pts.length - 1];
    svg.innerHTML =
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>` +
      `<path d="${line} L${W} ${H} L0 ${H}Z" fill="url(#${id})"/>` +
      `<path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
      `<circle cx="${last[0]}" cy="${last[1]}" r="3.4" fill="${color}"/>`;
  }
  function drawSparks() {
    if (!history) return;
    const css = getComputedStyle(root);
    const local = history.map(h => h.localGold24Pawn).filter(Boolean);
    spark($('goldSpark'), local.length >= 3 ? local : history.map(h => h.gold24Pawn), css.getPropertyValue('--gold').trim());
    spark($('silverSpark'), history.map(h => h.silverGram), css.getPropertyValue('--silver').trim());
    spark($('platSpark'), history.map(h => h.platinumPawn), css.getPropertyValue('--plat').trim());
  }
  async function loadHistory() {
    try {
      const r = await fetch('/api/history?days=7', { cache: 'no-store' });
      if (r.ok) { history = await r.json(); drawSparks(); }
    } catch (e) {}
  }

  // ---------- render ----------
  const timeLK = iso => iso ? new Date(iso).toLocaleString('en-LK', { timeZone: 'Asia/Colombo', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render(d) {
    if (d.gold) {
      const g24 = d.gold.karats.find(k => k.karat === 24);
      setVal('gold24', (g24.estimated ? '≈ ' : '') + rs(g24.perPawn), Math.round(g24.perPawn));
      $('gold24g').textContent = rs(g24.perGram) + ' per gram';
      setChip('goldChange', d.gold.changePercent != null ? d.gold.changePercent : d.worldGoldChange);
      $('karats').innerHTML = d.gold.karats.map(k =>
        `<div class="k"><div class="kt">${k.karat}K · 1 PAWN ${k.estimated ? '<em>≈</em>' : ''}</div><div class="kp">${rs(k.perPawn)}</div><div class="kg">${rs(k.perGram)} / g</div></div>`
      ).join('');
    } else {
      setVal('gold24', 'Rs —', null);
      $('gold24g').textContent = 'Updating today\'s rate…';
    }

    const goldTime = d.gold && d.gold.updatedAt ? new Date(d.gold.updatedAt).toLocaleString('en-LK', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' }) : null;
    $('meta').textContent = (goldTime ? `Gold rate updated ${goldTime} (Sri Lanka time)` : 'Updating today\'s gold rate…')
      + ` · auto-updates all day`;
    $('liveBadge').className = 'live' + (d.stale || !d.gold ? ' off' : '');
    if (!d.silver) return; // world data not loaded yet

    $('worldPawn').textContent = rs(d.worldGold24Pawn);
    setVal('silverG', rs(d.silver.perGram, 2), +d.silver.perGram.toFixed(2));
    $('silver10').textContent = rs(d.silver.per10Gram) + ' per 10 g';
    setChip('silverChange', d.silver.changePercent);

    setVal('platP', rs(d.platinum.perPawn), Math.round(d.platinum.perPawn));
    $('platG').textContent = rs(d.platinum.perGram) + ' per gram';
    setChip('platChange', d.platinum.changePercent);

    $('fx').innerHTML = d.currencies.map(c => {
      const [flag, name] = CUR[c.code] || ['💱', c.code];
      const dec = c.lkr < 10 ? 4 : 2;
      return `<div class="fx-row"><div class="flag">${flag}</div>
        <div class="fx-name"><b>${c.code}</b><span>${name}</span></div>
        <div class="fx-val"><b>${rs(c.lkr, dec)}</b><span class="${cls(c.changePercent)}">${pctTxt(c.changePercent)}</span></div></div>`;
    }).join('');

    $('spotGold').textContent = usd(d.spotUsdPerOz.gold) + ' /oz';
    $('spotSilver').textContent = usd(d.spotUsdPerOz.silver) + ' /oz';
    $('spotPlat').textContent = usd(d.spotUsdPerOz.platinum) + ' /oz';
    $('usdLkr').textContent = rs(d.usdLkr, 2);
  }

  let nextAt = 0;
  async function load() {
    try {
      const r = await fetch('/api/prices', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      render(await r.json());
    } catch (e) {
      $('liveBadge').className = 'live off';
      $('meta').textContent = 'Could not reach the price server — retrying…';
    }
    nextAt = Date.now() + POLL_MS;
  }

  setInterval(() => {
    const s = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
    $('next').textContent = `Next check in ${s}s`;
  }, 1000);

  ['gold24', 'silverG', 'platP'].forEach(id => $(id).classList.add('skel'));
  load();
  loadHistory();
  setInterval(load, POLL_MS);
  setInterval(loadHistory, 60 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
