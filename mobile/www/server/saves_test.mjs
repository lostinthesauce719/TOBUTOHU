import {createSaves,SAVE_CAP,dayKey} from '../saves.js';
const mem=()=>{const m={};return{getItem:k=>m[k]??null,setItem:(k,v)=>m[k]=v};};let f=0;const ok=(c,t)=>{console.log((c?'PASS ':'FAIL ')+t);if(!c)f++;};
const st=mem(),S=createSaves(st);
ok(S.n===0,'starts empty');
ok(S.zone('summer')&&S.n===1,'first zone reach earns one');ok(!S.zone('summer')&&S.n===1,'same zone never earns twice');
ok(S.daily('2026-10-18')&&S.n===2,'daily run earns one');ok(!S.daily('2026-10-18'),'once per game day');
S.zone('autumn');S.zone('winter');ok(S.n===SAVE_CAP,'capped at 3');ok(!S.daily('2026-10-19')&&S.n===3,'no earning past the cap');
ok(!S.spend('daily')&&!S.spend('weekly')&&S.n===3,'never spendable in ranked');ok(S.spend('free')&&S.n===2,'spendable in casual');
ok(createSaves(st).n===2,'persists');
ok(dayKey(Date.UTC(2026,9,19,6,59))==='2026-10-18'&&dayKey(Date.UTC(2026,9,19,7,0))==='2026-10-19','day resets at UTC-7');
{const T=createSaves(mem());const d='2026-10-20';
ok(T.source(false,d)==='free','first casual Catch of the day is free');T.commit('free',false,d);
ok(T.source(false,d)==='ad','no saves: optional ad after the daily free one');T.zone('Summer cliffs');
ok(T.source(false,d)==='save','banked save covers it next');T.commit('save',false,d);ok(T.n===0,'save spent');
ok(T.source(true,d)==='free','ranked / u13 / Remove-ads: free every run');T.commit('free',true,d);ok(T.source(false,d)==='ad','a ranked free Catch never touches the casual daily state');
ok(T.source(false,'2026-10-21')==='free','free again the next game day');}
console.log(f?f+' failed':'all passed');process.exit(f?1:0);
