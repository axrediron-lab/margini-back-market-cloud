import { calculateLocalSnapshot } from './local-calculation.mjs';

const persist = !process.argv.includes('--dry-run');
const result = await calculateLocalSnapshot({ persist });
console.log(JSON.stringify(result, null, 2));
