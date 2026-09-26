# Reading repository (Notion → site)

Your [Notion reading database](https://learn-for.notion.site/32e11c994e7a8176b148d309a46cded0) is synced to `data/readings.json` and shown on the **readings** tab of the site.

GitHub Pages is static, so the browser cannot call the Notion API directly (that would expose your secret token). You sync locally (or in CI) and commit the JSON file.

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

   | Field   | Default property names tried                          |
   |---------|--------------------------------------------------------|
   | Title   | Name, Title, Paper, Paper name                         |
   | Author  | Author, Authors                                        |
   | Type    | Type, Genre, Higher level, Subgenre                    |
   | Theme   | Theme, Themes, Topic                                   |
   | Notes   | Notes, Summary, Personal notes, Research reflection    |

   **Type** and **Theme** should be **multi-select** fields in Notion so filter buttons are generated automatically.

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

Then commit `data/readings.json` and push to GitHub Pages.

## Deploy workflow

Whenever you add or edit entries in Notion:

1. Run `npm run sync-readings` (reads `NOTION_TOKEN` from `.env` automatically)
2. `git add data/readings.json && git commit -m "Sync readings from Notion"`
3. Push

Optional: add a GitHub Action that runs sync on a schedule using `NOTION_TOKEN` as a repository secret (not covered here).

## On the site

- Tab: **readings** (`#readings`)
- Filters: **Show all**, then type tags, then theme tags (from your multi-select values)
- Sort: by author last name, then title (set during sync)

Colophon links to this tab; full notes also remain on Notion via each entry’s link.
