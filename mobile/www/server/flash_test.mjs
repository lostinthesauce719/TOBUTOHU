// node server/flash_test.mjs — flash limiter rules
import { createFlashLimiter } from '../flash.js';
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
let L = createFlashLimiter();
ok('first strike flashes', L.request(1, 0));
ok('same strike never flashes twice', !L.request(1, 0.3));
L = createFlashLimiter(); let n = 0; for (let i = 0; i < 20; i++) if (L.request(100 + i, i * 0.1)) n++; // 10 strikes/s for 2 s
ok('10 strikes/s for 2 s gives at most 6 flashes (3/s)', n <= 6 && n >= 4);
L = createFlashLimiter(); let worst = 0; const fl = []; for (let i = 0; i < 200; i++) { const t = i * 0.037; if (L.request(i, t)) fl.push(t); }
for (const t of fl) worst = Math.max(worst, fl.filter(u => u >= t && u < t + 1).length);
ok('never more than 3 flashes in any 1 s window', worst <= 3);
L = createFlashLimiter(); ok('two lanes striking together: first flashes', L.request(7, 5)); ok('two lanes striking together: second shares it', !L.request(8, 5.0));
L = createFlashLimiter({ reduceMotion: true }); ok('reduce motion: no flash', !L.request(1, 0));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
