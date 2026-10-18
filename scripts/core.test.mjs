import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,makeQuestions,finishSession,reviewPool,validateState} from '../dist/core.js';
import {listeningSelection,entryAt} from '../dist/listening.js';
const days=JSON.parse(fs.readFileSync('dist/vocabulary.json','utf8'));
const all=days.flatMap(d=>d.words.map((w,i)=>({...w,id:`d${String(d.day).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,day:d.day})));
const daily=(day=1)=>({id:'attempt-'+day,mode:'daily',label:day+'일차 시험',day,index:0,questions:makeQuestions(all.filter(w=>w.day===day),all,20)});
test('unfinished daily exam cannot complete a lesson',()=>{const s=defaults(),q=daily();q.questions[0].selected=q.questions[0].answer;assert.throws(()=>finishSession(s,q));assert.equal(Object.keys(s.completed).length,0);});
test('even a zero-score submitted exam completes exactly one day, once',()=>{const s=defaults(),q=daily();q.questions.forEach(v=>v.selected=v.options.find(a=>a!==v.answer));const result=finishSession(s,q);assert.equal(result.score,0);assert.equal(s.completed[1].score,0);assert.equal(s.wrong.length,20);finishSession(s,q);assert.equal(s.history.length,1);assert.equal(s.completed[1].attempts,1);});
test('review draws only completed days, including nonconsecutive days',()=>{const s=defaults();s.completed={1:{},3:{}};const pool=reviewPool(s,all);assert.equal(pool.length,40);assert.ok(pool.every(w=>[1,3].includes(w.day)));assert.equal(new Set(pool.map(w=>w.id)).size,40);});
test('review correct answer clears wrong word without completing new days',()=>{const s=defaults();s.wrong=[all[0].id,all[1].id];const q={id:'review',mode:'wrong',label:'오답 복습',questions:makeQuestions([all[0]],all,1)};q.questions[0].selected=q.questions[0].answer;finishSession(s,q);assert.deepEqual(s.wrong,[all[1].id]);assert.equal(Object.keys(s.completed).length,0);});
test('all 1200 questions have 4 unique choices and exactly one answer',()=>{for(const q of makeQuestions(all,all,1200)){assert.equal(new Set(q.options).size,4);assert.equal(q.options.filter(x=>x===q.answer).length,1);}});
test('in-progress exam survives export/import, malformed daily exam is rejected',()=>{const s=defaults();s.session=daily();s.session.questions[0].selected=s.session.questions[0].answer;s.session.index=1;assert.deepEqual(validateState(JSON.parse(JSON.stringify(s)),all).session,s.session);s.session.questions=s.session.questions.slice(0,2);assert.equal(validateState(s,all).session,null);});
test('backup validates ids, days, settings, and scores',()=>{const s=defaults();s.currentDay=999;s.bookmarks=[all[0].id,'bad'];s.completed={'61':{score:20,total:20,at:new Date().toISOString()},'1':{score:25,total:20,at:new Date().toISOString()}};s.settings.rate=99;const clean=validateState(s,all);assert.equal(clean.currentDay,1);assert.deepEqual(clean.bookmarks,[all[0].id]);assert.deepEqual(clean.completed,{});assert.equal(clean.settings.rate,1.4);assert.throws(()=>validateState({version:55},all));});

test('listening ranges cover all 60 days without overlap or truncation',()=>{
  const five=[];for(let day=1;day<=60;day++){const single=listeningSelection('day',day);assert.equal(single.start,day);assert.equal(single.end,day);const group=listeningSelection('five',day);assert.ok(group.start<=day&&group.end>=day);if(day%5===1)five.push(group);}
  assert.equal(five.length,12);assert.equal(five[11].end,60);assert.deepEqual(listeningSelection('all',58),{scope:'all',start:1,end:60,id:'all'});
});
test('continuous recordings contain exactly the selected words, in order, with a meaning after the three repetitions',()=>{
  const manifest=JSON.parse(fs.readFileSync('dist/listening-manifest.json','utf8'));assert.equal(manifest.tracks.length,73);
  for(const track of manifest.tracks){const ids=all.filter(w=>w.day>=track.from&&w.day<=track.to).map(w=>w.id);assert.deepEqual(track.words.map(w=>w.id),ids);assert.ok(fs.statSync('dist/'+track.src).size>10000);let end=0;for(const word of track.words){assert.ok(Math.abs(word.at-end)<.01);assert.ok(word.meaningAt>word.at&&word.end>word.meaningAt);end=word.end;}assert.ok(Math.abs(track.duration-end)<.01);assert.equal(entryAt(track.words,track.words[1].at).id,ids[1]);assert.equal(entryAt(track.words,track.duration-1).id,ids.at(-1));}
});
test('listening position survives backup without marking days complete',()=>{
  const s=defaults();s.listening={scope:'five',start:56,trackId:'five-56',position:481.25,loop:false};const saved=validateState(JSON.parse(JSON.stringify(s)),all);assert.deepEqual(saved.listening,s.listening);assert.deepEqual(saved.completed,{});s.listening.position=-100;s.listening.start=999;const clean=validateState(s,all);assert.equal(clean.listening.position,0);assert.equal(clean.listening.start,1);
});
