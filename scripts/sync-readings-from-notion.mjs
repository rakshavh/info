/**
 * Sync Notion reading database → data/readings.json
 *
 * Setup:
 * 1. https://www.notion.so/my-integrations → New integration
 * 2. Open your database in Notion → ••• → Connections → add integration
 * 3. Copy .env.example → .env and paste NOTION_TOKEN (never commit .env)
 * 4. npm install && npm run sync-readings
 *
 * Edit notion.config.json if your property names differ.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@notionhq/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env'));

const config = JSON.parse(
  fs.readFileSync(path.join(root, 'notion.config.json'), 'utf8')
);

const token = process.env.NOTION_TOKEN;
if (!token) {
  console.error('Missing NOTION_TOKEN.');
  console.error('  1. Copy .env.example to .env and add your token, then: npm run sync-readings');
  console.error('  2. Or: NOTION_TOKEN="ntn_..." npm run sync-readings');
  process.exit(1);
}

const notion = new Client({ auth: token });

function pickProp(props, keys) {
  for (const key of keys) {
    if (props[key]) return props[key];
  }
  return null;
}

function richTextToPlain(prop) {
  if (!prop) return '';
  if (prop.type === 'rich_text') {
    return prop.rich_text.map((t) => t.plain_text).join('');
  }
  if (prop.type === 'title') {
    return prop.title.map((t) => t.plain_text).join('');
  }
  return '';
}

function tagValues(prop) {
  if (!prop) return [];
  if (prop.type === 'multi_select') {
    return (prop.multi_select || []).map((o) => o.name).filter(Boolean);
  }
  if (prop.type === 'select' && prop.select?.name) {
    return [prop.select.name];
  }
  return [];
}

function authorLastName(author) {
  if (!author) return '';
  const cleaned = author.replace(/\s+et\s+al\.?/i, '').trim();
  const parts = cleaned.split(/[,&]/).map((s) => s.trim()).filter(Boolean);
  const first = parts[0] || cleaned;
  const words = first.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const last = words[words.length - 1].replace(/[^a-zA-Z'-]/g, '');
  return last.toLowerCase();
}

async function fetchAllPages(databaseId) {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function pageToEntry(page) {
  const props = page.properties;
  const p = config.properties;

  const title = richTextToPlain(pickProp(props, p.title)) || 'Untitled';
  const author = richTextToPlain(pickProp(props, p.author));
  const notes = richTextToPlain(pickProp(props, p.notes));

  const type = tagValues(pickProp(props, p.type));
  const theme = tagValues(pickProp(props, p.theme));

  const id = page.id.replace(/-/g, '');
  const notionUrl = `https://learn-for.notion.site/${id}`;

  return {
    id: page.id,
    title,
    author,
    authorSort: authorLastName(author),
    type,
    theme,
    notes,
    notionUrl
  };
}

function buildFilterMeta(items, groupKey) {
  const propKey = config.filterGroups[groupKey].property;
  const set = new Set();
  items.forEach((item) => {
    (item[propKey] || []).forEach((tag) => set.add(tag));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

async function main() {
  const pages = await fetchAllPages(config.databaseId);
  const items = pages
    .filter((p) => p.object === 'page')
    .map(pageToEntry)
    .sort((a, b) => {
      const cmp = a.authorSort.localeCompare(b.authorSort);
      if (cmp !== 0) return cmp;
      return a.title.localeCompare(b.title);
    });

  const output = {
    syncedAt: new Date().toISOString(),
    notionDatabaseId: config.databaseId,
    filterGroups: {
      type: {
        label: config.filterGroups.type.label,
        tags: buildFilterMeta(items, 'type')
      },
      theme: {
        label: config.filterGroups.theme.label,
        tags: buildFilterMeta(items, 'theme')
      }
    },
    items
  };

  const outPath = path.join(root, 'data', 'readings.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${items.length} entries to data/readings.json`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
