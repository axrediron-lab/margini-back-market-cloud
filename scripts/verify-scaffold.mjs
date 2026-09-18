import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const required = [
  'README.md',
  'docs/01_SPECIFICA_TECNICA.md',
  'docs/04_MODELLO_GOOGLE_SHEETS.md',
  'docs/05_CATEGORIE_ECONOMICHE_V1.md',
  'apps/web/index.html',
  'supabase/migrations/202609180001_initial_schema.sql',
  'supabase/functions/import-google-sheet/index.ts',
  'packages/domain/src/economics.mjs'
];

for (const file of required) {
  const content = await readFile(new URL(file, root), 'utf8');
  assert.ok(content.length > 20, `${file} deve esistere e non essere vuoto`);
}

const sql = await readFile(new URL('supabase/migrations/202609180001_initial_schema.sql', root), 'utf8');
for (const table of ['import_batches','import_rows','orders','order_lines','invoice_movements','cost_entries','returns','return_links','parameters','anomalies','calculation_runs','margin_results']) {
  assert.match(sql, new RegExp(`create table public\\.${table}\\b`, 'i'), `tabella mancante: ${table}`);
}
for (const marker of ['enable row level security', 'content_sha256', 'engine_version', 'coverage', 'source_refs']) {
  assert.ok(sql.toLowerCase().includes(marker), `marker schema mancante: ${marker}`);
}

for (const marker of ['economic_category', 'report_daily', 'report_monthly', 'MISSING_COST', 'UNLINKED_ORDER', 'UNCLASSIFIED_MOVEMENT']) {
  assert.ok(sql.includes(marker), `marker V1 mancante: ${marker}`);
}

const ui = await readFile(new URL('apps/web/app.js', root), 'utf8');
for (const screen of ['Riepilogo','Ordini e margini','Costi','Resi','Importazioni','Da controllare','Impostazioni']) {
  assert.ok(ui.includes(screen), `schermata V1 mancante: ${screen}`);
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path)); else files.push(path);
  }
  return files;
}

const files = await walk(fileURLToPath(root));
assert.equal(files.filter((file) => /\.(csv|tsv|xlsx|xls|ods|zip)$/i.test(file)).length, 0, 'nessun file operativo deve entrare nel progetto');
console.log(`Scaffolding verificato: ${required.length} file chiave, 12 tabelle applicative, 7 schermate V1, nessun file dati operativo.`);
