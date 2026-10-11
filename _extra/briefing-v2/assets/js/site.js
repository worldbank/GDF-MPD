/* GDF-MPD status briefing microsite, v2. Plain JS + D3 v7, no build step. */
(function () {
  "use strict";

  // ============================================================
  // Configuration
  // ============================================================
  const CONFIG = {
    dataUrl: "data/country_support.csv",
    // Swap in the WBG official boundaries file here. Any GeoJSON works as long
    // as each feature carries an ISO3 code in one of the fields below.
    geoUrl: "data/world_boundaries.geojson",
    geoIsoFields: ["ISO_A3", "WB_A3", "ISO3", "iso3", "ISO_3", "ISO3_CODE"],
    smallAreaPx: 70, // program countries smaller than this (px²) get a dot marker
  };

  const COLORS = {
    orange: "#F05323", blue: "#009FDA", purple: "#872B90", teal: "#009CA7",
    land: "#E2E4E7",
  };

  // Lighter tints of the brand accents for text on the dark ink background,
  // where the full-strength colours are too dark to read (purple in particular).
  const ACCENT_TEXT = {
    [COLORS.orange]: "#FF8A63", [COLORS.blue]: "#4CC3EF", [COLORS.purple]: "#D69ADD", [COLORS.teal]: "#3FC7D1",
  };

  const MODES = {
    support: {
      field: "support_type",
      noun: "Type of support",
      cats: [
        { key: "grants", label: "Grant-funded country project", color: COLORS.orange },
        { key: "in-kind", label: "In-kind support", color: COLORS.teal },
        { key: "research", label: "Research and advisory support", color: COLORS.purple },
        { key: "expressed interest", label: "Expressed interest", color: COLORS.blue },
      ],
    },
    maturity: {
      field: "maturity_bucket",
      noun: "Maturity stage",
      cats: [
        { key: "Pre-Foundation", label: "Pre-foundation", color: "#8FD0D5" },
        { key: "Foundation", label: "Foundation", color: "#2FA9B2" },
        { key: "Practitioner", label: "Practitioner", color: "#075E66" },
      ],
    },
  };

  const SUPPORT_LABEL = Object.fromEntries(MODES.support.cats.map(c => [c.key, c.label]));
  const REGION_LABEL = {
    AFE: "Eastern and Southern Africa", AFW: "Western and Central Africa",
    EAP: "East Asia and Pacific", ECA: "Europe and Central Asia",
    LAC: "Latin America and the Caribbean", MENA: "Middle East and North Africa",
    SAR: "South Asia", NAC: "North America",
  };

  // Fallback positions [lon, lat] for small states a coarse boundary file may omit.
  const FALLBACK_POINTS = {
    MDV: [73.5, 3.2], SYC: [55.45, -4.62], MUS: [57.55, -20.3], COM: [43.33, -11.7],
    STP: [6.6, 0.25], CPV: [-23.6, 15.1],
  };

  const LEADERS = [
    { name: "Maxat Turlubayev", country: "Kazakhstan", role: "Director General, Kazakhstan National Statistics Office", date: "March 2026",
      quote: "With the mobile phone data approach, we are able to see up to 14 times more visitors than we can with the conventional survey and registry-based approach.", accent: COLORS.orange },
    { name: "Therese Uwimana", country: "Rwanda", role: "Director, Rwanda Statistics, Data Revolution", date: "June 2026",
      quote: "Mobile phone data can help track vulnerable populations in real time to better target the delivery of social assistance.", accent: COLORS.blue },
    { name: "Dr. M. G. Obudho", country: "Kenya", role: "Director General, Statistics Kenya", date: "June 2026",
      quote: "Kenya will catch countries like Ghana and be a leader in Africa in the use of mobile phone data for statistics.", accent: COLORS.purple },
    { name: "Dr. Raymond Lekobane", country: "Botswana", role: "Statistician General, Statistics Botswana", date: "June 2026",
      quote: "Mobile phone data is a powerful asset for evidence-based decision making.", accent: COLORS.teal },
    { name: "Batdavaa Batmunkh", country: "Mongolia", role: "Statistician General, Mongolia", date: "March 2026",
      quote: "We are operationalizing mobile phone data to monitor internal population movements and tourism statistics in real time.", accent: COLORS.orange },
  ];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ============================================================
  // Shared country data (loaded once, used by all three maps)
  // ============================================================
  let rows = new Map();   // iso3 -> row (program countries only)
  let geo = null;

  function maturityBucket(v) {
    if (!v) return "";
    if (/^pre-?foundation/i.test(v)) return "Pre-Foundation";
    if (/^foundation/i.test(v)) return "Foundation";
    if (/^practitioner/i.test(v)) return "Practitioner";
    return "";
  }

  function isoOf(f) {
    const p = f.properties || {};
    for (const k of CONFIG.geoIsoFields) if (p[k]) return String(p[k]).toUpperCase();
    return "";
  }

  function largestPart(f) {
    const g = f.geometry;
    if (!g || g.type !== "MultiPolygon") return f;
    let best = null, bestA = -1;
    g.coordinates.forEach(poly => {
      const part = { type: "Feature", geometry: { type: "Polygon", coordinates: poly } };
      const a = d3.geoArea(part);
      if (a > bestA) { bestA = a; best = part; }
    });
    return best;
  }

  // One marker point per program country: centroid of its largest polygon, or a fallback.
  function programPoints(feats, path, projection, smallArea) {
    const points = [];
    const seen = new Set();
    feats.forEach(d => {
      if (!rows.has(d.iso) || seen.has(d.iso)) return;
      seen.add(d.iso);
      const c = path.centroid(largestPart(d.f));
      if (!isFinite(c[0])) return;
      points.push({ iso: d.iso, x: c[0], y: c[1], small: path.area(d.f) < smallArea });
    });
    rows.forEach((row, iso) => {
      if (seen.has(iso) || !FALLBACK_POINTS[iso]) return;
      const p = projection(FALLBACK_POINTS[iso]);
      points.push({ iso, x: p[0], y: p[1], small: true });
    });
    return points;
  }

  // West-to-east signal sweep: rings expand from each point, once.
  function sweep(selection, width, color) {
    selection
      .attr("stroke", color)
      .transition()
      .delay(d => (d.x / width) * 1600)
      .duration(1400)
      .ease(d3.easeCubicOut)
      .attrTween("r", () => t => 2 + t * 22)
      .attrTween("opacity", () => t => (t < 0.08 ? t / 0.08 : 1 - t) * 0.9);
  }

  // Maps live in views that may be hidden, where they have zero width. Each is drawn
  // the first time it is visible, and redrawn only when its width has changed.
  const charts = [];
  function registerChart(el, draw) { if (el) charts.push({ el, draw, w: 0 }); }
  function refreshCharts() {
    if (!geo) return;                      // data still loading; the loader calls this again
    charts.forEach(c => {
      const w = c.el.clientWidth;
      if (!w || w === c.w) return;         // hidden, or already drawn at this width
      c.w = w;
      c.draw();
    });
  }

  // ============================================================
  // Mini-map (landing hero and Progress teaser)
  // ============================================================
  let miniPulsed = false;

  function drawMini(el, { pulse }) {
    const width = el.clientWidth;
    const height = el.clientHeight;
    el.innerHTML = "";
    const land = { type: "FeatureCollection", features: geo.features.filter(f => isoOf(f) !== "ATA") };
    const projection = d3.geoEqualEarth().fitExtent([[6, 6], [width - 6, height - 6]], land);
    const path = d3.geoPath(projection);
    const feats = land.features.map(f => ({ f, iso: isoOf(f) }));

    const svg = d3.select(el).append("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("focusable", "false");
    svg.append("g").selectAll("path").data(feats).join("path")
      .attr("class", "mini-land").attr("d", d => path(d.f));

    const r = Math.max(2.5, width / 160);
    const points = programPoints(feats, path, projection, 0);
    const color = d => colorFor(rows.get(d.iso), MODES.support);
    const pings = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("class", "mini-ping").attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 0).attr("opacity", 0);
    svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("class", "mini-dot").attr("cx", d => d.x).attr("cy", d => d.y).attr("r", r).attr("fill", color);

    if (pulse && !miniPulsed && !reduceMotion) {
      miniPulsed = true;
      sweep(pings, width, color);
    }
  }

  const miniEl = document.getElementById("minimap");
  const teaserMapEl = document.getElementById("teaser-map");
  registerChart(miniEl, () => drawMini(miniEl, { pulse: true }));
  registerChart(teaserMapEl, () => drawMini(teaserMapEl, { pulse: false }));

  // ============================================================
  // Main map
  // ============================================================
  const mapEl = document.getElementById("map");
  const tipEl = document.getElementById("map-tip");
  const legendEl = document.getElementById("legend");
  const clearEl = document.getElementById("legend-clear");
  const summaryEl = document.getElementById("map-summary");
  let mode = "support";
  let highlight = null;   // legend category currently highlighted, or null
  let svg, gRoot, zoom, pingObserver, pinged = false;

  function colorFor(row, m = MODES[mode]) {
    if (!row) return COLORS.land;
    const cat = m.cats.find(c => c.key === row[m.field]);
    return cat ? cat.color : COLORS.land;
  }

  function renderLegend() {
    const m = MODES[mode];
    const counts = d3.rollup([...rows.values()], v => v.length, r => r[m.field]);
    legendEl.innerHTML = m.cats.map(c =>
      `<li><button type="button" class="legend__item" data-key="${esc(c.key)}" aria-pressed="false">` +
      `<span class="sw" style="background:${c.color}"></span>${c.label} <b>${counts.get(c.key) || 0}</b></button></li>`
    ).join("") + `<li><span class="legend__static"><span class="sw" style="background:${COLORS.land}"></span>Not in the program</span></li>`;
    applyHighlight();
  }

  // Highlight one legend category on the map and dim everything else.
  function applyHighlight() {
    const m = MODES[mode];
    const dim = d => highlight !== null && (!rows.has(d.iso) || rows.get(d.iso)[m.field] !== highlight);
    d3.select(mapEl).selectAll("path.country").classed("is-dim", dim);
    d3.select(mapEl).selectAll("circle.dot").classed("is-dim", dim);
    legendEl.querySelectorAll(".legend__item").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.key === highlight)));
    legendEl.classList.toggle("has-selection", highlight !== null);
    clearEl.hidden = highlight === null;
  }

  legendEl.addEventListener("click", e => {
    const b = e.target.closest(".legend__item"); if (!b) return;
    highlight = highlight === b.dataset.key ? null : b.dataset.key;
    hideTip();
    applyHighlight();
  });
  clearEl.addEventListener("click", () => {
    highlight = null;
    applyHighlight();
    const first = legendEl.querySelector(".legend__item");
    if (first) first.focus();              // the Show all button hides itself; keep focus nearby
  });

  function renderSummary() {
    const all = [...rows.values()];
    const n = all.length;
    const regions = new Set(all.map(r => r.wbg_region).filter(Boolean)).size;
    const c = d3.rollup(all, v => v.length, r => r.support_type);
    summaryEl.textContent =
      `${n} countries across ${regions} World Bank regions: ${c.get("grants") || 0} with grant-funded projects, ` +
      `${c.get("in-kind") || 0} with in-kind support, ${c.get("research") || 0} with research and advisory support, ` +
      `and ${c.get("expressed interest") || 0} that have asked to join.`;
  }

  function tipHtml(row) {
    const sw = `<span class="swatch" style="background:${colorFor(row)}"></span>`;
    const items = [
      ["Support", SUPPORT_LABEL[row.support_type] || row.support_type],
      ["Maturity", row.maturity_status],
      ["MOU", row.mou_status],
      ["Region", REGION_LABEL[row.wbg_region] || row.wbg_region],
    ].filter(([, v]) => v);
    return `<h5>${sw}${row.country_name}</h5><dl>` +
      items.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("") + `</dl>`;
  }

  function showTip(row, x, y) {
    tipEl.innerHTML = tipHtml(row);
    tipEl.hidden = false;
    const box = mapEl.getBoundingClientRect();
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + w > box.width) left = x - w - 14;
    if (top + h > box.height) top = y - h - 14;
    tipEl.style.left = Math.max(0, left) + "px";
    tipEl.style.top = Math.max(0, top) + "px";
  }
  function hideTip() { tipEl.hidden = true; d3.selectAll(".is-active").classed("is-active", false); }

  function drawMap() {
    const width = mapEl.clientWidth;
    const height = mapEl.clientHeight;
    mapEl.innerHTML = "";

    const projection = d3.geoEqualEarth().fitExtent([[4, 4], [width - 4, height - 4]], geo);
    const path = d3.geoPath(projection);

    svg = d3.select(mapEl).append("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("preserveAspectRatio", "xMidYMid meet");
    gRoot = svg.append("g");

    const feats = geo.features.map(f => ({ f, iso: isoOf(f) }));

    gRoot.append("g").selectAll("path")
      .data(feats)
      .join("path")
      .attr("class", d => "country" + (rows.has(d.iso) ? " is-prog" : ""))
      .attr("d", d => path(d.f))
      .attr("fill", d => colorFor(rows.get(d.iso)))
      .attr("tabindex", d => rows.has(d.iso) ? 0 : null)
      .attr("aria-label", d => rows.has(d.iso) ? rows.get(d.iso).country_name : null)
      .on("pointermove", (e, d) => {
        const row = rows.get(d.iso); if (!row) return hideTip();
        d3.selectAll(".is-active").classed("is-active", false);
        d3.select(e.currentTarget).classed("is-active", true).raise();
        const [x, y] = d3.pointer(e, mapEl); showTip(row, x, y);
      })
      .on("pointerleave", hideTip)
      .on("focus", (e, d) => {
        const row = rows.get(d.iso); if (!row) return;
        const [cx, cy] = path.centroid(d.f); showTip(row, cx, cy);
      })
      .on("blur", hideTip);

    const points = programPoints(feats, path, projection, CONFIG.smallAreaPx * Math.pow(width / 1100, 2));

    gRoot.append("g").attr("class", "pings").selectAll("circle")
      .data(points).join("circle").attr("class", "ping")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 0).attr("opacity", 0);

    gRoot.append("g").selectAll("circle")
      .data(points.filter(p => p.small))
      .join("circle")
      .attr("class", "dot")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("r", Math.max(3, width / 260))
      .attr("fill", d => colorFor(rows.get(d.iso)))
      .attr("tabindex", 0)
      .attr("aria-label", d => rows.get(d.iso).country_name)
      .on("pointermove", (e, d) => { const [x, y] = d3.pointer(e, mapEl); showTip(rows.get(d.iso), x, y); })
      .on("pointerleave", hideTip)
      .on("focus", (e, d) => showTip(rows.get(d.iso), d.x, d.y))
      .on("blur", hideTip);

    zoom = d3.zoom()
      .scaleExtent([1, 8])
      .translateExtent([[0, 0], [width, height]])
      .filter(e => {
        if (e.type === "wheel") return e.ctrlKey || e.metaKey;      // don't hijack page scroll
        if (e.type === "touchstart") return e.touches.length > 1;   // one finger scrolls the page
        return !e.button;
      })
      .on("zoom", e => {
        gRoot.attr("transform", e.transform);
        gRoot.selectAll(".dot").attr("r", Math.max(3, width / 260) / Math.sqrt(e.transform.k));
      });
    svg.call(zoom).on("dblclick.zoom", null);

    applyHighlight();
    if (pinged || reduceMotion) return;
    observePing();
  }
  registerChart(mapEl, drawMap);

  // One orchestrated moment: a signal sweep west to east when the map first scrolls into view.
  function observePing() {
    if (pingObserver) pingObserver.disconnect();   // a redraw replaces any pending observer
    const io = pingObserver = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      pinged = true;
      sweep(gRoot.selectAll(".ping"), mapEl.clientWidth, d => colorFor(rows.get(d.iso)));
    }, { threshold: 0.4 });
    io.observe(mapEl);
  }

  function recolor() {
    d3.select(mapEl).selectAll("path.country").attr("fill", d => colorFor(rows.get(d.iso)));
    d3.select(mapEl).selectAll("circle.dot").attr("fill", d => colorFor(rows.get(d.iso)));
    renderLegend();
  }

  document.querySelectorAll(".seg button").forEach(btn => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      highlight = null;                     // categories differ between modes
      document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-checked", String(b === btn)));
      hideTip();
      recolor();
    });
  });

  document.querySelectorAll(".map__zoom button").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!svg) return;
      const a = btn.dataset.zoom;
      const t = svg.transition().duration(reduceMotion ? 0 : 350);
      if (a === "in") zoom.scaleBy(t, 1.6);
      else if (a === "out") zoom.scaleBy(t, 1 / 1.6);
      else zoom.transform(t, d3.zoomIdentity);
    });
  });

  Promise.all([d3.csv(CONFIG.dataUrl), d3.json(CONFIG.geoUrl)])
    .then(([csv, g]) => {
      csv.forEach(r => {
        if (!r.support_type) return;               // keep program countries only
        const iso = r.iso3.toUpperCase();
        if (rows.has(iso)) return;                 // reference list repeats some codes
        r.maturity_bucket = maturityBucket(r.maturity_status);
        rows.set(iso, r);
      });
      geo = g;
      renderSummary();
      renderLegend();
      document.querySelectorAll(".js-country-count").forEach(el => { el.textContent = rows.size; });
      refreshCharts();                      // draws whichever maps are visible now
      let t;
      window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(refreshCharts, 200);
      });
    })
    .catch(err => {
      console.error(err);
      summaryEl.textContent = "The map data could not be loaded. Check that the data folder sits next to this page and the site is served over http(s).";
    });

  // ============================================================
  // Stat tiles: count up once, the first time Progress is shown
  // ============================================================
  let counted = false;
  function countUp() {
    if (counted) return;
    counted = true;
    if (reduceMotion) return;
    document.querySelectorAll("[data-count]").forEach(el => {
      const final = el.textContent.trim();
      const m = final.match(/^([\d,]+)(.*)$/); if (!m) return;
      const target = +m[1].replace(/,/g, "");
      const fmt = d3.format(m[1].includes(",") ? ",d" : "d");
      d3.select(el).transition().duration(1000).ease(d3.easeCubicOut)
        .tween("text", () => t => { el.textContent = fmt(Math.round(target * t)) + m[2]; })
        .on("end interrupt", () => { el.textContent = final; });
    });
  }

  // ============================================================
  // Leaders' voices
  // ============================================================
  const peopleEl = document.getElementById("people");
  const quoteEl = document.getElementById("quote");
  const quoteCountry = document.getElementById("quote-country");
  const quoteText = document.getElementById("quote-text");
  const quoteBy = document.getElementById("quote-by");
  const leaderCount = document.getElementById("leader-count");
  let leader = 0;

  peopleEl.innerHTML = LEADERS.map((l, i) =>
    `<li role="presentation"><button type="button" role="tab" id="leader-${i}" aria-controls="quote" aria-selected="false" style="--accent:${l.accent}">` +
    `<b>${l.name}</b><small>${l.role}</small></button></li>`
  ).join("");

  function selectLeader(i, focus) {
    leader = (i + LEADERS.length) % LEADERS.length;
    const l = LEADERS[leader];
    peopleEl.querySelectorAll("button").forEach((b, j) => {
      b.setAttribute("aria-selected", String(leader === j));
      b.tabIndex = leader === j ? 0 : -1;
      if (leader === j && focus) b.focus();
    });
    quoteEl.classList.remove("swap"); void quoteEl.offsetWidth; quoteEl.classList.add("swap");
    quoteCountry.textContent = l.country;
    quoteCountry.style.setProperty("--accent-text", ACCENT_TEXT[l.accent] || l.accent);
    quoteText.textContent = `“${l.quote}”`;
    quoteBy.innerHTML = `<b>${l.name}</b><span>${l.role}, ${l.date}</span>`;
    quoteEl.setAttribute("aria-labelledby", `leader-${leader}`);
    leaderCount.textContent = `${leader + 1} of ${LEADERS.length}`;
  }
  peopleEl.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    selectLeader([...peopleEl.querySelectorAll("button")].indexOf(b));
  });
  peopleEl.addEventListener("keydown", e => {
    const btns = [...peopleEl.querySelectorAll("button")];
    const i = btns.indexOf(document.activeElement); if (i < 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); selectLeader(i + 1, true); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); selectLeader(i - 1, true); }
  });
  // Narrow screens: previous / next instead of the list
  document.getElementById("leader-prev").addEventListener("click", () => selectLeader(leader - 1));
  document.getElementById("leader-next").addEventListener("click", () => selectLeader(leader + 1));
  selectLeader(0);

  // Teaser on the Briefing note view: the opening words of the first quote.
  const teaserQuote = document.getElementById("teaser-quote");
  if (teaserQuote) {
    const words = LEADERS[0].quote.split(" ");
    teaserQuote.textContent = `“${words.slice(0, 17).join(" ").replace(/[,.;:]$/, "")}${words.length > 17 ? "…" : ""}”`;
    document.getElementById("teaser-quote-by").textContent = `${LEADERS[0].name}, ${LEADERS[0].country}`;
  }

  // ============================================================
  // Videos: cards built from each .player's data attributes
  // (click-to-load, privacy-enhanced embed)
  // ============================================================
  const thumbUrl = id => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  const posterHtml = title =>
    `<span class="poster"><img class="poster__logo" src="assets/img/gdf-logo.png" alt=""><span class="poster__title">${esc(title)}</span></span>`;

  // Thumbnail over the designed poster; if YouTube's image fails (or is its 120px
  // "no thumbnail" placeholder), remove it so the poster shows instead.
  function thumbHtml(id) { return `<img class="thumb" data-src="${thumbUrl(id)}" alt="">`; }
  function wireThumbs(root) {
    root.querySelectorAll("img.thumb[data-src]").forEach(img => {
      img.addEventListener("error", () => img.remove());
      img.addEventListener("load", () => { if (img.naturalWidth <= 120) img.remove(); });
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    });
  }

  function coverHtml(p) {
    const title = p.dataset.title || "Video";
    return `<button type="button" class="player__btn" aria-label="Play video: ${esc(title)}">` +
      posterHtml(title) + thumbHtml(p.dataset.yt) + `<span class="player__icon" aria-hidden="true"></span></button>`;
  }

  const players = [...document.querySelectorAll(".player")];
  const showCover = p => { p.innerHTML = coverHtml(p); wireThumbs(p); };

  players.forEach(p => {
    const card = document.createElement("article");
    card.className = "vcard";
    p.replaceWith(card);
    card.append(p);
    const d = p.dataset;
    card.insertAdjacentHTML("beforeend",
      `<div class="vcard__body">` +
      `<h3 class="vcard__title">${esc(d.title || "Video")}</h3>` +
      (d.description ? `<p class="vcard__desc">${esc(d.description)}</p>` : "") +
      `<p class="vcard__meta">` +
      (d.speakers ? `<span><b>Speakers</b> ${esc(d.speakers)}</span>` : "") +
      (d.duration ? `<span><b>Duration</b> ${esc(d.duration)}</span>` : "") +
      `</p></div>`);
    showCover(p);
  });

  document.addEventListener("click", e => {
    const btn = e.target.closest(".player__btn"); if (!btn) return;
    const player = btn.closest(".player");
    const title = player.dataset.title || "Video";
    player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(player.dataset.yt)}?autoplay=1&rel=0" ` +
      `title="${esc(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>`;
  });

  // Stop playback by putting the cover back in place of any loaded player.
  function stopVideos() {
    players.forEach(p => { if (p.querySelector("iframe")) showCover(p); });
  }

  // Videos teaser: the first video's thumbnail (or the poster) with a play icon.
  const teaserVideo = document.getElementById("teaser-video");
  if (teaserVideo && players[0]) {
    teaserVideo.innerHTML = posterHtml(players[0].dataset.title || "Video") + thumbHtml(players[0].dataset.yt) +
      `<span class="player__icon"></span>`;
    wireThumbs(teaserVideo);
  }

  // ============================================================
  // Views and tab navigation (hash routing)
  // #briefing (default), #progress, #leaders, #videos
  // ============================================================
  const SITE_NAME = "GDF Mobile Phone Data Program";
  const ROUTES = {
    briefing: "Briefing note",
    progress: "Progress at a glance",
    leaders: "Country leaders",
    videos: "Team videos",
  };
  const DEFAULT_ROUTE = "briefing";
  const tabs = [...document.querySelectorAll('.tabs__list [role="tab"]')];
  const tabList = document.querySelector(".tabs__list");
  let current = null;

  function routeFromHash() {
    const r = location.hash.replace(/^#/, "");
    return Object.prototype.hasOwnProperty.call(ROUTES, r) ? r : null;
  }

  // Scroll the tab row (not the page) so the given tab is fully visible.
  function revealTab(tab) {
    const left = tab.offsetLeft - tabList.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < tabList.scrollLeft) tabList.scrollLeft = left - 8;
    else if (right > tabList.scrollLeft + tabList.clientWidth) tabList.scrollLeft = right - tabList.clientWidth + 8;
  }

  function showView(route, { initial = false } = {}) {
    if (route === current) return;
    const previous = current;
    current = route;

    tabs.forEach(tab => {
      const on = tab.dataset.route === route;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
      if (on) revealTab(tab);
    });

    if (previous === "videos") stopVideos();
    if (previous === "progress") hideTip();
    refreshCharts();                         // draw maps that just became visible
    if (route === "progress") countUp();

    document.title = `${ROUTES[route]} | ${SITE_NAME}`;
    if (initial) return;                     // on first load, leave focus and scroll to the browser
    window.scrollTo({ top: 0, behavior: "instant" });
    const heading = document.querySelector(`#view-${route} [tabindex="-1"]`);
    if (heading) heading.focus({ preventScroll: true });
  }

  window.addEventListener("hashchange", () => {
    const route = routeFromHash();
    if (!route) { history.replaceState(null, "", `#${DEFAULT_ROUTE}`); }
    showView(route || DEFAULT_ROUTE);
  });

  // Tabs change the hash, so back/forward and deep links all go through hashchange.
  tabs.forEach(tab => tab.addEventListener("click", () => {
    if (tab.dataset.route === current) return;
    location.hash = tab.dataset.route;
  }));

  // Arrow keys, Home and End move focus between tabs; Enter or Space opens the focused tab.
  tabList.addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    let next = null;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    tabs[next].focus({ preventScroll: true });
    revealTab(tabs[next]);
  });

  const initialRoute = routeFromHash();
  if (location.hash && !initialRoute) history.replaceState(null, "", `#${DEFAULT_ROUTE}`);
  showView(initialRoute || DEFAULT_ROUTE, { initial: true });
})();
