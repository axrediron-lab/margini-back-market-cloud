import { writeFile } from 'node:fs/promises';

const url = process.env.SUPABASE_URL?.trim();
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
if (!url || !anonKey) throw new Error('MISSING_PUBLIC_ONLINE_CONFIG');
const parsed = new URL(url);
if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) throw new Error('INVALID_SUPABASE_URL');
if (!anonKey.startsWith('eyJ') && !anonKey.startsWith('sb_publishable_')) throw new Error('INVALID_PUBLIC_KEY');
await writeFile(new URL('../apps/web/online-config.js', import.meta.url),
  `window.MARGINI_ONLINE_CONFIG = ${JSON.stringify({ url: parsed.origin, anonKey })};\n`);
console.log('Configurazione pubblica online generata.');
