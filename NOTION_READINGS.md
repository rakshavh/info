# Reading repository (Notion → site)

Your [Notion reading database](https://learn-for.notion.site/32e11c994e7a8176b148d309a46cded0) is synced to `data/readings.json` and rendered by the **readings** tab.

GitHub Pages is static, so the browser cannot call the Notion API directly (that would expose your secret token). You sync locally instead.

## Current status: disabled and local-only

The readings tab is switched off and the notes are not published:

- The nav tab, the readings panel, the colophon link, and the `readings/readings.js` script tag are all commented out in `index.html`, so the text is not in the rendered page and cannot be scraped.
- `data/readings.json` is gitignored, so your notes stay on this machine and are never pushed to GitHub.

To turn the page back on, uncomment those four blocks in `index.html`. Note that the live site will have no data to load until you also decide to publish `data/readings.json` (remove it from `.gitignore` and commit it).

## One-time setup

1. **Create a Notion integration**  
   [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration → copy the **Internal Integration Secret**.

2. **Share the database with the integration**  
   Open the database in Notion → **•••** → **Connections** → add your integration.

3. **Install dependencies** (once per machine):

   ```bash
   npm install
   ```

4. **Map property names** (if needed)  
   Edit `notion.config.json`. The sync script looks for these Notion property names (first match wins):

   | Field   | Default property names tried                             |
   |---------|----------------------------------------------------------|
   | Title   | Name, Title, Short Title                                 |
   | Author  | Authors, Author                                          |
   | Type    | Item Type, Type, Genre, Higher level, Subgenre           |
   | Theme   | Tags, Theme, Themes, Topic, Collections                  |
   | Notes   | Abstract, Extra, Notes, Summary, Personal notes          |

   **Type** and **Theme** work best as **multi-select** (or **select**) fields in Notion, since the filter buttons are generated from their values.

## Sync

**Recommended (token saved once in `.env`):**

```bash
cp .env.example .env
# Edit .env and set NOTION_TOKEN=your_token

npm run sync-readings
```

`sync-readings:local` is the same command (alias for clarity).

**One-off without a file:**

```bash
NOTION_TOKEN="ntn_..." npm run sync-readings
```

This rewrites `data/readings.json` in place. Nothing needs to be committed, since the file is gitignored.

## Previewing locally

```bash
npm run serve
```

Then open <http://localhost:8766/#readings> (after uncommenting the readings blocks in `index.html`).

## On the site (when re-enabled)

- Tab: **readings** (`#readings`)
- Filters: **Show all**, then format tags, then theme tags (from your multi-select values)
- Sort: by author last name, then title (set during sync)
