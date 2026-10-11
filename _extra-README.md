# Executive briefing microsite

A short briefing site for executives on the Global Data Facility Mobile Phone
Data Program. It's plain HTML, CSS and JavaScript with no build step, and the
portal's Jupyter Book build copies it to the live site unchanged.

## Versions

Each folder here is one version of the site and publishes at its own address:

| Folder | Live at | Status |
|---|---|---|
| `briefing/` | https://worldbank.github.io/GDF-MPD/briefing/ | Working draft (v1). This is the link shared with executives. |
| `briefing-v2/` | https://worldbank.github.io/GDF-MPD/briefing-v2/ | Draft v2 |
| `briefing-v3/` | https://worldbank.github.io/GDF-MPD/briefing-v3/ | Draft v3 |

New ideas go into a new version folder, so earlier versions stay untouched for
comparison. When a version is approved, its contents are copied into
`briefing/`, so the link executives already have never changes.

**Edit only the latest version folder** unless you've agreed otherwise.

## Where the text lives

Almost all the wording is in **`index.html`**. The leaders' quotes and a few
labels are in **`assets/js/site.js`**. On GitHub, open the file and press
Ctrl+F (Cmd+F on a Mac) to search for the names below.

### Overview tab (landing page): `index.html`

| What | Search for |
|---|---|
| Date line above the headline | `hero__kicker` |
| Main headline | `hero__title` |
| Opening paragraph | `hero__lede` |
| Caption under the small map | `minimap__caption` |
| Titles of the three cards | `teaser__title` |
| Captions of the three cards | `teaser__text` |

### Other tabs: `index.html`

| What | Search for |
|---|---|
| Tab names | `role="tab"` (also change them in `site.js`; see below) |
| Progress at a glance heading | `glance-title` |
| The four stat numbers and their labels | `tile__num`, `tile__label` |
| Map heading | `map-title` |
| Leaders' section heading | `voices-title` |
| Video section heading and intro | `video-title`, `video__sub` |
| Video title, speakers, running time | `data-title`, `data-speakers`, `data-duration` |
| Footer text | `class="foot` |
| Link preview shown in email and Teams | `<title>`, `og:title`, `og:description` |

### `assets/js/site.js`

| What | Search for |
|---|---|
| Leaders' quotes, names, titles, countries and dates | `const LEADERS` |
| Map legend labels | `label: "` |
| Sentence under the map heading ("56 countries across …") | `summaryEl.textContent` |
| Tab names in the browser's title bar | `ROUTES` |

The quote previewed on the landing-page card is taken automatically from the
first entry in `LEADERS`.

## Checking the country data

The map is drawn from one spreadsheet, saved as a CSV file (it opens in Excel):

**[`briefing-v2/data/country_support.csv`](https://github.com/worldbank/GDF-MPD/blob/main/_extra/briefing-v2/data/country_support.csv)**

GitHub shows it as a table you can search. To open it in Excel, click
**"Download raw file"** (the download icon above the table).

It lists every country, with these columns:

| Column | What it holds |
|---|---|
| `country_name`, `iso3` | Country name and three-letter code. Don't change these; they link each row to the map. |
| `continent`, `wbg_region` | Continent, and World Bank region code (AFE, AFW, EAP, ECA, LAC, MENA, SAR, NAC) |
| `support_type` | `grants`, `in-kind`, `research` or `expressed interest`. **Blank = not in the program.** |
| `maturity_status` | `Pre-Foundation`, `Foundation` or `Practitioner` (as in the briefing note) |
| `mou_status` | MOU / data-sharing status, copied from the briefing note |

Only the 56 rows with a `support_type` appear on the map. To find them
quickly in Excel, filter `support_type` to exclude blanks.

**Please check in particular:**
- that each program country has the right `support_type` and
  `maturity_status`
- the `mou_status` wording, which appears in the map's pop-ups and is visible
  to anyone who opens the site

**To correct the data**, either:
- tell the team which rows to change, or
- edit the file in Excel and save it with **File > Save As > "CSV UTF-8
  (Comma delimited)"**. Plain "CSV" breaks the accents in names like
  Côte d'Ivoire and São Tomé and Príncipe. Keep the column names and order
  exactly as they are.

Each version folder has its own copy of this file (`briefing/data/`,
`briefing-v2/data/`, …), and they're currently identical. A correction needs
to go into every version that's in use.

## Rules for safe editing

- **Change only the text between the tags.** In
  `<span class="teaser__title">Progress at a glance</span>`, edit only
  "Progress at a glance".
- **Keep `<b>…</b>` tags** around words that should stay bold.
- **Tab names live in two places:** the tab buttons in `index.html` and
  `ROUTES` in `site.js`. Change both.
- **Don't type the country count (56).** Anything inside
  `<span class="js-country-count">` is filled in automatically from the map
  data.
- **Quotes in `site.js`** sit inside straight double quotes (`"…"`). If the
  text itself needs quotation marks, use curly ones (“ ”), otherwise the page
  breaks.
- **Stat numbers:** keep the current format ("2,700+" is fine). The count-up
  animation reads the number from the text.
- **Leave the `data/` and `assets/` folders alone** unless you're
  deliberately changing the map data, styles or code.

## Making a change

1. Open the file on GitHub and click the pencil icon.
2. Edit the text.
3. Choose **"Create a new branch for this commit and start a pull request"**.
4. Once the pull request is merged into `main`, the site updates within a few
   minutes.

## Previewing before you merge (optional)

From the repository root:

```bash
jupyter-book build . --config docs/_config.yml --toc docs/_toc.yml
cd _build/html
python -m http.server 8000
```

Then open `http://localhost:8000/briefing-v3/` (or the version you edited).
Opening `index.html` directly from disk won't load the map; it needs the
local server.
