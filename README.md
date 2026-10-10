# GeoLeadScraper — Free Google Maps Scraper (Chrome Extension)

**GeoLeadScraper is a free, open-source Google Maps scraper** — a Chrome /
Chromium extension that extracts public business data from **Google Maps**
(plus **Yandex Maps** and **2GIS**) and exports it to **CSV, XLSX or JSON** in
one click. No account, no API key, no quotas, no tracking.

If you've been looking for a **free Google Maps scraper for lead generation**
that runs entirely in your browser, this is it: search any place on Google Maps,
hit **Start extracting**, and download a clean spreadsheet of business leads —
names, addresses, phone numbers, websites, ratings, reviews and more.

**🌐 Website & docs: [geoleadscraper.com](https://geoleadscraper.com/)** — install guide, how-to and FAQ.

<p>
  <a href="https://geoleadscraper.com/"><img alt="Website" src="https://img.shields.io/badge/website-geoleadscraper.com-0a7cff.svg"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-MV3-blue.svg">
  <img alt="Free & Open Source" src="https://img.shields.io/badge/free-open--source-brightgreen.svg">
</p>

> ⚠️ Use responsibly and in compliance with the terms of service of the maps you
> scrape and with applicable data-protection laws. Only public business data.

## Why GeoLeadScraper?

- 🆓 **Truly free Google Maps scraper** — MIT-licensed, no paywall, no sign-up, no credit card.
- 🗺️ **Google Maps, Yandex Maps & 2GIS** — one tool, three of the biggest map providers.
- 🔑 **No API key, no Google Places API** — scrapes the page you're looking at, in your browser.
- 📤 **One-click export** to **CSV / Excel (XLSX) / JSON**.
- ⭐ **Google Maps reviews export** — download every review of a business (text, rating, date, owner reply, photos).
- 🧲 **Built for lead generation** — turn any map search into a list of business leads.
- ⚡ **Standalone in-browser contact enrichment** — scrapes **emails, phone numbers and social links** directly from business websites inside your browser (no backend or Docker required!).
- 🔌 **Optional self-hosted backend** — for users who want server-side Puppeteer rendering.
- 🤖 **MCP server included** — let Claude (or any MCP client) collect and analyze leads on command.
- 🕵️ **Private** — runs locally, your data never touches our servers (there are none).

## What you can extract

Business name · category · full address · phone number · website · rating ·
review count · latitude / longitude · opening hours · claimed status · menu /
booking links — and **email addresses, phone numbers and social media links**
scraped directly from each business's own website right in your browser.

**Reviews** of any single place: author · rating · text (original + Google
translation) · language · publish/edit date · sub-ratings (food, service, price
per person…) · photo links · owner response · review link.

## Supported platforms

| Map | Status |
| --- | --- |
| Google Maps | ✅ Google Maps scraper (search results + reviews of a place) |
| Yandex Maps | ✅ |
| 2GIS | ✅ |

## Quick start (install the Chrome extension)

### Install the ready-made build (no coding)
1. Go to **[Releases → latest](https://github.com/ozhehkovski/geoleadscraper/releases/latest)** and download
   **`geoleadscraper-extension-vX.Y.Z.zip`** (not "Source code").
2. Unzip it.
3. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select the unzipped folder (the one that contains `manifest.json`).

> ⚠️ The green **Code → Download ZIP** button gives you the *source code*, not the
> extension. Loading that folder fails with *"Manifest file is missing or unreadable"* —
> use the Releases zip above, or build it yourself.

### Build from source
Requirements: Node.js >= 20 and pnpm >= 9 (`npm i -g pnpm`).
```bash
pnpm install
pnpm build:extension
```
Then in Chrome: open `chrome://extensions` → enable **Developer mode** →
**Load unpacked** → select `apps/extension/dist`.

📖 Step-by-step install guide with screenshots: **[geoleadscraper.com/install](https://geoleadscraper.com/install)**.

Open Google Maps, search for anything (e.g. *"coffee shops in Berlin"*), click
**Start extracting**, then **Export** to download your CSV or Excel file. The extension works
**standalone** — Google Maps scraping needs no backend and no login.

To export reviews, open a single place (e.g. click a business in the results),
click **Extract reviews**, wait until the counter stops, then **Export reviews**.
The extension opens the Reviews tab and scrolls it for you; you need to be signed
in to Google, because Maps shows only a limited view without reviews to signed-out users.

### Website contact enrichment (emails / phones / socials)
GeoLeadScraper includes an opt-in **built-in standalone in-browser crawler** that visits business websites with missing contacts before export. You can enable it in extension **Settings** ("Enrich missing email / phone"), which asks for permission to access websites at runtime.

It performs a fast, plain HTML fetch client-side in your browser with zero backend setup. Note that because it fetches raw HTML without rendering JavaScript, JS-only (SPA) websites won't yield contacts — for full JavaScript rendering, use the optional Puppeteer backend below. A live progress indicator shows real-time enrichment progress during export.

#### Optional: Puppeteer backend
For advanced users who prefer headless server-side crawling with JavaScript rendering:
```bash
pnpm dev:api
# or: cd apps/api && docker compose up --build
```
Then open extension **Settings** and set the **Backend URL** (default `http://localhost:5050`). When enabled, the backend is used if running; otherwise, the extension seamlessly falls back to the in-browser crawler.

### Optional: MCP server (collect leads from Claude)
A built-in [MCP server](apps/api/MCP.md) lets an AI assistant such as Claude run
`collect_maps(...)` to scrape businesses through the extension and analyze them.
See [apps/api/MCP.md](apps/api/MCP.md).

## Monorepo layout
```
geoleadscraper/
└── apps/
    ├── api/         # Optional stateless backend (NestJS + Puppeteer) + MCP server
    └── extension/   # Chrome MV3 extension (Turborepo + Vite + React)
```
Tooling: **pnpm workspaces + Turborepo**.

## Development
```bash
pnpm dev:extension   # watch-build the extension
pnpm dev:api         # run the backend in watch mode
pnpm lint
pnpm type-check
pnpm test
```

### Releasing
Bump `APP_VERSION` in `apps/extension/packages/shared/config.ts`, merge, then push a
matching tag (`git tag v1.2.0 && git push origin v1.2.0`). The **Extension** GitHub
Action builds the extension and attaches `geoleadscraper-extension-vX.Y.Z.zip` to the release.

## FAQ

**Is this really a free Google Maps scraper?**
Yes — 100% free and open-source (MIT). No account, no quotas, no trial, no
hidden Pro tier.

**Do I need the Google Places API or an API key?**
No. GeoLeadScraper reads the public Google Maps search results in your browser —
there's no API key and no Google Maps API billing.

**Is there a limit on how many results I can scrape?**
No paid limit. You can collect the businesses Google Maps returns for a search;
use a reasonable pace to stay within the platforms' terms of service.

**Can it scrape emails and phone numbers from business websites?**
Yes! You can enable "Enrich missing email / phone" in extension Settings. When enabled, GeoLeadScraper asks for permission to access websites and extracts emails, phone numbers, and social links from company websites during export. It uses plain HTML fetch without JavaScript rendering; for sites that require JavaScript execution, the optional Puppeteer backend can be used.

**Does it work with Yandex Maps and 2GIS too?**
Yes — the same extension scrapes Google Maps, Yandex Maps and 2GIS.

## Keywords

free google maps scraper · google maps scraper chrome extension · google maps
data extractor · scrape google maps · google maps lead generation · business
leads scraper · yandex maps scraper · 2gis scraper · email & phone scraper ·
export google maps to csv/excel · open-source web scraper · no API key.

## Links
- 🌐 Website & docs: **[geoleadscraper.com](https://geoleadscraper.com/)**
- 📖 How to use: [geoleadscraper.com/how-to-use](https://geoleadscraper.com/how-to-use)
- ❓ FAQ: [geoleadscraper.com/faq](https://geoleadscraper.com/faq)

## License
[MIT](./LICENSE) — free for personal and commercial use.
