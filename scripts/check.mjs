import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MATH_GROUP_IDS} from '../dist/core.js';
const math={version:2,groups:[]};
for(const line of fs.readFileSync('content/math-practical.tsv','utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'))){
  if(line.startsWith('@')){const [id,title,scope]=line.slice(1).split('|');math.groups.push({id,title,scope,words:[]});continue;}
  const row=line.split('|'),group=math.groups.at(-1);assert.equal(row.length,6,line);
  const w=Object.fromEntries(['word','reading','meaning','example','exampleReading','translation'].map((k,i)=>[k,row[i]]));
  w.id=`math-${group.id}-${String(group.words.length+1).padStart(2,'0')}`;
  assert.ok(row.every(s=>s.trim()));assert.match(w.reading,/^[\u3041-\u3096ー・\s]+$/);assert.ok(!/[一-龯ァ-ヶ]/.test(w.exampleReading));
  w.audio=Object.fromEntries(['word','example'].map(kind=>{const text=kind==='word'?w.reading:w.example;const hash=createHash('sha256').update('math-nanami-v1|'+text).digest('hex').slice(0,18);const path='math-audio/'+hash+'.mp3';if(process.argv.includes('--require-audio'))assert.ok(fs.existsSync('dist/'+path)&&fs.statSync('dist/'+path).size>1000,'Missing math audio: '+w.word);return [kind,path];}));
  group.words.push(w);
}
assert.deepEqual(math.groups.map(g=>g.id),MATH_GROUP_IDS);
assert.ok(math.groups.every(g=>g.words.length===12));
assert.equal(new Set(math.groups.flatMap(g=>g.words.map(w=>w.word))).size,156);
// Migrate existing math bookmarks by the actual word, never by a reused position.
const currentMath=new Map(math.groups.flatMap(g=>g.words.map(w=>[w.word,w.id]))),legacy={};let oldGroup='',oldIndex=0;
for(const line of fs.readFileSync('content/math.tsv','utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'))){
  if(line.startsWith('@')){oldGroup=line.slice(1).split('|')[0];oldIndex=0;continue;}
  oldIndex++;const id=currentMath.get(line.split('|')[0]);if(id)legacy[`math-${oldGroup}-${String(oldIndex).padStart(2,'0')}`]=id;
}
fs.writeFileSync('dist/core.js',fs.readFileSync('dist/core.js','utf8').replace(/const MATH_LEGACY_IDS=.*;/,`const MATH_LEGACY_IDS=${JSON.stringify(legacy)};`));
const mathJSON=JSON.stringify(math);fs.writeFileSync('dist/math-vocabulary.json',mathJSON);
const mathVersion=createHash('sha256').update(mathJSON).digest('hex').slice(0,12);
fs.writeFileSync('dist/math.js',fs.readFileSync('dist/math.js','utf8').replace(/(\.\/math-vocabulary\.json)(?:\?v=[^"']+)?(?=["'])/g,`$1?v=${mathVersion}`));
console.log(`Validated ${currentMath.size} practical math terms in ${math.groups.length} groups.`);
const files=fs.readdirSync('content').filter(f=>/^days-.*\.json$/.test(f)).sort();
const days=files.flatMap(file=>JSON.parse(fs.readFileSync('content/'+file,'utf8').replace(/^\uFEFF/,''))).sort((a,b)=>a.day-b.day);
assert.equal(days.length,60,'60 days required');
const words=[];
for(const [index,day] of days.entries()){
  assert.equal(day.day,index+1);assert.equal(day.words.length,20);
  for(const w of day.words){
    for(const k of ['word','reading','meaning','example','exampleReading','translation'])assert.ok(typeof w[k]==='string'&&w[k].trim(),`Day ${day.day}: ${k}`);
    assert.match(w.reading,/^[\u3041-\u3096ー・\s]+$/,w.word+' reading');
    assert.ok(!/[一-龯ァ-ヶ]/.test(w.exampleReading),w.word+' example reading');
    words.push(w.word);
  }
}
const duplicates=words.filter((w,i)=>words.indexOf(w)!==i);
assert.deepEqual(duplicates,[],'Duplicate vocabulary');
fs.writeFileSync('dist/vocabulary.json',JSON.stringify(days));
console.log(`Validated ${days.length} days, ${words.length} unique words, all required fields and readings. Built dist/vocabulary.json.`);
if(fs.existsSync('dist/audio-manifest.json')){
  const audio=JSON.parse(fs.readFileSync('dist/audio-manifest.json','utf8'));
  let count=0;
  for(const day of days)for(const [i,w] of day.words.entries())w.audio=audio[`d${String(day.day).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`];
  fs.writeFileSync('dist/vocabulary.json',JSON.stringify(days));
  for(const [index,day] of days.entries())for(const [i] of day.words.entries()){
    const id=`d${String(index+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
    for(const kind of ['word','example'])if(audio[id]?.[kind]){assert.ok(fs.statSync('dist/'+audio[id][kind]).size>1000);count++;}
  }
  console.log(`Audio coverage ${count}/2400.`);
  if(process.argv.includes('--require-audio'))assert.equal(count,2400,'Every word and example needs audio');
}
// Version the app shell so an already-open, older service worker cannot serve a
// mismatched script when the new HTML arrives on the first refresh.
// Imported modules need their own versions too: browser HTTP caches can still
// hold the old progress schema even when the entry script has a fresh URL.
let app=fs.readFileSync('dist/app.js','utf8');
for(const dependency of ['core.js','listening.js','audio.js','math.js']){
  const version=createHash('sha256').update(fs.readFileSync('dist/'+dependency)).digest('hex').slice(0,12);
  const pattern=new RegExp(`(\\./${dependency.replace('.','\\.')})(?:\\?v=[^"']+)?(?=["'])`,'g');
  app=app.replace(pattern,`$1?v=${version}`);
}
fs.writeFileSync('dist/app.js',app);
const shellHash=createHash('sha256');
for(const file of ['style.css','aero.css','study.css','math.css','math.js','fonts.css','boot.js','app.js','core.js','listening.js','audio.js'])shellHash.update(fs.readFileSync('dist/'+file));
const shellVersion=shellHash.digest('hex').slice(0,12);
const html=fs.readFileSync('dist/index.html','utf8').replace(/(\.\/(?:style\.css|aero\.css|study\.css|math\.css|fonts\.css|boot\.js|app\.js))(?:\?v=[^"']+)?(?=["'])/g,`$1?v=${shellVersion}`);
fs.writeFileSync('dist/index.html',html);
const stamp=createHash('sha256');
for(const file of ['math.js','math.css','math-vocabulary.json'])stamp.update(fs.readFileSync('dist/'+file));
for(const file of ['audio.js','index.html','study.css','fonts.css','listening.js','listening-manifest.json','fonts/noto-serif-jp-vocabulary.woff2','style.css','aero.css','aurora.svg','phone-qr.svg','icon-192.png','icon-512.png','apple-touch-icon.png','boot.js','app.js','core.js','vocabulary.json','audio-manifest.json','icon.svg','manifest.webmanifest'])if(fs.existsSync('dist/'+file))stamp.update(fs.readFileSync('dist/'+file));
stamp.update(fs.readFileSync('dist/sw.js','utf8').replace(/const CACHE='[^']+';/,"const CACHE='';"));
const cache='yuzuki-n2-'+stamp.digest('hex').slice(0,12);
const sw=fs.readFileSync('dist/sw.js','utf8').replace(/const CACHE='[^']+';/,`const CACHE='${cache}';`);
fs.writeFileSync('dist/sw.js',sw);
console.log('Offline cache version updated to match this content.');
