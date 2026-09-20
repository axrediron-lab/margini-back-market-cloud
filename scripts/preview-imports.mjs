import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { previewCsv } from '../packages/domain/src/imports.mjs';

if (!process.argv.slice(2).length) {
  console.error('Uso: node scripts/preview-imports.mjs <file.csv> [file.csv ...]');
  process.exit(1);
}

const summaries = [];
for (const path of process.argv.slice(2)) {
  try {
    const content = await readFile(path, 'utf8');
    const { rows, ...summary } = previewCsv({ content, sourceName: basename(path) });
    summaries.push(summary);
  } catch (error) {
    summaries.push({ sourceName: basename(path), error: error instanceof Error ? error.message : String(error) });
  }
}

console.log(JSON.stringify(summaries, null, 2));
