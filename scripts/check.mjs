import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
  for(const [index,day] of days.entries())for(const [i] of day.words.entries()){
    const id=`d${String(index+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
    for(const kind of ['word','example'])if(audio[id]?.[kind]){assert.ok(fs.statSync('dist/'+audio[id][kind]).size>1000);count++;}
  }
  console.log(`Audio coverage ${count}/2400.`);
  if(process.argv.includes('--require-audio'))assert.equal(count,2400,'Every word and example needs audio');
}
// Version the app shell so an already-open, older service worker cannot serve a
// mismatched script when the new HTML arrives on the first refresh.
const shellHash=createHash('sha256');
for(const file of ['style.css','aero.css','boot.js','app.js','core.js'])shellHash.update(fs.readFileSync('dist/'+file));
const shellVersion=shellHash.digest('hex').slice(0,12);
const html=fs.readFileSync('dist/index.html','utf8').replace(/(\.\/(?:style\.css|aero\.css|boot\.js|app\.js))(?:\?v=[^"']+)?(?=["'])/g,`$1?v=${shellVersion}`);
fs.writeFileSync('dist/index.html',html);
const stamp=createHash('sha256');
for(const file of ['index.html','style.css','aero.css','aurora.svg','phone-qr.svg','icon-192.png','icon-512.png','apple-touch-icon.png','boot.js','app.js','core.js','vocabulary.json','audio-manifest.json','icon.svg','manifest.webmanifest'])if(fs.existsSync('dist/'+file))stamp.update(fs.readFileSync('dist/'+file));
stamp.update(fs.readFileSync('dist/sw.js','utf8').replace(/const CACHE='[^']+';/,"const CACHE='';"));
const cache='yuzuki-n2-'+stamp.digest('hex').slice(0,12);
const sw=fs.readFileSync('dist/sw.js','utf8').replace(/const CACHE='[^']+';/,`const CACHE='${cache}';`);
fs.writeFileSync('dist/sw.js',sw);
console.log('Offline cache version updated to match this content.');
