// node server/age_test.mjs — neutral age screen: limited mode for under-13s, first answer sticks, birth year never stored.
import { createAge, limitedFor, yearChoices } from '../age.js';
import { createSaves } from '../saves.js';
let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const mem = () => { const m = {}; return { getItem: k => k in m ? m[k] : null, setItem: (k, v) => { m[k] = String(v); }, m }; };
const now = new Date(2026, 10, 3);
ok(limitedFor(2020, now) && limitedFor(2014, now) && limitedFor(2013, now), 'born 2013 or later: limited (could still be 12)');
ok(!limitedFor(2012, now) && !limitedFor(1980, now), 'born 2012 or earlier: 13+');
const yc = yearChoices(now); ok(yc[0] === 2026 && yc.length === 100 && !yc.includes(undefined), 'year list runs back 100 years with no default');
let st = mem(), A = createAge(st); ok(!A.asked && !A.u13, 'fresh install asks, starts unlimited until answered');
ok(A.answer(3000, now) === null && !A.asked, 'impossible year is ignored');
ok(A.answer(2015, now) === true && A.asked && A.u13, 'under-13 answer turns on limited mode');
ok(A.answer(1990, now) === true && A.u13, 'answer cannot be retried');
ok(!/2015/.test(st.m.tobu_age_v1), 'birth year is not stored');
ok(createAge(st).u13, 'limited mode survives a reload');
st = mem(); A = createAge(st); ok(A.answer(1990, now) === false && !createAge(st).u13, '13+ answer stays unlimited');
const S = createSaves(mem()); ok(S.source(true) === 'free' && S.source(true) === 'free', 'limited mode: Catch free every run, never an ad');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
