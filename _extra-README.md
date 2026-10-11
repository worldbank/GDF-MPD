# Spain Briefing Microsite

I have mostly vibe-coded this. It's plain HTML, CSS and JavaScript with no build step, and the portal's Jupyter Book build copies it to the live site unchanged.

## Versions

Each folder here is one version of the site and publishes at its own address:

| Folder | Live at | Status |
|---|---|---|
| `briefing/` | https://worldbank.github.io/GDF-MPD/briefing/ | Working draft (v1). This is the link shared with executives. |
| `briefing-v2/` | https://worldbank.github.io/GDF-MPD/briefing-v2/ | Draft v2 |
| `briefing-v3/` | https://worldbank.github.io/GDF-MPD/briefing-v3/ | Draft v3 |


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

**[`briefing-v2/data/country_support.csv`](https://github.com/worldbank/GDF-MPD/blob/main/_extra/briefing-v2/data/country_support.csv)**

It lists every country, with these columns:

| Column | What it holds |
|---|---|
| `country_name`, `iso3` | Country name and three-letter code. Don't change these; they link each row to the map. |
| `continent`, `wbg_region` | Continent, and World Bank region code (AFE, AFW, EAP, ECA, LAC, MENA, SAR, NAC) |
| `support_type` | `grants`, `in-kind`, `research` or `expressed interest`. **Blank = not in the program.** |
| `maturity_status` | `Pre-Foundation`, `Foundation` or `Practitioner` (as in the briefing note) |
| `mou_status` | MOU / data-sharing status, copied from the briefing note |



Each version folder has its own copy of this file (`briefing/data/`,
`briefing-v2/data/`, …), and they're currently identical. A correction needs
to go into every version that's in use.



