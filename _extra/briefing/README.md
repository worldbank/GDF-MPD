# GDF-MPD status briefing microsite

A single-page briefing for executives: progress at a glance, an interactive
country map, the briefing note summary, leaders' quotes and a team video.
Plain HTML, CSS and JS (D3 v7 and Poppins are bundled locally). There's no build step.

## Folder layout

```
briefing/
  index.html                  page content (edit text here)
  assets/css/site.css         styles and brand colours
  assets/js/site.js           map, quotes, video; CONFIG block at the top
  assets/vendor/d3.min.js     D3 v7.9.0
  assets/fonts/               Poppins (woff2)
  data/country_support.csv    program countries (support type, maturity, MOU, region)
  data/world_boundaries.geojson   PLACEHOLDER map; replace with WBG boundaries
```

## Add it to the Sphinx / Jupyter Book site

Sphinx only publishes files it builds, so copy the folder in with `html_extra_path`.
That option copies the *contents* of each listed folder to the site root, so give
`briefing/` a parent folder:

```
<book or docs root>/_extra/briefing/   <- this folder
```

Then add **one** of these, depending on how the site is configured:

- Jupyter Book (`_config.yml`):
  ```yaml
  sphinx:
    config:
      html_extra_path: ["_extra"]
  ```
- Plain Sphinx (`conf.py`):
  ```python
  html_extra_path = ["_extra"]
  ```

After the next build and deploy, the page is live at
`https://worldbank.github.io/GDF-MPD/briefing/`.

If you'd rather not touch the config, you can commit `briefing/` directly to the
`gh-pages` branch, but the next deploy may delete it unless the workflow keeps
existing files.

## Swap in the WBG official boundaries

1. Simplify the GeoJSON so the page loads fast (aim for under 2 MB):
   ```bash
   npx mapshaper WB_boundaries.geojson -simplify 4% keep-shapes \
     -o precision=0.01 world_boundaries.geojson
   ```
2. Save it as `data/world_boundaries.geojson`, replacing the placeholder.
3. Each country feature needs an ISO3 code. The page looks for these properties,
   in order: `ISO_A3`, `WB_A3`, `ISO3`, `iso3`, `ISO_3`, `ISO3_CODE`. If your file
   uses another name, add it to `CONFIG.geoIsoFields` in `assets/js/site.js`.
   Features without a code (disputed areas, for example) are drawn in grey.

Small states that are hard to see (Seychelles, Mauritius, Maldives and others)
get a dot marker automatically.

## Updating content

- **Numbers in the tiles and briefing text**: edit `index.html`.
- **Country data**: replace `data/country_support.csv`, keeping the same columns
  (`country_name, iso3, continent, wbg_region, support_type, maturity_status, mou_status`).
  Rows with an empty `support_type` are treated as not in the program.
- **Leaders' quotes**: edit the `LEADERS` list in `assets/js/site.js`.
- **Video**: change `data-yt="..."` on the `#player` element in `index.html`.

## Preview locally

The map loads its data with `fetch`, so open the page through a local server,
not by double-clicking the file:

```bash
python -m http.server 8000      # run from the folder that contains briefing/
# then open http://localhost:8000/briefing/
```

The "Knowledge portal" links point to `../homepage.html`, so they resolve once
the page is deployed alongside the portal.
