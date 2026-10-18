export const STORAGE_KEY = 'yuzuki-n2-v1';
export const defaults = () => ({version:1,currentDay:1,cursors:{},seen:{},completed:{},bookmarks:[],wrong:[],history:[],session:null,listening:{scope:'day',start:1,trackId:null,position:0,loop:true},settings:{voice:'recorded',rate:1,pitch:1.17,showReadings:true}});
export const shuffle = (items) => { const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
export function makeQuestions(pool, all, count) {
  return shuffle(pool).slice(0,Math.min(count,pool.length)).map((w,i)=>{
    const kind=i%3===1?'reading':'meaning';
    const answer=w[kind];
    const others=[...new Set(shuffle(all).map(x=>x[kind]).filter(x=>x!==answer))].slice(0,3);
    return {wordId:w.id,kind,answer,options:shuffle([answer,...others]),selected:null};
  });
}
export function finishSession(state, session, now = new Date().toISOString()) {
  if (!session || session.questions.some(q=>q.selected===null)) throw new Error('시험을 끝까지 풀어 주세요.');
  const existing=state.history.find(h=>h.id===session.id); if(existing) return existing;
  const total=session.questions.length, score=session.questions.filter(q=>q.answer===q.selected).length;
  const wrongIds=session.questions.filter(q=>q.answer!==q.selected).map(q=>q.wordId);
  const testedIds=new Set(session.questions.map(q=>q.wordId));
  state.wrong=[...new Set([...state.wrong.filter(id=>!testedIds.has(id)),...wrongIds])];
  const record={id:session.id,mode:session.mode,day:session.day||null,label:session.label,score,total,at:now,wrongIds};
  if(session.mode==='daily'){
    const old=state.completed[session.day];
    state.completed[session.day]={score,total,at:now,attempts:(old?.attempts||0)+1};
  }
  state.history=[record,...state.history].slice(0,200);
  state.session=null;
  return record;
}
export function reviewPool(state, all, kind='all') {
  const completed=new Set(Object.keys(state.completed).map(Number));
  if(kind==='wrong') return all.filter(w=>state.wrong.includes(w.id));
  if(kind==='bookmarks') return all.filter(w=>state.bookmarks.includes(w.id));
  return all.filter(w=>completed.has(w.day));
}
export function validateState(raw, all) {
  if(!raw||raw.version!==1||!raw.completed||typeof raw.completed!=='object'||!Array.isArray(raw.history)) throw new Error('이 단어장의 백업 파일이 아니에요.');
  const s=defaults(), ids=new Set(all.map(w=>w.id));
  const dayOK=x=>Number.isInteger(Number(x))&&Number(x)>=1&&Number(x)<=60;
  const dateOK=x=>typeof x==='string'&&!Number.isNaN(Date.parse(x));
  const scoreOK=x=>x&&Number.isInteger(x.score)&&Number.isInteger(x.total)&&x.total>0&&x.total<=all.length&&x.score>=0&&x.score<=x.total;
  if(dayOK(raw.currentDay))s.currentDay=Number(raw.currentDay);
  for(const [day,v] of Object.entries(raw.completed)) if(dayOK(day)&&scoreOK(v)&&v.total===20&&dateOK(v.at)) s.completed[day]={score:v.score,total:v.total,at:v.at,attempts:Math.max(1,Math.min(9999,Number(v.attempts)||1))};
  for(const [day,idx] of Object.entries(raw.cursors||{}))if(dayOK(day)&&Number.isInteger(idx)&&idx>=0&&idx<20)s.cursors[day]=idx;
  for(const [day,seen] of Object.entries(raw.seen||{}))if(dayOK(day)&&Array.isArray(seen))s.seen[day]=[...new Set(seen.filter(id=>ids.has(id)&&id.startsWith(`d${String(day).padStart(2,'0')}-`)))];
  s.bookmarks=[...new Set((Array.isArray(raw.bookmarks)?raw.bookmarks:[]).filter(id=>ids.has(id)))];
  s.wrong=[...new Set((Array.isArray(raw.wrong)?raw.wrong:[]).filter(id=>ids.has(id)))];
  s.history=raw.history.filter(h=>scoreOK(h)&&dateOK(h.at)&&typeof h.id==='string'&&['daily','all','wrong','bookmarks'].includes(h.mode)&&typeof h.label==='string'&&(h.mode!=='daily'||dayOK(h.day))).slice(0,200).map(h=>({...h,label:h.label.slice(0,100),wrongIds:(h.wrongIds||[]).filter(id=>ids.has(id))}));
  if(raw.settings){s.settings={voice:typeof raw.settings.voice==='string'?raw.settings.voice:'recorded',rate:Math.min(1.4,Math.max(.7,Number(raw.settings.rate)||1)),pitch:Math.min(1.5,Math.max(.7,Number(raw.settings.pitch)||1.17)),showReadings:raw.settings.showReadings!==false};}
  if(raw.listening){const l=raw.listening;s.listening={scope:['day','five','all'].includes(l.scope)?l.scope:'day',start:dayOK(l.start)?Number(l.start):1,trackId:typeof l.trackId==='string'&&/^(day-\d{2}|five-\d{2}|all)$/.test(l.trackId)?l.trackId:null,position:Number.isFinite(l.position)?Math.max(0,Math.min(86400,l.position)):0,loop:l.loop!==false};}
  const q=raw.session;
  if(q&&typeof q.id==='string'&&['daily','all','wrong','bookmarks'].includes(q.mode)&&typeof q.label==='string'&&Array.isArray(q.questions)&&q.questions.length>0&&q.questions.length<=all.length&&Number.isInteger(q.index)&&q.index>=0&&q.index<q.questions.length){
    const valid=q.questions.every(v=>ids.has(v.wordId)&&['reading','meaning'].includes(v.kind)&&Array.isArray(v.options)&&v.options.length===4&&v.options.every(o=>typeof o==='string')&&v.options.includes(v.answer)&&(v.selected===null||v.options.includes(v.selected))&&all.find(w=>w.id===v.wordId)[v.kind]===v.answer);
    const dailyOK=q.mode!=='daily'||(dayOK(q.day)&&q.questions.length===20&&new Set(q.questions.map(v=>v.wordId)).size===20&&q.questions.every(v=>v.wordId.startsWith(`d${String(q.day).padStart(2,'0')}-`)));
    const orderOK=q.questions.every((v,i)=>i<q.index?v.selected!==null:i>q.index?v.selected===null:true);
    if(valid&&dailyOK&&orderOK)s.session=q;
  }
  return s;
}
