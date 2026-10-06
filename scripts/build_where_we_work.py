"""Build the maps, charts and tables for the "Where We Work" section.

Reads the CSVs in ``data/where-we-work/`` and writes:

- interactive maps (Folium) and charts (Plotly) to ``_static/where-we-work/``
- markdown snippets (KPI tiles, tables) to ``docs/where-we-work/_gen_*.md``

The pages in ``docs/where-we-work/`` embed the HTML files with iframes and pull the
snippets in with ``{include}``. All outputs are generated, so they are git-ignored;
edit the CSVs, not the outputs.

Usage (from the repository root)::

    python scripts/build_where_we_work.py
"""

from __future__ import annotations

import html
import json
import math
import os
import sys
from pathlib import Path

import folium
import pandas as pd
import plotly.graph_objects as go
import pycountry

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "where-we-work"
STATIC_OUT = ROOT / "_static" / "where-we-work"
DOCS_OUT = ROOT / "docs" / "where-we-work"

ACTIVITY_TYPES = ["training", "workshop", "technical_assistance"]
MILESTONES = {
    "maturity_assessment": "Maturity assessment",
    "mou_signed": "MoU signed",
    "data_received": "Data received",
    "indicators_produced": "Indicators produced",
    "published": "Published / used",
}

# Brand-derived colours (see _static/custom.css)
TEAL = "#2a8f90"
ORANGE = "#e5861a"
PURPLE = "#5b3a8c"
LAND = "#e3e6e8"
OCEAN = "#f4f8f9"
INK = "#2b2b2b"
MUTED = "#6b6b6b"
# Ordinal ramp for the implementation stages (light = early, dark = institutionalised)
STAGE_COLORS = ["#a6dbdb", "#7cc6c6", "#53b1b2", "#2f9a9b", "#237f80", "#17625f", "#0d4544"]
# Sequential purple ramp for the number of TA missions (0, 1, 2, 3, 4+)
TA_COLORS = ["#ece8f3", "#c9bce0", "#a08bc7", "#7a5fac", PURPLE]
TYPE_COLORS = {"training": TEAL, "workshop": ORANGE, "technical_assistance": PURPLE}
TYPE_LABELS = {
    "training": "Training",
    "workshop": "Workshop",
    "technical_assistance": "Technical assistance",
}
BOUNDARY_SOURCE = "Natural Earth"  # replaced by the "source" recorded in boundaries.geojson
SMALL_COUNTRY_AREA = 6  # bbox area (sq. degrees) below which a marker is added

FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


# --------------------------------------------------------------------------------------
# Loading & validation
# --------------------------------------------------------------------------------------
def load() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    countries = pd.read_csv(DATA / "countries.csv", dtype=str).fillna("")
    activities = pd.read_csv(DATA / "activities.csv", dtype=str).fillna("")
    stages = pd.read_csv(DATA / "stages.csv", dtype={"stage": int}).fillna("")
    boundaries = json.loads((DATA / "boundaries.geojson").read_text())
    return countries, activities, stages, boundaries


def validate(countries, activities, stages, boundaries) -> None:
    errors = []
    shapes = {f["properties"]["iso3"] for f in boundaries["features"]}
    stage_ids = set(stages["stage"])

    if len(stages) > len(STAGE_COLORS):
        errors.append(f"stages.csv: at most {len(STAGE_COLORS)} stages are supported")
    for i, r in countries.iterrows():
        row = f"countries.csv row {i + 2} ({r['iso3'] or '?'})"
        if pycountry.countries.get(alpha_3=r["iso3"]) is None:
            errors.append(f"{row}: '{r['iso3']}' is not a valid ISO3 code")
        elif r["iso3"] not in shapes:
            errors.append(f"{row}: no boundary for '{r['iso3']}' in boundaries.geojson")
        if not r["stage"].isdigit() or int(r["stage"]) not in stage_ids:
            errors.append(f"{row}: stage '{r['stage']}' is not defined in stages.csv")
        if r["cohort"] not in {"1", "2"}:
            errors.append(f"{row}: cohort must be 1 or 2, got '{r['cohort']}'")
        for col in MILESTONES:
            if r[col].lower() not in {"yes", "no", ""}:
                errors.append(f"{row}: {col} must be yes/no, got '{r[col]}'")
    dupes = countries["iso3"][countries["iso3"].duplicated()].tolist()
    if dupes:
        errors.append(f"countries.csv: duplicate countries {dupes}")

    known = set(countries["iso3"])
    for i, r in activities.iterrows():
        row = f"activities.csv row {i + 2} ({r['event_id'] or '?'})"
        if r["iso3"] not in known:
            errors.append(f"{row}: country '{r['iso3']}' is not listed in countries.csv")
        if r["type"] not in ACTIVITY_TYPES:
            errors.append(f"{row}: type must be one of {ACTIVITY_TYPES}, got '{r['type']}'")
        for col in ("date_start", "date_end"):
            if r[col] and pd.isna(pd.to_datetime(r[col], errors="coerce")):
                errors.append(f"{row}: {col} '{r[col]}' is not a date (use YYYY-MM-DD)")
        if not r["date_start"]:
            errors.append(f"{row}: date_start is required")
        for col in ("participants", "female_participants"):
            if r[col] and not r[col].isdigit():
                errors.append(f"{row}: {col} must be a whole number, got '{r[col]}'")
        if r["link"] and not r["link"].startswith("http"):
            if not (ROOT / f"{r['link']}.md").exists():
                errors.append(f"{row}: link '{r['link']}' is not a URL or a page in this book")

    if errors:
        sys.exit("Invalid Where We Work data:\n  - " + "\n  - ".join(errors))


def prepare(countries, activities, stages):
    c = countries.copy()
    c["stage"] = c["stage"].astype(int)
    c["cohort"] = c["cohort"].astype(int)
    labels = dict(zip(stages["stage"], stages["label"]))
    c["stage_label"] = c["stage"].map(labels)
    for col in MILESTONES:
        c[col] = c[col].str.lower().eq("yes")

    a = activities.copy()
    a["date_start"] = pd.to_datetime(a["date_start"])
    a["date_end"] = pd.to_datetime(a["date_end"].replace("", None)).fillna(a["date_start"])
    for col in ("participants", "female_participants"):
        a[col] = pd.to_numeric(a[col], errors="coerce")
    a = a.merge(c[["iso3", "country"]], on="iso3", how="left")
    a = a.sort_values(["date_start", "country"])
    return c, a


# --------------------------------------------------------------------------------------
# Geometry helpers
# --------------------------------------------------------------------------------------
def _ring_area_centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if a == 0:
        return 0.0, ring[0]
    return abs(a / 2), (cx / (3 * a), cy / (3 * a))


def geometry_info(feature):
    """Return (lat, lon) of the largest polygon's centroid, bbox area and bounds."""
    g = feature["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    best = max((_ring_area_centroid(p[0]) for p in polys), key=lambda t: t[0])
    xs = [x for p in polys for x, _ in p[0]]
    ys = [y for p in polys for _, y in p[0]]
    bbox_area = (max(xs) - min(xs)) * (max(ys) - min(ys))
    return (best[1][1], best[1][0]), bbox_area, [[min(ys), min(xs)], [max(ys), max(xs)]]


# --------------------------------------------------------------------------------------
# Maps
# --------------------------------------------------------------------------------------
def doc_href(link: str, from_dir: Path) -> str:
    """Turn a CSV link (URL or book page path) into an href relative to ``from_dir``."""
    if link.startswith("http"):
        return link
    target = ROOT / f"{link}.html"
    return Path(os.path.relpath(target, from_dir)).as_posix()


def link_html(link: str) -> str:
    if not link:
        return ""
    href = html.escape(doc_href(link, STATIC_OUT))
    target = "_blank" if link.startswith("http") else "_top"
    return f'<a href="{href}" target="{target}" rel="noopener">Details&nbsp;&rarr;</a>'


def fmt_dates(start, end) -> str:
    if start.date() == end.date():
        return start.strftime("%d %b %Y")
    if (start.year, start.month) == (end.year, end.month):
        return f"{start.day}–{end.day} {end.strftime('%b %Y')}"
    return f"{start.strftime('%d %b')} – {end.strftime('%d %b %Y')}"


POPUP_CSS = f"""
<style>
.leaflet-container {{ background: {OCEAN}; font-family: {FONT}; }}
.www-pop {{ font-size: 13px; color: {INK}; line-height: 1.4; }}
.www-pop h4 {{ margin: 0 0 4px; font-size: 15px; }}
.www-pop .sub {{ color: {MUTED}; margin-bottom: 6px; }}
.www-pop table {{ border-collapse: collapse; width: 100%; }}
.www-pop td {{ padding: 3px 4px; border-top: 1px solid #eee; vertical-align: top; }}
.www-pop td.d {{ white-space: nowrap; color: {MUTED}; }}
.www-pop a {{ color: {TEAL}; font-weight: 600; text-decoration: none; }}
.www-pop .chip {{ display: inline-block; padding: 1px 8px; border-radius: 10px; color: #fff; font-size: 12px; }}
.www-legend {{ position: fixed; left: 12px; bottom: 16px; z-index: 1000; background: rgba(255,255,255,.95);
  padding: 8px 10px; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,.2); font: 12px/1.5 {FONT}; color: {INK}; }}
.www-legend b {{ display: block; margin-bottom: 4px; }}
.www-legend i {{ display: inline-block; width: 14px; height: 10px; margin-right: 6px; border-radius: 2px; vertical-align: middle; }}
.www-legend .dot {{ border-radius: 50%; background: {TEAL}; border: 1.5px solid #fff; box-shadow: 0 0 0 1px {TEAL}; }}
.www-note {{ position: fixed; right: 10px; top: 8px; z-index: 1000; font: 11px {FONT}; color: {MUTED}; }}
</style>
"""


def base_map(features_by_iso, highlight_isos):
    """Blank world map (no tiles) zoomed to ``highlight_isos``, which are drawn separately."""
    bounds = [geometry_info(features_by_iso[i])[2] for i in highlight_isos]
    south = min(b[0][0] for b in bounds)
    west = min(b[0][1] for b in bounds)
    north = max(b[1][0] for b in bounds)
    east = max(b[1][1] for b in bounds)
    m = folium.Map(tiles=None, min_zoom=2, max_zoom=8, zoom_snap=0.5, control_scale=False)
    m.fit_bounds([[south, west], [north, east]], padding=(10, 10))
    m.get_root().header.add_child(folium.Element(POPUP_CSS))
    folium.GeoJson(
        {"type": "FeatureCollection", "features": [f for i, f in features_by_iso.items() if i not in set(highlight_isos)]},
        style_function=lambda f: {"fillColor": LAND, "color": "#ffffff", "weight": 0.6, "fillOpacity": 1},
        control=False,
        interactive=False,
    ).add_to(m)
    m.get_root().html.add_child(
        folium.Element(f'<div class="www-note">Illustrative data · boundaries: {html.escape(BOUNDARY_SOURCE)}</div>')
    )
    return m


def add_country(
    m, feature, fill, popup_html, tooltip, force_marker=False, marker_radius=6, marker_color=None, stroke="#ffffff"
):
    folium.GeoJson(
        feature,
        style_function=lambda f, fill=fill, stroke=stroke: {"fillColor": fill, "color": stroke, "weight": 0.8, "fillOpacity": 1},
        highlight_function=lambda f: {"weight": 2.5, "color": INK},
        tooltip=tooltip,
        popup=folium.Popup(popup_html, max_width=360),
        control=False,
    ).add_to(m)
    (lat, lon), area, _ = geometry_info(feature)
    if force_marker or area < SMALL_COUNTRY_AREA:
        folium.CircleMarker(
            location=(lat, lon),
            radius=marker_radius,
            color=stroke,
            weight=1.5,
            fill=True,
            fill_color=marker_color or fill,
            fill_opacity=1,
            tooltip=tooltip,
            popup=folium.Popup(popup_html, max_width=360),
        ).add_to(m)


def legend(title, items):
    rows = "".join(f'<div><i style="background:{c}"></i>{html.escape(t)}</div>' for c, t in items)
    return folium.Element(f'<div class="www-legend"><b>{html.escape(title)}</b>{rows}</div>')


def status_map(c, stages, features):
    m = base_map(features, c["iso3"])
    for _, r in c.iterrows():
        color = STAGE_COLORS[r["stage"]]
        done = "".join(
            f"<tr><td>{'✔' if r[k] else '○'}</td><td>{v}</td></tr>" for k, v in MILESTONES.items()
        )
        uses = f"<div><b>Use cases:</b> {html.escape(r['use_cases'])}</div>" if r["use_cases"] else ""
        pop = (
            f'<div class="www-pop"><h4>{html.escape(r["country"])}</h4>'
            f'<div class="sub">Cohort {r["cohort"]} · {html.escape(r["focal_institution"])}</div>'
            f'<div><span class="chip" style="background:{color};color:{"#fff" if r["stage"] >= 4 else INK}">'
            f'Stage {r["stage"]}: {html.escape(r["stage_label"])}</span>'
            f' <span class="sub">since {pd.to_datetime(r["stage_date"]).strftime("%b %Y")}</span></div>'
            f"<table style='margin-top:6px'>{done}</table>{uses}</div>"
        )
        add_country(m, features[r["iso3"]], color, pop, f"{r['country']} — {r['stage_label']}")
    items = [(STAGE_COLORS[s], f"{s}. {lab}") for s, lab in zip(stages["stage"], stages["label"])]
    m.get_root().html.add_child(legend("Implementation stage", items))
    return m


def activity_popup(country, rows, cols):
    body = ""
    for _, a in rows.iterrows():
        extra = ""
        if "participants" in cols and pd.notna(a["participants"]):
            extra = f"<br><span class='sub'>{int(a['participants'])} participants · {a['mode']}</span>"
        if "purpose" in cols:
            extra = f"<br><span class='sub'>{html.escape(a['purpose'])} · {a['mode']}</span>"
        body += (
            f"<tr><td class='d'>{fmt_dates(a['date_start'], a['date_end'])}</td>"
            f"<td>{html.escape(a['title'] if 'purpose' not in cols else TYPE_LABELS[a['type']])}{extra}"
            f"{'<br>' + link_html(a['link']) if a['link'] else ''}</td></tr>"
        )
    return f'<div class="www-pop"><h4>{html.escape(country)}</h4><table>{body}</table></div>'


def trainings_map(c, a, features):
    tr = a[a["type"].isin(["training", "workshop"])]
    m = base_map(features, c["iso3"])
    counts = tr.groupby("iso3").size()
    for _, r in c.iterrows():
        rows = tr[tr["iso3"] == r["iso3"]]
        n = int(counts.get(r["iso3"], 0))
        if n == 0:
            continue
        people = int(rows["participants"].sum())
        pop = activity_popup(r["country"], rows, ["participants"])
        pop = pop.replace(
            "</h4>", f"</h4><div class='sub'>{n} trainings &amp; workshops · {people} participants</div>", 1
        )
        add_country(
            m,
            features[r["iso3"]],
            "#cfe9e9",
            pop,
            f"{r['country']} — {n} trainings & workshops",
            force_marker=True,
            marker_radius=5 + 3.5 * math.sqrt(n),
            marker_color=TEAL,
        )
    sizes = sorted({1, max(int(counts.median()), 2), int(counts.max())})
    rows = "".join(
        f'<div><i class="dot" style="width:{2 * (5 + 3.5 * math.sqrt(s))}px;height:{2 * (5 + 3.5 * math.sqrt(s))}px"></i>{s}</div>'
        for s in sizes
    )
    m.get_root().html.add_child(
        folium.Element(
            f'<div class="www-legend"><b>Trainings &amp; workshops</b>{rows}'
            f'<div class="sub" style="color:{MUTED};margin-top:4px">Click a circle for details</div></div>'
        )
    )
    return m


def ta_bin(n):
    return min(n, 4)


def ta_map(c, a, features):
    ta = a[a["type"] == "technical_assistance"]
    m = base_map(features, c["iso3"])
    counts = ta.groupby("iso3").size()
    for _, r in c.iterrows():
        n = int(counts.get(r["iso3"], 0))
        rows = ta[ta["iso3"] == r["iso3"]]
        if n:
            pop = activity_popup(r["country"], rows, ["purpose"])
            pop = pop.replace("</h4>", f"</h4><div class='sub'>{n} technical assistance missions</div>", 1)
        else:
            pop = f'<div class="www-pop"><h4>{html.escape(r["country"])}</h4><div class="sub">No missions yet</div></div>'
        stroke = "#ffffff" if n else "#a08bc7"  # outline engaged countries with no missions yet
        add_country(m, features[r["iso3"]], TA_COLORS[ta_bin(n)], pop, f"{r['country']} — {n} missions", stroke=stroke)
    items = [(TA_COLORS[i], lab) for i, lab in enumerate(["None yet", "1", "2", "3", "4 or more"])]
    m.get_root().html.add_child(legend("TA missions", items))
    return m


# --------------------------------------------------------------------------------------
# Charts
# --------------------------------------------------------------------------------------
def style(fig, height):
    fig.update_layout(
        height=height,
        margin=dict(l=10, r=20, t=10, b=10),
        font=dict(family=FONT, size=13, color=INK),
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        hoverlabel=dict(bgcolor="#ffffff", font=dict(family=FONT, color=INK)),
        legend=dict(orientation="h", y=1.02, yanchor="bottom", x=0, title=None),
    )
    fig.update_xaxes(gridcolor="#eeeeee", zeroline=False, linecolor="#cccccc")
    fig.update_yaxes(gridcolor="#eeeeee", zeroline=False)
    return fig


def pipeline_chart(c, stages):
    labels = [f"{s}. {lab}" for s, lab in zip(stages["stage"], stages["label"])]
    counts, hovers = [], []
    for s in stages["stage"]:
        names = c.loc[c["stage"] == s, "country"].sort_values().tolist()
        counts.append(len(names))
        hovers.append("<br>".join(names) or "—")
    fig = go.Figure(
        go.Bar(
            x=counts,
            y=labels,
            orientation="h",
            marker=dict(color=STAGE_COLORS[: len(labels)], line=dict(color="#ffffff", width=2), cornerradius=4),
            text=counts,
            textposition="outside",
            customdata=hovers,
            hovertemplate="<b>%{y}</b><br>%{x} countries<br><br>%{customdata}<extra></extra>",
        )
    )
    fig.update_yaxes(autorange="reversed", showgrid=False)
    fig.update_xaxes(title="Number of countries", dtick=1 if max(counts) <= 10 else None)
    return style(fig, 60 + 44 * len(labels))


def milestone_chart(c):
    d = c.sort_values(["stage", "country"], ascending=[False, True])
    ys = [f"{n} (C{k})" for n, k in zip(d["country"], d["cohort"])]
    fig = go.Figure()
    for done, color, symbol, name in [(True, TEAL, "circle", "Done"), (False, "#b5b5b5", "circle-open", "Not yet")]:
        xs, yy = [], []
        for y, (_, r) in zip(ys, d.iterrows()):
            for k, lab in MILESTONES.items():
                if r[k] == done:
                    xs.append(lab)
                    yy.append(y)
        fig.add_trace(
            go.Scatter(
                x=xs,
                y=yy,
                mode="markers",
                name=name,
                marker=dict(size=13, color=color, symbol=symbol, line=dict(width=2, color=color)),
                hovertemplate=f"<b>%{{y}}</b><br>%{{x}}: {name.lower()}<extra></extra>",
            )
        )
    fig.update_xaxes(
        side="top",
        categoryorder="array",
        categoryarray=list(MILESTONES.values()),
        showgrid=False,
        tickangle=0,
        tickvals=list(MILESTONES.values()),
        ticktext=[v.replace(" ", "<br>", 1) for v in MILESTONES.values()],
    )
    fig.update_yaxes(categoryorder="array", categoryarray=ys[::-1])
    fig = style(fig, 80 + 24 * len(ys))
    fig.update_layout(legend=dict(y=-0.02, yanchor="top"))
    return fig


def timeline_chart(a, types):
    d = a[a["type"].isin(types)]
    order = sorted(d["country"].unique(), reverse=True)
    fig = go.Figure()
    for t in types:
        s = d[d["type"] == t]
        detail = s["purpose"] if t == "technical_assistance" else s["title"]
        fig.add_trace(
            go.Scatter(
                x=s["date_start"],
                y=s["country"],
                mode="markers",
                name=TYPE_LABELS[t],
                marker=dict(size=11, color=TYPE_COLORS[t], line=dict(width=1.5, color="#ffffff")),
                customdata=list(zip(detail, [fmt_dates(x, y) for x, y in zip(s["date_start"], s["date_end"])], s["mode"])),
                hovertemplate="<b>%{y}</b><br>%{customdata[0]}<br>%{customdata[1]} · %{customdata[2]}<extra></extra>",
            )
        )
    fig.update_yaxes(categoryorder="array", categoryarray=order, showgrid=True)
    fig.update_xaxes(dtick="M3", tickformat="%b<br>%Y", tickangle=0)
    fig = style(fig, 90 + 22 * len(order))
    if len(types) == 1:
        fig.update_layout(showlegend=False)
    return fig


# --------------------------------------------------------------------------------------
# Markdown snippets
# --------------------------------------------------------------------------------------
def md_link(link: str) -> str:
    if not link:
        return ""
    if link.startswith("http"):
        return f"[Details]({link})"
    return f"[Details]({Path(os.path.relpath(ROOT / f'{link}.md', DOCS_OUT)).as_posix()})"


def kpis(c, a) -> str:
    tr = a[a["type"].isin(["training", "workshop"])]
    people = int(tr["participants"].sum())
    women = int(tr["female_participants"].sum())
    tiles = [
        (len(c), "countries engaged"),
        (tr["event_id"].nunique(), "trainings & workshops delivered"),
        (f"{people:,}", f"people trained ({round(100 * women / people) if people else 0}% women)"),
        (int((a["type"] == "technical_assistance").sum()), "technical assistance missions"),
        (int(c["indicators_produced"].sum()), "countries producing indicators"),
    ]
    out = "::::{grid} 2 3 5 5\n:gutter: 2\n\n"
    for value, label in tiles:
        out += f":::{{grid-item-card}}\n:class-card: www-kpi\n\n<span class=\"www-kpi-value\">{value}</span>\n\n{label}\n:::\n\n"
    return out + "::::\n"


def table(df, columns) -> str:
    head = "| " + " | ".join(columns) + " |\n|" + "---|" * len(columns) + "\n"
    rows = "".join("| " + " | ".join(str(v).replace("|", "/") for v in r) + " |\n" for r in df.itertuples(index=False))
    return head + rows


def status_table(c) -> str:
    d = c.sort_values(["stage", "country"], ascending=[False, True])
    df = pd.DataFrame(
        {
            "Country": d["country"],
            "Cohort": d["cohort"],
            "Stage": [f"{s}. {lab}" for s, lab in zip(d["stage"], d["stage_label"])],
            "Since": pd.to_datetime(d["stage_date"]).dt.strftime("%b %Y"),
            "Use cases": d["use_cases"],
        }
    )
    return table(df, list(df.columns))


def activity_table(a, types) -> str:
    d = a[a["type"].isin(types)].sort_values(["date_start", "country"], ascending=[False, True])
    df = pd.DataFrame(
        {
            "Dates": [fmt_dates(x, y) for x, y in zip(d["date_start"], d["date_end"])],
            "Country": d["country"],
        }
    )
    if "technical_assistance" in types:
        df["Purpose"] = d["purpose"].values
        df["Mode"] = d["mode"].values
    else:
        df["Activity"] = [f"{TYPE_LABELS[t]}: {x}" for t, x in zip(d["type"], d["title"])]
        df["Participants"] = d["participants"].map(lambda v: "" if pd.isna(v) else int(v)).values
        df["Mode"] = d["mode"].values
        df["Link"] = d["link"].map(md_link).values
    return table(df, list(df.columns))


# --------------------------------------------------------------------------------------
def main() -> None:
    global BOUNDARY_SOURCE
    countries, activities, stages, boundaries = load()
    BOUNDARY_SOURCE = boundaries.get("source", BOUNDARY_SOURCE)
    validate(countries, activities, stages, boundaries)
    c, a = prepare(countries, activities, stages)
    features = {f["properties"]["iso3"]: f for f in boundaries["features"]}

    STATIC_OUT.mkdir(parents=True, exist_ok=True)
    DOCS_OUT.mkdir(parents=True, exist_ok=True)
    status_map(c, stages, features).save(STATIC_OUT / "map_status.html")
    trainings_map(c, a, features).save(STATIC_OUT / "map_trainings.html")
    ta_map(c, a, features).save(STATIC_OUT / "map_ta.html")

    charts = {
        "chart_pipeline.html": pipeline_chart(c, stages),
        "chart_milestones.html": milestone_chart(c),
        "chart_trainings_timeline.html": timeline_chart(a, ["training", "workshop"]),
        "chart_ta_timeline.html": timeline_chart(a, ["technical_assistance"]),
    }
    for name, fig in charts.items():
        fig.write_html(STATIC_OUT / name, include_plotlyjs="cdn", full_html=True, config={"displayModeBar": False, "responsive": True})

    snippets = {
        "_gen_kpis.md": kpis(c, a),
        "_gen_status_table.md": status_table(c),
        "_gen_trainings_table.md": activity_table(a, ["training", "workshop"]),
        "_gen_ta_table.md": activity_table(a, ["technical_assistance"]),
    }
    for name, text in snippets.items():
        (DOCS_OUT / name).write_text(text)

    print(f"Built Where We Work: {len(c)} countries, {len(a)} activity rows -> {STATIC_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
