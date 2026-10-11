/* GDF-MPD status briefing microsite. Plain JS + D3 v7, no build step. */
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
    { name: "Maxat Turlubayev", role: "Director General, Kazakhstan National Statistics Office", date: "March 2026",
      quote: "With the mobile phone data approach, we are able to see up to 14 times more visitors than we can with the conventional survey and registry-based approach.", accent: COLORS.orange },
    { name: "Therese Uwimana", role: "Director, Rwanda Statistics, Data Revolution", date: "June 2026",
      quote: "Mobile phone data can help track vulnerable populations in real time to better target the delivery of social assistance.", accent: COLORS.blue },
    { name: "Dr. M. G. Obudho", role: "Director General, Statistics Kenya", date: "June 2026",
      quote: "Kenya will catch countries like Ghana and be a leader in Africa in the use of mobile phone data for statistics.", accent: COLORS.purple },
    { name: "Dr. Raymond Lekobane", role: "Statistician General, Statistics Botswana", date: "June 2026",
      quote: "Mobile phone data is a powerful asset for evidence-based decision making.", accent: COLORS.teal },
    { name: "Batdavaa Batmunkh", role: "Statistician General, Mongolia", date: "March 2026",
      quote: "We are operationalizing mobile phone data to monitor internal population movements and tourism statistics in real time.", accent: COLORS.orange },
  ];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ============================================================
  // Map
  // ============================================================
  const mapEl = document.getElementById("map");
  const tipEl = document.getElementById("map-tip");
  const legendEl = document.getElementById("legend");
  const summaryEl = document.getElementById("map-summary");
  let mode = "support";
  let rows = new Map();   // iso3 -> row
  let geo = null;
  let svg, gRoot, zoom, pingObserver, pinged = false;
  let drawnWidth = 0;     // width the map was last drawn at (0 = not drawn yet)

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

  function colorFor(row) {
    if (!row) return COLORS.land;
    const m = MODES[mode];
    const cat = m.cats.find(c => c.key === row[m.field]);
    return cat ? cat.color : COLORS.land;
  }

  function renderLegend() {
    const m = MODES[mode];
    const counts = d3.rollup([...rows.values()], v => v.length, r => r[m.field]);
    legendEl.innerHTML = m.cats.map(c =>
      `<li><span class="sw" style="background:${c.color}"></span>${c.label} <b>${counts.get(c.key) || 0}</b></li>`
    ).join("") + `<li><span class="sw" style="background:${COLORS.land}"></span>Not in the program</li>`;
  }

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

    // Marker points: centroid of each program country (largest polygon), or a fallback.
    const points = [];
    const seen = new Set();
    feats.forEach(d => {
      if (!rows.has(d.iso) || seen.has(d.iso)) return;
      seen.add(d.iso);
      const c = path.centroid(largestPart(d.f));
      if (!isFinite(c[0])) return;
      points.push({ iso: d.iso, x: c[0], y: c[1], small: path.area(d.f) < CONFIG.smallAreaPx * Math.pow(width / 1100, 2) });
    });
    rows.forEach((row, iso) => {
      if (seen.has(iso) || !FALLBACK_POINTS[iso]) return;
      const p = projection(FALLBACK_POINTS[iso]);
      points.push({ iso, x: p[0], y: p[1], small: true });
    });

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

    if (pinged || reduceMotion) return;
    observePing();
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

  // The map lives in a view that may be hidden, where it has zero width. Draw it the first
  // time it is visible, and redraw only when its width has changed since the last draw.
  function ensureMap() {
    if (!geo) return;                       // data still loading; the loader calls this again
    const w = mapEl.clientWidth;
    if (!w || w === drawnWidth) return;     // hidden, or already drawn at this width
    drawnWidth = w;
    drawMap();
  }

  // One orchestrated moment: a signal sweep west to east when the map first scrolls into view.
  function observePing() {
    if (pingObserver) pingObserver.disconnect();   // a redraw replaces any pending observer
    const io = pingObserver = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      pinged = true;
      const w = mapEl.clientWidth;
      gRoot.selectAll(".ping")
        .attr("stroke", d => colorFor(rows.get(d.iso)))
        .transition()
        .delay(d => (d.x / w) * 1600)
        .duration(1400)
        .ease(d3.easeCubicOut)
        .attrTween("r", () => t => 2 + t * 22)
        .attrTween("opacity", () => t => (t < 0.08 ? t / 0.08 : 1 - t) * 0.9);
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
      const teaserCount = document.getElementById("teaser-countries");
      if (teaserCount) teaserCount.textContent = rows.size;
      ensureMap();                          // draws now only if the Progress view is open
      let t;
      window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(ensureMap, 200);
      });
    })
    .catch(err => {
      console.error(err);
      summaryEl.textContent = "The map data could not be loaded. Check that the data folder sits next to this page and the site is served over http(s).";
    });

  // ============================================================
  // Leaders' voices
  // ============================================================
  const peopleEl = document.getElementById("people");
  const quoteEl = document.getElementById("quote");
  const quoteText = document.getElementById("quote-text");
  const quoteBy = document.getElementById("quote-by");

  peopleEl.innerHTML = LEADERS.map((l, i) =>
    `<li role="presentation"><button type="button" role="tab" id="leader-${i}" aria-controls="quote" aria-selected="false" style="--accent:${l.accent}">` +
    `<b>${l.name}</b><small>${l.role}</small></button></li>`
  ).join("");

  function selectLeader(i, focus) {
    const l = LEADERS[i];
    peopleEl.querySelectorAll("button").forEach((b, j) => {
      b.setAttribute("aria-selected", String(i === j));
      b.tabIndex = i === j ? 0 : -1;
      if (i === j && focus) b.focus();
    });
    quoteEl.classList.remove("swap"); void quoteEl.offsetWidth; quoteEl.classList.add("swap");
    quoteText.textContent = `“${l.quote}”`;
    quoteBy.innerHTML = `<b>${l.name}</b><span>${l.role}, ${l.date}</span>`;
    quoteEl.setAttribute("aria-labelledby", `leader-${i}`);
  }
  peopleEl.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    selectLeader([...peopleEl.querySelectorAll("button")].indexOf(b));
  });
  peopleEl.addEventListener("keydown", e => {
    const btns = [...peopleEl.querySelectorAll("button")];
    const i = btns.indexOf(document.activeElement); if (i < 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); selectLeader((i + 1) % btns.length, true); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); selectLeader((i - 1 + btns.length) % btns.length, true); }
  });
  selectLeader(0);

  // Teaser on the Briefing note view: the opening words of the first quote.
  const teaserQuote = document.getElementById("teaser-quote");
  if (teaserQuote) {
    const words = LEADERS[0].quote.split(" ");
    teaserQuote.textContent = `“${words.slice(0, 17).join(" ").replace(/[,.;:]$/, "")}${words.length > 17 ? "…" : ""}”`;
  }

  // ============================================================
  // Videos (click-to-load, privacy-enhanced embed)
  // Works for every .player on the page: to add a video, copy a .player block
  // in index.html and change its data-yt ID, thumbnail and aria-label.
  // ============================================================
  const players = [...document.querySelectorAll(".player")];
  const playerCovers = new Map(players.map(p => [p, p.innerHTML]));   // the click-to-play cover

  document.addEventListener("click", e => {
    const btn = e.target.closest(".player__btn"); if (!btn) return;
    const player = btn.closest(".player");
    const title = (btn.getAttribute("aria-label") || "Video").replace(/^Play video:\s*/, "");
    player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${player.dataset.yt}?autoplay=1&rel=0" ` +
      `title="${title}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>`;
  });

  // Stop playback by putting the cover back in place of any loaded player.
  function stopVideos() {
    playerCovers.forEach((cover, player) => {
      if (player.querySelector("iframe")) player.innerHTML = cover;
    });
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
  let current = null;

  function routeFromHash() {
    const r = location.hash.replace(/^#/, "");
    return Object.prototype.hasOwnProperty.call(ROUTES, r) ? r : null;
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
      if (on) tab.scrollIntoView({ block: "nearest", inline: "nearest" });   // keep it in the mobile tab row
    });

    if (previous === "videos") stopVideos();
    if (previous === "progress") hideTip();
    if (route === "progress") ensureMap();

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
  document.querySelector(".tabs__list").addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    let next = null;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    tabs[next].focus();
    tabs[next].scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  const initialRoute = routeFromHash();
  if (location.hash && !initialRoute) history.replaceState(null, "", `#${DEFAULT_ROUTE}`);
  showView(initialRoute || DEFAULT_ROUTE, { initial: true });
})();
