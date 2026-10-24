import {WordAudio} from './audio.js?v=e393fa0a5c95';
import {MathNotebook,installSevenTap} from './math.js?v=af5f233511c1';
import {STORAGE_KEY,defaults,shuffle,makeQuestions,finishSession,reviewPool,validateState} from './core.js?v=72c5ae2ce97f';
import {ListeningPlayer,listeningSelection,formatTime,entryAt} from './listening.js?v=0783d7a1315a';

const paths={home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',book:'M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3Zm9 2v15',grid:'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',repeat:'M20 7H7a4 4 0 0 0-4 4m17-4-4-4m4 4-4 4M4 17h13a4 4 0 0 0 4-4M4 17l4-4m-4 4 4 4',chart:'M4 20h17M7 16v-5m5 5V5m5 11V8',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',sound:'M4 9h4l5-4v14l-5-4H4Zm12-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',arrow:'M4 12h16m-6-6 6 6-6 6',left:'M20 12H4m6-6-6 6 6 6',star:'m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.5l-5.7 3 1.1-6.3L2.8 9.7l6.4-.9Z',check:'m5 12 4 4L19 6',close:'m6 6 12 12M6 18 18 6',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',spark:'m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',list:'M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',flag:'M5 22V3m0 0c5-4 9 4 15 0v10c-6 4-10-4-15 0',heart:'M12 20S2 14 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-10 12-10 12Z'};
const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.spark}"/></svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const $=s=>document.querySelector(s);
let days=[],all=[],byId={},audioManifest={},state,route='today',reviewKind='all',reviewCount='20',courseFilter='all',search='',lastResult=null,voices=[],speech=null,toastTimer,storageError=false,playToken=0,pendingImport=null;
const main=$('#main'),dialog=$('#dialog');
let saveTimer=0,listenManifest=null,listenPromise=null,listener=null,wordAudio=null,audioWarmTimer=0,audioNoticeTimer=0;
function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(save,180);}
const labels={math:'수학 일본어',listen:'듣기',today:'오늘의 학습',course:'60일 커리큘럼',review:'복습 시험',records:'나의 기록',quiz:'오늘의 시험',result:'시험 결과',daylist:'단어 모아보기'};
const nav=[['today','book','오늘의 학습'],['course','grid','60일 커리큘럼'],['listen','sound','듣기'],['review','repeat','복습 시험'],['records','chart','나의 기록']];
const math=new MathNotebook({getProgress:()=>state.math,getSettings:()=>state.settings,save:saveSoon,refresh:()=>{if(route==='math')render('math');},stop:stopAudio,speak,esc,icon,exampleMarkup,warm:warmAudio});
installSevenTap(()=>{if(!state||route==='math')return false;math.returnRoute=route;listener?.pause();closeDialog();go('math');});

function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function save(){clearTimeout(saveTimer);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));storageError=false;}catch{storageError=true;toast('저장 공간을 사용할 수 없어요. 설정에서 기록을 백업해 주세요.');}$('#save-status').innerHTML=storageError?'저장 실패 · 백업 필요':'<i></i> 이 기기에 자동 저장';}
function completedCount(){return Object.keys(state.completed).length;}
function studiedCount(){return Object.values(state.seen).reduce((n,a)=>n+a.length,0);}
function current(){return days.find(d=>d.day===state.currentDay)||days[0];}
function streak(){const dates=new Set(state.history.map(h=>new Date(h.at).toLocaleDateString('sv-SE')));let n=0,d=new Date();if(!dates.has(d.toLocaleDateString('sv-SE')))d.setDate(d.getDate()-1);while(dates.has(d.toLocaleDateString('sv-SE'))){n++;d.setDate(d.getDate()-1);}return n;}
function go(next){stopAudio();if(location.hash===`#${next}`)render(next);else location.hash=next;}
function openDay(day,idx){state.currentDay=Number(day);if(Number.isInteger(idx))state.cursors[day]=idx;save();go('today');window.scrollTo(0,0);}
function heading(eyebrow,title,description,right=''){return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${right}</div>`;}
function render(next=location.hash.slice(1)||'today'){
  route=labels[next]?next:'today';
  if(route==='quiz'&&!state.session)route='today';
  if(route==='result'&&!lastResult)route='records';
  $('#navigation').innerHTML=nav.map(([id,i,t])=>`<a href="#${id}" class="nav-item ${route===id||id==='today'&&['quiz','result','daylist'].includes(route)?'active':''}" ${route===id?'aria-current="page"':''}>${icon(i)}<span>${t}</span>${route===id?'<i class="nav-dot"></i>':''}</a>`).join('');
  $('.settings-button').innerHTML=icon('settings')+'<span>음성 및 저장 설정</span>';
  $('#top-settings').innerHTML=icon('settings');$('#page-name').textContent=labels[route];
  let banner=state.session&&route!=='quiz'?`<div class="resume-banner"><span>${esc(state.session.label)} · ${state.session.index+1}/${state.session.questions.length}문제에서 이어할 수 있어요.</span><button data-action="resume">시험 이어하기 →</button></div>`:'';
  let warning=storageError?'<div class="storage-alert">현재 브라우저에 저장할 수 없어요. 설정의 기록 백업으로 진도를 보관해 주세요.</div>':'';
  const views={math:()=>math.render(),listen:renderListening,today:renderToday,course:renderCourse,review:renderReview,records:renderRecords,quiz:renderQuiz,result:renderResult,daylist:renderDayList};
  main.innerHTML=warning+(route==='quiz'?'':banner)+views[route]();
  document.body.dataset.view=route;
  if(route==='today')setupStudyCard();
  if(route==='math')math.layout();
  warmAudio();
  updateListeningButton();
  if(route==='listen'&&listener?.track)updateListeningUI(listener.snapshot());
}
function dayTile(d){const done=state.completed[d.day],active=d.day===state.currentDay,seen=state.seen[d.day]?.length||0;return `<button class="day-tile ${done?'done':''} ${active?'current':''}" data-action="day" data-day="${d.day}" aria-label="${d.day}일차 ${esc(d.title)} ${done?'완료':seen?'학습 중':'학습 시작'}"><span class="day-number">DAY ${pad(d.day)}</span><strong>${esc(d.title)}</strong><span class="day-state">${done?`완료 · ${done.score}/20`:(seen?`${seen}/20단어 살펴봄`:'20개의 새로운 단어')}</span></button>`;}
function renderToday(){
  const d=current(),idx=state.cursors[d.day]||0,w=d.words[idx],done=state.completed[d.day];
  if(!state.seen[d.day])state.seen[d.day]=[];
  if(!state.seen[d.day].includes(w.id)){state.seen[d.day].push(w.id);saveSoon();}
  const seen=state.seen[d.day].length,count=completedCount();
  const start=Math.floor((d.day-1)/6)*6;
  return `<div class="learning-heading" id="study-heading"><div><div class="eyebrow">DAY ${pad(d.day)} <span>/ 60</span></div><h1>${esc(d.title)}</h1><p>${esc(d.subtitle)}</p></div><button class="text-button list-button" data-action="day-list">${icon('list')} 목록으로 보기</button></div>
  <div class="study-layout"><section class="word-card glass" aria-label="오늘의 단어">${wordCard(w,idx,d)}</section><aside class="study-aside"><section class="progress-card glass" aria-label="${count}일 완료, 전체 60일"><div class="card-kicker">60일의 학습 기록</div><div class="progress-ring" style="--progress:${count/60*100}"><div><strong>${pad(count)}</strong><span>/ 60</span></div><small>일차 완료</small></div><div class="mini-stats"><div><b>${studiedCount().toLocaleString()}</b><span>살펴본 단어</span></div><div><b>${streak()}일</b><span>연속 시험</span></div></div><div class="daily-mission"><h2>${d.day}일차 ${done?'완료':'학습 중'}${done?icon('check'):''}</h2><div class="small-progress"><span style="width:${seen/20*100}%"></span></div><div class="note-meta"><span>${seen} / 20단어 살펴봄</span><span>${Math.round(seen/20*100)}%</span></div><button class="button" data-action="daily-quiz">${done?'다시 시험 보기':'오늘의 시험 보기'} ${icon('arrow')}</button><p>시험을 끝내면 이 일차가 완료돼요.</p></div></section></aside></div>
  <div class="section-head"><h2>이어서 배울 단어들</h2><button class="text-button" data-action="course">60일 전체 보기 ${icon('arrow')}</button></div><div class="day-strip">${days.slice(start,start+6).map(dayTile).join('')}</div>`;
}
function wordCard(w,idx,d){const saved=state.bookmarks.includes(w.id);return `<div class="word-card-top"><div class="word-meta"><span class="tag">N2 PREP</span> <span class="word-counter">WORD ${pad(idx+1)}</span></div><button class="icon-button ${saved?'saved':''}" data-action="bookmark" data-id="${w.id}" aria-label="${saved?'저장한 단어에서 빼기':'단어 저장'}" aria-pressed="${saved}">${icon('star')}</button></div><div class="word-main"><p class="reading" lang="ja">${state.settings.showReadings?esc(w.reading):'· · ·'}</p><button class="kanji-button" lang="ja" data-action="speak" data-id="${w.id}" data-kind="word" aria-label="${esc(w.word)} 발음 듣기" style="--word-chars:${Math.max(1,[...w.word].length*1.09)}">${esc(w.word)}</button><p class="word-meaning">${esc(w.meaning)}</p><div class="word-audio-controls"><button class="word-play" data-action="speak" data-id="${w.id}" data-kind="word">${icon('sound')} 단어만 듣기</button><button class="icon-button stop-audio" data-action="stop-audio" aria-label="음성 멈추기"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1"/></svg></button></div></div>${exampleMarkup(w)}<div class="word-nav"><button class="button secondary" data-action="prev" ${idx===0?'disabled':''}>${icon('left')} 이전</button><span class="word-index"><b>${pad(idx+1)}</b> / 20</span><button class="button secondary" data-action="${idx===19?'daily-quiz':'next'}">${idx===19?'시험 보기':'다음 단어'} ${icon('arrow')}</button></div><div class="word-scrubber"><div class="scrub-marks" aria-hidden="true">${d.words.map(v=>`<span class="${state.seen[d.day]?.includes(v.id)?'viewed':''}"></span>`).join('')}</div><input id="word-scrub" type="range" min="0" max="19" step="1" value="${idx}" aria-label="좌우로 쓸어서 단어 넘기기" aria-valuetext="${idx+1}번째 단어 ${esc(w.word)}"><span class="scrub-hint">좌우로 쓸어서 넘기기</span></div>`;}
function exampleMarkup(w){return `<div class="example"><div class="example-label">예문 <span>IN A SENTENCE</span></div><p class="example-jp" lang="ja">${esc(w.example)}</p><p class="example-reading" lang="ja" ${state.settings.showReadings?'':'hidden'}>${esc(w.exampleReading)}</p><p class="example-ko">${esc(w.translation)}</p><button class="icon-button" data-action="speak" data-id="${w.id}" data-kind="example" aria-label="예문 듣기">${icon('sound')}</button></div>`;}
function setupStudyCard(){
  const card=$('.word-card');if(!card)return;
  card.style.setProperty('--word-width',Math.max(180,card.querySelector('.word-main').clientWidth-8)+'px');
  const example=card.querySelector('.example'),style=getComputedStyle(example),jpStyle=getComputedStyle(example.querySelector('.example-jp'));
  const key=[state.currentDay,example.clientWidth,style.padding,jpStyle.fontSize,state.settings.showReadings].join(':');
  if(card.dataset.layoutKey===key)return;
  card.dataset.layoutKey=key;
  // Reserve the tallest example in this lesson once, so swapping words cannot
  // move the controls and long sentences never need their own scroll area.
  const fragment=document.createDocumentFragment(),probes=current().words.map(word=>{
    const probe=example.cloneNode(true);probe.setAttribute('aria-hidden','true');
    probe.style.cssText=`position:absolute;visibility:hidden;pointer-events:none;width:${example.getBoundingClientRect().width}px;height:auto;min-height:0;left:0;top:0;`;
    for(const [selector,field] of [['.example-jp','example'],['.example-reading','exampleReading'],['.example-ko','translation']])probe.querySelector(selector).textContent=word[field];
    fragment.append(probe);return probe;
  });
  card.append(fragment);
  const height=Math.max(...probes.map(probe=>probe.getBoundingClientRect().height));
  probes.forEach(probe=>probe.remove());card.style.setProperty('--example-height',Math.ceil(height)+2+'px');
}
function selectWord(index){
  const d=current();index=Math.max(0,Math.min(19,Number(index)||0));
  if(index===(state.cursors[d.day]||0))return;
  state.cursors[d.day]=index;stopAudio();updateWordContent();saveSoon();warmAudio();
}
function updateWordContent(){
  const card=$('.word-card');if(!card)return;
  const d=current(),idx=state.cursors[d.day]||0,w=d.words[idx];
  if(!state.seen[d.day])state.seen[d.day]=[];
  if(!state.seen[d.day].includes(w.id))state.seen[d.day].push(w.id);
  card.querySelector('.word-counter').textContent='WORD '+pad(idx+1);
  card.querySelector('.reading').textContent=state.settings.showReadings?w.reading:'· · ·';
  const kanji=card.querySelector('.kanji-button');kanji.textContent=w.word;kanji.style.setProperty('--word-chars',Math.max(1,[...w.word].length*1.09));kanji.setAttribute('aria-label',w.word+' 발음 듣기');
  card.querySelector('.word-meaning').textContent=w.meaning;
  for(const [selector,key] of [['.example-jp','example'],['.example-reading','exampleReading'],['.example-ko','translation']])card.querySelector(selector).textContent=w[key];
  card.querySelector('.example').scrollTop=0;
  card.querySelectorAll('[data-action="speak"]').forEach(el=>el.dataset.id=w.id);
  const bookmark=card.querySelector('[data-action="bookmark"]'),saved=state.bookmarks.includes(w.id);bookmark.dataset.id=w.id;bookmark.classList.toggle('saved',saved);bookmark.setAttribute('aria-pressed',String(saved));bookmark.setAttribute('aria-label',saved?'저장한 단어에서 빼기':'단어 저장');
  card.querySelector('[data-action="prev"]').disabled=idx===0;
  const next=card.querySelector('.word-nav .button:last-child');next.dataset.action=idx===19?'daily-quiz':'next';next.innerHTML=(idx===19?'시험 보기':'다음 단어')+' '+icon('arrow');
  card.querySelector('.word-index b').textContent=pad(idx+1);
  const scrub=card.querySelector('#word-scrub');scrub.value=idx;scrub.setAttribute('aria-valuetext',`${idx+1}번째 단어 ${w.word}`);
  card.querySelectorAll('.scrub-marks span').forEach((el,i)=>el.classList.toggle('viewed',state.seen[d.day].includes(d.words[i].id)));
  const seen=state.seen[d.day].length;
  $('.mini-stats b').textContent=studiedCount().toLocaleString();
  $('.daily-mission .small-progress>span').style.width=seen*5+'%';
  $('.daily-mission .note-meta').innerHTML=`<span>${seen} / 20단어 살펴봄</span><span>${seen*5}%</span>`;
  const tile=$(`.day-strip [data-day="${d.day}"] .day-state`);if(tile&&!state.completed[d.day])tile.textContent=seen+'/20단어 살펴봄';
}
function renderCourse(){return heading('60 DAYS · 1,200 WORDS','60일 커리큘럼','주제별로 배우는 하루 20단어. 시험을 마친 일차는 완료로 표시돼요.',`<span class="pill">${completedCount()} / 60일 완료</span>`)+`<div class="course-controls"><div class="search">${icon('search')}<input id="course-search" type="search" value="${esc(search)}" placeholder="단어, 히라가나, 뜻 또는 주제 검색" aria-label="단어와 일차 검색"></div><select id="course-filter" aria-label="학습 상태 필터"><option value="all" ${courseFilter==='all'?'selected':''}>모든 일차</option><option value="todo" ${courseFilter==='todo'?'selected':''}>미완료</option><option value="done" ${courseFilter==='done'?'selected':''}>완료한 일차</option></select></div><div id="course-results">${courseResults()}</div>`;}
function courseResults(){const q=search.toLowerCase().trim();const filtered=days.filter(d=>courseFilter==='done'?state.completed[d.day]:courseFilter==='todo'?!state.completed[d.day]:true);if(q){const matches=filtered.flatMap(d=>d.words.filter(w=>`${w.word} ${w.reading} ${w.meaning} ${d.title} ${d.day}일차`.toLowerCase().includes(q)));return `<div class="list-toolbar"><span class="list-subtitle">${matches.length}개의 단어를 찾았어요</span></div><div class="vocab-list">${matches.slice(0,100).map(wordRow).join('')}</div>${matches.length>100?'<p class="list-subtitle">처음 100개를 표시했어요. 검색어를 조금 더 구체적으로 입력해 주세요.</p>':''}${!matches.length?empty('찾는 단어가 아직 없어요','다른 단어나 한국어 뜻으로 찾아보세요.'):''}`;}const groups=['일상에서 시작하는 일본어','생각과 세상을 넓히는 일본어','표현의 깊이를 더하는 일본어'];return groups.map((title,i)=>{const sub=filtered.filter(d=>d.day>i*20&&d.day<=(i+1)*20);return sub.length?`<section class="course-group"><div class="group-heading"><h2>${i+1}. ${title}</h2><span>DAY ${pad(i*20+1)} — ${pad((i+1)*20)}</span></div><div class="course-grid">${sub.map(dayTile).join('')}</div></section>`:'';}).join('')||empty('아직 완료한 일차가 없어요','오늘의 시험을 풀면 첫 번째 기록이 생겨요.');}
function wordRow(w){return `<article class="vocab-row glass"><span class="row-index">D${pad(w.day)}</span><div><button class="word-inline" lang="ja" data-action="open-word" data-id="${w.id}">${esc(w.word)}</button><div class="row-reading" lang="ja">${esc(w.reading)}</div></div><span class="row-meaning">${esc(w.meaning)}</span><button class="icon-button" data-action="speak" data-id="${w.id}" data-kind="word" aria-label="${esc(w.word)} 듣기">${icon('sound')}</button></article>`;}
function renderDayList(){const d=current();return heading(`DAY ${pad(d.day)} · WORD COLLECTION`,`${d.day}일차 · ${esc(d.title)}`,esc(d.subtitle),'<button class="button secondary" data-action="today">카드로 보기</button>')+`<div class="vocab-list">${d.words.map(wordRow).join('')}</div><div class="result-actions"><button class="button" data-action="daily-quiz">오늘의 시험 보기 ${icon('arrow')}</button></div>`;}
function statsMarkup(){return `<div class="stats-grid"><section class="stat-card glass"><span class="stat-label">완료한 일차</span><strong>${completedCount()}<small>/ 60일</small></strong><p>시험을 마친 일차</p></section><section class="stat-card glass"><span class="stat-label">복습할 오답</span><strong>${state.wrong.length}<small>단어</small></strong><p>다시 맞히면 오답에서 빠져요</p></section><section class="stat-card glass"><span class="stat-label">저장한 단어</span><strong>${state.bookmarks.length}<small>단어</small></strong><p>별표로 모아 둔 나만의 단어</p></section></div>`;}
function renderReview(){const pool=reviewPool(state,all,reviewKind),completed=Object.keys(state.completed).map(Number).sort((a,b)=>a-b);return heading('REMEMBER A LITTLE LONGER','기억이 오래 머물도록','배운 단어들을 다시 만나면, 조금 더 단단히 기억돼요.')+statsMarkup()+`<section class="review-panel glass"><div class="eyebrow">MIX & REVIEW</div><h2>지금까지의 나를 위한 복습 시험</h2><p>한자·발음이 비슷하거나 같은 주제의 단어를 보기로 섞어서 출제해요.</p><div class="review-types">${[['all','repeat','전체 시험',`${completed.length}일차 · ${reviewPool(state,all,'all').length}단어`],['wrong','flag','오답만 다시',`${state.wrong.length}단어`],['bookmarks','star','저장한 단어',`${state.bookmarks.length}단어`]].map(([key,i,title,sub])=>`<button class="review-type ${reviewKind===key?'active':''}" data-action="review-kind" data-kind="${key}" aria-pressed="${reviewKind===key}">${icon(i)}<strong>${title}</strong><span>${sub}</span></button>`).join('')}</div><div class="review-scope">${reviewKind==='all'?(completed.length?`출제 범위: ${completed.map(x=>`${x}일차`).join(', ')}`:'아직 완료한 일차가 없어요. 일차별 시험을 먼저 마쳐 주세요.'):reviewKind==='wrong'?'최근 시험에서 틀린 단어가 모여 있어요. 정답을 맞히면 자동으로 빠져요.':'학습 카드에서 별표를 누른 단어만 출제해요.'}</div><div class="review-controls"><label for="review-count">문제 수</label><select id="review-count"><option value="20" ${reviewCount==='20'?'selected':''}>20문제</option><option value="50" ${reviewCount==='50'?'selected':''}>50문제</option><option value="all" ${reviewCount==='all'?'selected':''}>전체 ${pool.length}문제</option></select><button class="button" data-action="review-start" ${pool.length?'':'disabled'}>복습 시작하기 ${icon('arrow')}</button></div><p style="font-size:10px;margin-top:15px">${pool.length?`${Math.min(reviewCount==='all'?pool.length:Number(reviewCount),pool.length)}문제를 출제해요. 중간에 닫아도 이어서 풀 수 있어요.`:'학습을 시작하고 나만의 복습 범위를 만들어 보세요.'}</p></section>${reviewKind!=='all'&&pool.length?`<div class="section-head"><h2>${reviewKind==='wrong'?'다시 만날 단어':'별표 단어장'} <small>${pool.length}개</small></h2></div><div class="vocab-list">${pool.map(wordRow).join('')}</div>`:''}`;}
function empty(title,description){return `<div class="empty-state glass">${icon('book')}<h2>${title}</h2><p>${description}</p><button class="button" data-action="today">오늘의 학습으로 ${icon('arrow')}</button></div>`;}
function renderRecords(){const attempts=state.history.length,correct=state.history.reduce((sum,h)=>sum+h.score,0),total=state.history.reduce((sum,h)=>sum+h.total,0);return heading('YOUR LITTLE ACHIEVEMENTS','차곡차곡 쌓이는 나의 기록','잘한 날도, 조금 어려웠던 날도. 모든 한 걸음이 여기에 남아요.',`<button class="button secondary" data-action="export">${icon('download')} 백업</button>`)+`<div class="stats-grid"><section class="stat-card glass"><span class="stat-label">완료한 일차</span><strong>${completedCount()}<small>/ 60일</small></strong><p>${completedCount()*20}개 어휘 시험 완료</p></section><section class="stat-card glass"><span class="stat-label">누적 시험</span><strong>${attempts}<small>회</small></strong><p>최근 200회까지 보관해요</p></section><section class="stat-card glass"><span class="stat-label">기록 평균 정답률</span><strong>${total?Math.round(correct/total*100):0}<small>%</small></strong><p>반복할수록 더 단단해져요</p></section></div><div class="section-head"><h2>나의 시험 일지</h2><span class="list-subtitle">최신 기록부터</span></div>${state.history.length?`<div class="glass history-list">${state.history.map(h=>`<article class="history-item"><div class="history-symbol">${icon(h.mode==='daily'?'check':'repeat')}</div><div><h3>${esc(h.label)}${h.mode==='daily'?' · 일차 완료':''}</h3><p>${new Date(h.at).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${h.total}문제</p></div><div class="history-score">${Math.round(h.score/h.total*100)}<small>점 · ${h.score}/${h.total}</small></div></article>`).join('')}</div>`:empty('첫 기록을 기다리고 있어요','시험을 끝까지 풀면 점수와 함께 일차가 저장돼요.')}`;}
function startQuiz(mode,pool,count,day=null){if(!pool.length){toast('아직 출제할 단어가 없어요.');return;}const launch=()=>{state.session={id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,mode,day,label:mode==='daily'?`${day}일차 시험`:mode==='all'?'전체 복습 시험':mode==='wrong'?'오답 복습 시험':'별표 단어 시험',index:0,questions:makeQuestions(pool,all,count,{confusable:mode!=='daily'})};save();closeDialog();go('quiz');window.scrollTo(0,0);};if(state.session){showDialog('풀던 시험이 남아 있어요',`<p class="dialog-copy">${esc(state.session.label)} ${state.session.index+1}번 문제에서 이어할 수 있어요. 새 시험을 시작하면 진행 중인 시험만 사라져요.</p><div class="dialog-actions"><button class="button secondary" data-action="resume">이어서 풀기</button><button class="button" id="new-quiz">새 시험 시작</button></div>`);$('#new-quiz').onclick=launch;}else launch();}
function contrastMarkup(question){
  if(!Array.isArray(question.choiceIds))return '';
  const words=question.choiceIds.map(id=>byId[id]).filter(Boolean);
  return `<div class="quiz-contrasts"><h3>함께 구별해 보기</h3>${words.map(w=>`<div><strong lang="ja">${esc(w.word)}</strong><span lang="ja">${esc(w.reading)}</span><p>${esc(w.meaning)}</p></div>`).join('')}</div>`;
}
function renderQuiz(){const s=state.session,q=s.questions[s.index],w=byId[q.wordId],answered=q.selected!==null;return `<div class="quiz-wrap"><div class="quiz-top"><strong>${esc(s.label)}</strong><button class="text-button" data-action="today">저장하고 나가기 ${icon('close')}</button></div><div class="quiz-progress" aria-label="${s.index} / ${s.questions.length}문제 풀이"><span style="width:${s.index/s.questions.length*100}%"></span></div><section class="quiz-card glass"><div class="quiz-type">QUESTION ${pad(s.index+1)} / ${s.questions.length} · ${q.kind==='meaning'?'MEANING':'READING'}</div><div class="quiz-question" lang="ja">${esc(w.word)}</div><p class="quiz-instruction">${q.kind==='meaning'?'이 단어의 알맞은 뜻을 골라 주세요.':'이 단어의 올바른 히라가나 읽기를 골라 주세요.'}</p><div class="answers">${q.options.map((a,i)=>`<button class="answer ${answered?(a===q.answer?'correct':a===q.selected?'incorrect':'muted'):''}" data-action="answer" data-index="${i}" ${answered?'disabled':''}><span>${i+1}</span>${esc(a)}${answered&&a===q.answer?icon('check'):''}</button>`).join('')}</div>${answered?`<div class="quiz-feedback"><div class="feedback-heading ${q.answer===q.selected?'':'incorrect'}">${q.answer===q.selected?'잘했어요! 정확히 기억했네요.':'괜찮아요. 지금 한 번 더 기억해요.'}</div><p>${esc(w.word)} · ${esc(w.reading)} · ${esc(w.meaning)} <button class="icon-button" data-action="speak" data-id="${w.id}" data-kind="word" aria-label="정답 발음 듣기">${icon('sound')}</button></p>${exampleMarkup(w)}${contrastMarkup(q)}</div>`:''}<div class="quiz-bottom"><span>${answered?'답과 예문을 확인하고 넘어가세요.':'숫자 1–4 키로도 선택할 수 있어요.'}</span><button class="button" data-action="quiz-next" ${answered?'':'disabled'}>${s.index===s.questions.length-1?'결과 보기':'다음 문제'} ${icon('arrow')}</button></div></section><p class="list-subtitle" style="text-align:center;margin:20px">${s.mode==='daily'?'점수와 관계없이 끝까지 풀면 오늘 일차가 완료돼요.':'문제를 풀 때마다 자동으로 저장돼요.'}</p></div>`;}
function answer(index){const s=state.session;if(!s)return;const q=s.questions[s.index];if(q.selected!==null||!q.options[index])return;q.selected=q.options[index];save();render('quiz');$('.quiz-bottom .button')?.focus({preventScroll:true});}
function quizNext(){const s=state.session;if(!s||s.questions[s.index].selected===null)return;if(s.index<s.questions.length-1){s.index++;save();render('quiz');$('.quiz-type')?.scrollIntoView({block:'center'});}else{lastResult=finishSession(state,s);save();go('result');window.scrollTo(0,0);}}
function renderResult(){const r=lastResult;return `<div class="quiz-wrap">${heading('ONE STEP FORWARD','오늘도 한 걸음, 해냈어요.','작은 성취를 오래 기억해 주세요.')}<section class="glass result-panel"><div class="result-seal">✓</div><h1>${r.mode==='daily'?`${r.day}일차 학습 완료!`:'복습 시험 완료!'}</h1><p>${r.mode==='daily'?'점수와 함께 오늘의 진도를 저장했어요.':'오늘 만난 단어들이 조금 더 익숙해졌을 거예요.'}</p><div class="result-number">${Math.round(r.score/r.total*100)}<small>점</small></div><p>${r.total}문제 중 ${r.score}개 정답 · ${r.total-r.score}개 다시 보기</p><div class="result-actions"><button class="button" data-action="${r.mode==='daily'?'continue':'review'}">${r.mode==='daily'&&completedCount()<60?'다음 학습으로':'복습하러 가기'} ${icon('arrow')}</button>${r.wrongIds.length?'<button class="button secondary" data-action="retry-wrong">틀린 단어 다시 풀기</button>':''}</div></section>${r.wrongIds.length?`<div class="section-head"><h2>한 번 더 기억할 단어</h2></div><section class="glass">${r.wrongIds.map(id=>{const w=byId[id];return `<div class="mistake-item"><strong lang="ja">${esc(w.word)}</strong><span>${esc(w.reading)} · ${esc(w.meaning)}</span><button class="icon-button" data-action="speak" data-id="${id}" data-kind="word" aria-label="발음 듣기">${icon('sound')}</button></div>`;}).join('')}</section>`:'<div class="tip-card" style="margin-top:20px;text-align:center">모두 맞혔어요! 조금 뒤에 다시 복습하면 더 오래 기억할 수 있어요.</div>'}</div>`;}
function prepareWordAudio(){
  const element=document.createElement('audio');element.id='word-audio';element.preload='auto';element.setAttribute('playsinline','');element.hidden=true;document.body.append(element);
  wordAudio=new WordAudio(element,{onState:status=>{
    clearTimeout(audioNoticeTimer);
    if(status==='loading')audioNoticeTimer=setTimeout(()=>toast('음성을 준비하고 있어요…'),500);
    else if($('#toast').textContent==='음성을 준비하고 있어요…')$('#toast').classList.remove('visible');
  }});
}
function warmAudio(){
  clearTimeout(audioWarmTimer);audioWarmTimer=setTimeout(()=>{
    if(!wordAudio||!state||state.settings.voice!=='recorded'||document.hidden)return;
    const words=route==='math'?math.warmWords():route==='quiz'?[byId[state.session?.questions[state.session.index]?.wordId]]:route==='today'?current().words.slice(state.cursors[state.currentDay]||0,(state.cursors[state.currentDay]||0)+3):[];
    wordAudio.warm(words.filter(Boolean).flatMap(w=>{const audio=w.audio||audioManifest[w.id];return [audio?.word,audio?.example];}));
  },180);
}
function stopAudio(){playToken++;wordAudio?.stop();try{window.speechSynthesis?.cancel?.();}catch{}speech=null;}
function speak(id,kind='word'){
  const w=byId[id]||math.getWord(id);if(!w)return;
  listener?.pause();stopAudio();const token=playToken;
  const audio=w.audio||audioManifest[id];
  if(state.settings.voice==='recorded'&&audio?.[kind]){
    wordAudio.play(audio[kind],state.settings.rate,error=>{
      if(token!==playToken)return;
      if(error?.name==='NotAllowedError'){toast('음성 버튼을 한 번 더 눌러 주세요.');return;}
      toast('연결이 늦어 기기 음성으로 읽을게요.');speakDevice(kind==='word'?w.reading:w.example,token);
    });return;
  }
  speakDevice(kind==='word'?w.reading:w.example,token);
}
function speakDevice(text,token=playToken){if(!('speechSynthesis'in window)){toast('이 브라우저에서는 음성을 재생할 수 없어요. 인터넷 연결과 기본 음성 설정을 확인해 주세요.');return;}if(token!==playToken)return;const jp=voices.filter(v=>/^ja([-_]|$)/i.test(v.lang));speech=new SpeechSynthesisUtterance(text);speech.lang='ja-JP';speech.voice=jp.find(v=>v.voiceURI===state.settings.voice)||jp.find(v=>/Nanami|Kyoko|Haruka|Sayaka|O-Ren/i.test(v.name))||jp[0]||null;speech.rate=state.settings.rate*.88;speech.pitch=state.settings.pitch;speech.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))toast('일본어 음성을 재생하지 못했어요. 설정에서 기본 음성을 선택해 주세요.');};speechSynthesis.speak(speech);}
function showDialog(title,body){dialog.dataset.panel='';dialog.innerHTML=`<div class="dialog-head"><h2>${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="닫기">${icon('close')}</button></div>${body}`;if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else{dialog.setAttribute('open','');dialog.classList.add('dialog-fallback');}}}
function closeDialog(){if(typeof dialog.close==='function')dialog.close();else{dialog.removeAttribute('open');dialog.classList.remove('dialog-fallback');}}
function showSettings(){const jp=voices.filter(v=>/^ja([-_]|$)/i.test(v.lang));showDialog('나에게 맞는 학습 공간',`<p class="dialog-copy">발음과 학습 기록을 여기에서 관리해요.</p><div class="settings-actions"><button class="button secondary" data-action="phone-help">휴대폰에서 열기 · QR 코드</button></div><section class="setting-group"><h3>귀로 익히는 일본어</h3><label class="setting-row">목소리<select id="voice-select"><option value="recorded">기본 음성 · Nanami</option><option value="device" ${state.settings.voice==='device'?'selected':''}>기기 일본어 음성</option>${jp.map(v=>`<option value="${esc(v.voiceURI)}" ${state.settings.voice===v.voiceURI?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label><p>기본 음성은 밝고 부드러운 일본어 여성 음성으로 미리 준비했어요. 특정 캐릭터의 목소리와는 다르며, 숨소리의 양을 따로 조절할 수는 없어요.</p><label class="setting-row">읽기 속도 <span><input id="voice-rate" type="range" min="0.7" max="1.4" step="0.05" value="${state.settings.rate}" aria-label="읽기 속도"> <output id="rate-value">${state.settings.rate.toFixed(2)}×</output></span></label><label class="setting-row">기기 음성의 높이 <input id="voice-pitch" type="range" min="0.7" max="1.5" step="0.05" value="${state.settings.pitch}" aria-label="기기 음성의 높이" ${state.settings.voice==='recorded'?'disabled':''}></label><button class="button secondary" data-action="voice-test">${icon('sound')} 지금 단어로 미리 듣기</button></section><section class="setting-group"><h3>학습 화면</h3><label class="setting-row">히라가나 읽기 표시<input type="checkbox" id="show-readings" ${state.settings.showReadings?'checked':''}></label></section><section class="setting-group"><h3>내 학습 기록</h3><p>일차·단어 위치·완료한 시험·오답을 이 브라우저에 자동 저장해요. 날짜가 바뀌거나 브라우저를 닫아도 같은 기기·브라우저로 돌아오면 이어서 공부할 수 있어요. 기기 간 자동 동기화는 되지 않아요. 비공개 탐색이나 사이트 데이터 삭제 시 기록이 사라질 수 있으니 백업해 주세요.</p><div class="settings-actions"><button class="button secondary" data-action="export">${icon('download')} 기록 백업</button><button class="button secondary" data-action="import">${icon('upload')} 백업 가져오기</button></div><p>이전 주소에서 공부했다면 <a href="https://n2-sixty-days.spry-tune-5245.chatgpt.site/" target="_blank" rel="noopener" style="text-decoration:underline">기존 단어장 열기</a> → 설정 → 기록 백업 후, 여기서 백업 가져오기를 선택해 주세요. 아이폰에서는 Safari의 ‘홈 화면에 추가’로 더 편하게 열 수 있어요.</p></section><div class="about-note">하루 20개 × 60일, 총 ${all.length.toLocaleString()}개. N3 기초 보완과 N2 대비 어휘로 구성한 자체 학습 자료예요. JLPT는 공식 어휘 목록을 제공하지 않으며, 합격에는 문법·독해·청해 학습도 필요해요. <a href="https://www.jlpt.jp/e/about/levelsummary.html" target="_blank" rel="noopener">JLPT N2 수준 안내 ↗</a><br>학습 순서: 새 단어 → 예문 듣고 따라 읽기 → 일차 시험 → 오답 복습. 이전 일차는 1·3·7일 뒤 다시 시험 보면 좋아요.</div>`);}

const SITE_URL=new URL('./',document.baseURI).href;
function showPhoneHelp(){showDialog('휴대폰에서 단어장 열기',`<p class="dialog-copy">휴대폰 카메라로 QR 코드를 비추거나, 아래 주소를 휴대폰 브라우저에서 열어 주세요.</p><img class="phone-qr" src="./phone-qr.svg" alt="60일 N2 단어장으로 연결되는 QR 코드" width="180" height="180"><a class="phone-link" href="${SITE_URL}" target="_blank" rel="noopener">${SITE_URL}</a><div class="phone-controls"><button class="button" data-action="copy-link">${icon('list')} 주소 복사</button><button class="button secondary" data-action="export">${icon('download')} 현재 진도 백업</button></div><ol class="phone-steps"><li>휴대폰의 <b>Safari 또는 Chrome</b>에서 이 주소를 열어요.</li><li><b>ChatGPT 로그인 없이</b> 바로 공부할 수 있어요. 링크나 QR 코드를 공유하면 누구나 열 수 있어요.</li><li>컴퓨터의 기록을 옮기려면 <b>현재 진도 백업</b> 파일을 휴대폰으로 옮긴 뒤, 휴대폰의 설정에서 <b>백업 가져오기</b>를 선택해요.</li></ol><div class="mobile-setup"><p><b>아이폰 · 홈 화면에 두기</b><br>Safari에서 열기 → 공유(또는 페이지 메뉴 → 공유) → 홈 화면에 추가 → 추가. ‘웹 앱으로 열기’가 보이면 켜 주세요. <a href="https://support.apple.com/ko-kr/guide/iphone/iphea86e5236/ios" target="_blank" rel="noopener">Apple 안내 ↗</a></p><p><b>안드로이드 · 홈 화면에 두기</b><br>Chrome에서 열기 → 오른쪽 위 ⋮ 메뉴 → 설치 및 바로가기 만들기 → 설치. 버전에 따라 ‘홈 화면에 추가’ 또는 ‘앱 설치’로 표시될 수 있어요. <a href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=ko" target="_blank" rel="noopener">Chrome 안내 ↗</a></p></div><p class="phone-help-note">학습 기록은 각자의 기기·브라우저에 저장돼요. 링크를 공유해도 내 진도가 다른 사람에게 보이지 않아요. 기기를 옮길 때는 백업으로 기록을 가져와 주세요.</p>`);}
async function copySiteLink(){try{await navigator.clipboard.writeText(SITE_URL);toast('사이트 주소를 복사했어요.');}catch{showDialog('사이트 주소를 복사해 주세요',`<p class="dialog-copy">아래 주소를 길게 누르거나 선택해서 복사한 뒤 휴대폰에서 열어 주세요.</p><input id="site-link-input" aria-label="사이트 주소" value="${SITE_URL}" readonly style="width:100%;margin-top:16px;padding:12px;border:1px solid #bda0d4;border-radius:8px;font-size:11px"><div class="dialog-actions"><button class="button secondary" data-action="phone-help">안내로 돌아가기</button></div>`);$('#site-link-input').select();}}

function exportProgress(){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`n2-progress-${new Date().toLocaleDateString('sv-SE')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('학습 기록을 백업 파일로 내려받았어요.');}
document.addEventListener('click',event=>{
  if(route!=='math'||!state)return;
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  switch(button.dataset.action){
    case'math-close':go(math.returnRoute);break;
    case'math-retry':math.load();render('math');break;
    case'math-prev':math.select(math.index()-1);break;
    case'math-next':math.select(math.index()+1);break;
    case'math-known':math.toggleKnown();break;
  }
});
document.addEventListener('input',event=>{if(route==='math'&&event.target.id==='math-scrub')math.select(event.target.value);});
document.addEventListener('change',event=>{if(route==='math'&&event.target.id==='math-group')math.setGroup(event.target.value);});
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el||el.disabled||!state)return;const a=el.dataset.action;const d=current();const idx=state.cursors[d.day]||0;switch(a){case'today':case'course':case'review':case'records':go(a);break;case'day':openDay(el.dataset.day);break;case'open-word':{const w=byId[el.dataset.id];openDay(w.day,w.index);break;}case'day-list':go('daylist');break;case'prev':case'next':case'word-index':selectWord(a==='word-index'?Number(el.dataset.index):idx+(a==='prev'?-1:1));break;case'bookmark':{const id=el.dataset.id;state.bookmarks=state.bookmarks.includes(id)?state.bookmarks.filter(x=>x!==id):[...state.bookmarks,id];save();if(route==='today')updateWordContent();else render(route);toast(state.bookmarks.includes(id)?'별표 단어장에 저장했어요.':'저장한 단어에서 뺐어요.');break;}case'speak':speak(el.dataset.id,el.dataset.kind);break;case'listen':showListening();break;case'listen-play':toggleListening();break;case'listen-prev':listener?.skip(-1);break;case'listen-next':listener?.skip(1);break;case'stop-audio':listener?.pause();stopAudio();toast('음성을 멈췄어요.');break;case'phone-help':showPhoneHelp();break;case'copy-link':copySiteLink();break;case'daily-quiz':startQuiz('daily',d.words,20,d.day);break;case'resume':closeDialog();go('quiz');break;case'answer':answer(Number(el.dataset.index));break;case'quiz-next':quizNext();break;case'review-kind':reviewKind=el.dataset.kind;render('review');break;case'review-start':{const pool=reviewPool(state,all,reviewKind);startQuiz(reviewKind,pool,reviewCount==='all'?pool.length:Number(reviewCount));break;}case'retry-wrong':startQuiz('wrong',lastResult.wrongIds.map(id=>byId[id]),lastResult.wrongIds.length);break;case'continue':{const next=days.find(d=>d.day>lastResult.day&&!state.completed[d.day])||days.find(d=>!state.completed[d.day]);if(next)openDay(next.day);else go('review');break;}case'settings':showSettings();break;case'close-dialog':closeDialog();break;case'voice-test':speak(current().words[state.cursors[state.currentDay]||0].id);break;case'export':exportProgress();break;case'import':$('#import-file').click();break;case'import-confirm':if(pendingImport){listener?.clear();state=pendingImport;pendingImport=null;stopAudio();save();closeDialog();go('today');toast('백업 기록을 가져왔어요. 이어서 공부해 볼까요?');}break;}});
document.addEventListener('input',e=>{if(!state)return;const id=e.target.id;if(id==='word-scrub'){selectWord(e.target.value);return;}if(id==='listen-seek'){seekListening(e.target.value);return;}if(id==='course-search'){search=e.target.value;$('#course-results').innerHTML=courseResults();}if(id==='voice-rate'){state.settings.rate=Number(e.target.value);if(listener)listener.audio.playbackRate=state.settings.rate;$('#rate-value').textContent=state.settings.rate.toFixed(2)+'×';save();}if(id==='voice-pitch'){state.settings.pitch=Number(e.target.value);save();}});
document.addEventListener('change',e=>{if(!state)return;const id=e.target.id;if(id==='listen-scope'||id==='listen-start'){changeListeningSelection();return;}if(id==='listen-loop'){state.listening.loop=e.target.checked;listener.audio.loop=e.target.checked;save();return;}if(id==='course-filter'){courseFilter=e.target.value;$('#course-results').innerHTML=courseResults();}if(id==='review-count')reviewCount=e.target.value;if(id==='voice-select'){state.settings.voice=e.target.value;$('#voice-pitch').disabled=e.target.value==='recorded';save();stopAudio();}if(id==='show-readings'){state.settings.showReadings=e.target.checked;save();render(route);}});
$('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>2*1024*1024)throw new Error('파일이 너무 커요. 이 단어장에서 만든 백업을 골라 주세요.');const raw=JSON.parse(await file.text());pendingImport=validateState(raw,all);showDialog('이 백업으로 이어서 공부할까요?',`<p class="dialog-copy">완료 ${Object.keys(pendingImport.completed).length}일차 · 시험 ${pendingImport.history.length}회 · 별표 ${pendingImport.bookmarks.length}개가 들어 있어요.<br>현재 브라우저의 기록을 이 백업으로 교체해요. 필요하다면 먼저 현재 기록을 백업해 주세요.</p><div class="dialog-actions"><button class="button secondary" data-action="export">현재 기록 백업</button><button class="button" data-action="import-confirm">기록 가져오기</button></div>`);}catch(err){pendingImport=null;toast(err instanceof SyntaxError?'올바른 JSON 백업 파일이 아니에요.':err.message);}});
document.addEventListener('keydown',e=>{if(dialog.open||route!=='quiz'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;if(/^[1-4]$/.test(e.key)){e.preventDefault();answer(Number(e.key)-1);}});
window.addEventListener('hashchange',()=>{if(!state)return;stopAudio();render();window.scrollTo(0,0);});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
function loadListeningManifest(){
  if(listenManifest)return Promise.resolve(listenManifest);
  if(!listenPromise)listenPromise=fetchJSON('./listening-manifest.json',20000).then(value=>{if(!Array.isArray(value.tracks)||value.tracks.length!==73)throw new Error('듣기 자료를 다시 불러와 주세요.');listenManifest=value;return value;}).catch(error=>{listenPromise=null;throw error;});
  return listenPromise;
}
function prepareListening(){
  listener=new ListeningPlayer($('#listening-audio'),{
    getWord:id=>byId[id],onError:toast,onUpdate:updateListeningUI,
    onSave:status=>{if(!state)return;state.listening.trackId=status.trackId;state.listening.position=status.position;save();}
  });
  loadListeningManifest().catch(()=>{});
}
function showListening(){
  if(!state.listening.trackId)state.listening.start=state.currentDay;
  go('listen');
}
function renderListening(){
  const title=heading('LISTEN & REMEMBER','듣기','발음 세 번, 한국어 뜻 한 번. 원하는 범위를 골라 들어요.');
  if(!listenManifest){
    loadListeningManifest().then(()=>{if(route==='listen')render('listen');}).catch(error=>{if(route==='listen')$('#listen-loading').innerHTML=`<p>${esc(error.message)}</p><button class="button" data-action="listen">다시 불러오기</button>`;});
    return title+'<section id="listen-loading" class="glass listening-panel"><p>듣기 목록을 준비하고 있어요…</p></section>';
  }
  if(!state.listening.trackId)state.listening.start=state.currentDay;
  const l=state.listening,selection=listeningSelection(l.scope,l.start),track=listenManifest.tracks.find(t=>t.id===selection.id);
  const options=selection.scope==='five'?Array.from({length:12},(_,i)=>({value:i*5+1,label:`${i*5+1}–${i*5+5}일차`})):days.map(d=>({value:d.day,label:`${d.day}일차 · ${d.title}`}));
  const position=l.trackId===track.id?l.position:0;
  const firstWord=byId[entryAt(track.words,position).id];
  return title+`<section class="glass listening-panel"><div class="listen-selectors"><label>듣기 범위<select id="listen-scope"><option value="day" ${selection.scope==='day'?'selected':''}>1일씩 듣기 · 20단어</option><option value="five" ${selection.scope==='five'?'selected':''}>5일씩 듣기 · 100단어</option><option value="all" ${selection.scope==='all'?'selected':''}>전체 듣기 · 1,200단어</option></select></label>${selection.scope!=='all'?`<label>일차 선택<select id="listen-start">${options.map(o=>`<option value="${o.value}" ${o.value===selection.start?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`:''}</div><div class="listen-now"><span class="eyebrow">${selection.start===selection.end?`${selection.start}일차`:`${selection.start}–${selection.end}일차`} · ${track.words.length}단어</span><strong id="listen-word" lang="ja" style="--word-chars:${Math.max(1,[...firstWord.word].length*1.09)}">${esc(firstWord.word)}</strong><p id="listen-meaning">${esc(firstWord.meaning)}</p></div><input id="listen-seek" type="range" min="0" max="${Math.ceil(track.duration)}" value="${Math.floor(position)}" step="1" aria-label="듣기 위치"><div class="listen-time"><span id="listen-time">${formatTime(position)}</span><span>${formatTime(track.duration)}</span></div><div class="listen-controls"><button class="button secondary" data-action="listen-prev" aria-label="이전 듣기 단어">${icon('left')}</button><button class="button" data-action="listen-play">재생하기</button><button class="button secondary" data-action="listen-next" aria-label="다음 듣기 단어">${icon('arrow')}</button></div><label class="setting-row">선택한 범위 반복<input id="listen-loop" type="checkbox" ${l.loop?'checked':''}></label><p class="listen-note">잠금 화면에서도 재생·일시정지를 사용할 수 있어요. 듣기 위치는 저장되며, 다시 열었을 때 재생을 누르면 이어져요.</p><a class="listen-download" href="${esc(track.src)}" download>선택한 범위 음성 파일 내려받기 ↗</a><p class="listen-note">일차 완료는 기존처럼 시험을 끝까지 풀면 기록돼요.</p></section>`;
}
function changeListeningSelection(){
  const selection=listeningSelection($('#listen-scope').value,Number($('#listen-start')?.value)||state.currentDay);
  listener.clear();state.listening={scope:selection.scope,start:selection.start,trackId:selection.id,position:0,loop:state.listening.loop};save();render('listen');
}
function toggleListening(){
  const selection=listeningSelection(state.listening.scope,state.listening.start),track=listenManifest?.tracks.find(t=>t.id===selection.id);
  if(!track){toast('듣기 목록을 다시 불러와 주세요.');return;}
  if(listener.track?.id===track.id&&!listener.audio.paused){listener.pause();return;}
  stopAudio();const position=state.listening.trackId===track.id?state.listening.position:0;
  listener.load(track,position);listener.audio.loop=state.listening.loop;listener.audio.playbackRate=state.settings.rate;listener.play();
}
function seekListening(time){
  if(!listener.track){
    const selection=listeningSelection(state.listening.scope,state.listening.start),track=listenManifest?.tracks.find(t=>t.id===selection.id);
    if(!track)return;
    listener.load(track,Number(time));
  }else listener.seek(time);
  state.listening.position=Number(time);save();updateListeningUI(listener.snapshot());
}
function updateListeningButton(){
  const button=$('.nav-item[href="#listen"]');if(!button)return;
  const playing=listener&&!listener.audio.paused;button.classList.toggle('is-playing',playing);button.setAttribute('aria-label',playing?'듣기 · 재생 중':'듣기');
}
function updateListeningUI(status){
  updateListeningButton();
  if(route!=='listen'||!$('#listen-scope'))return;
  const selection=listeningSelection(state.listening.scope,state.listening.start);
  if(status.trackId!==selection.id)return;
  const word=byId[status.entry?.id];if(word){$('#listen-word').textContent=word.word;$('#listen-word').style.setProperty('--word-chars',Math.max(1,[...word.word].length*1.09));$('#listen-meaning').textContent=word.meaning;}
  $('#listen-time').textContent=formatTime(status.position);
  const seek=$('#listen-seek');if(!seek.matches(':active'))seek.value=Math.floor(status.position);seek.setAttribute('aria-valuetext',formatTime(status.position));
  $('[data-action="listen-play"]').textContent=status.playing?'일시정지':'이어서 재생';
}
// Persist the final scrub/playback position even when the browser is closed quickly.
window.addEventListener('pagehide',()=>{if(state){listener?.update(true);save();}});
document.addEventListener('visibilitychange',()=>{if(state&&document.hidden){listener?.update(true);save();}else if(listener)listener.update();});
let cardTouch=null;
let scrubDrag=null,scrubFrame=0,scrubNext=0;
function scrubAt(event){const rect=scrubDrag.element.getBoundingClientRect();scrubNext=Math.round(Math.max(0,Math.min(1,(event.clientX-rect.left-10)/(rect.width-20)))*19);if(!scrubFrame)scrubFrame=requestAnimationFrame(()=>{scrubFrame=0;selectWord(scrubNext);});}
document.addEventListener('pointerdown',event=>{if(event.target.id!=='word-scrub')return;event.preventDefault();scrubDrag={element:event.target,id:event.pointerId};event.target.focus({preventScroll:true});try{event.target.setPointerCapture(event.pointerId);}catch{}scrubAt(event);});
document.addEventListener('pointermove',event=>{if(scrubDrag&&scrubDrag.id===event.pointerId){event.preventDefault();scrubAt(event);}});
document.addEventListener('pointerup',event=>{if(!scrubDrag||scrubDrag.id!==event.pointerId)return;scrubAt(event);cancelAnimationFrame(scrubFrame);scrubFrame=0;selectWord(scrubNext);save();scrubDrag=null;});
document.addEventListener('pointercancel',()=>{if(scrubDrag){cancelAnimationFrame(scrubFrame);scrubFrame=0;save();scrubDrag=null;}});
document.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'||!event.target.closest('.word-main,.example')||event.target.closest('button,input,a'))return;cardTouch={x:event.clientX,y:event.clientY,id:event.pointerId};},{passive:true});
document.addEventListener('pointerup',event=>{if(!cardTouch||event.pointerId!==cardTouch.id)return;const dx=event.clientX-cardTouch.x,dy=event.clientY-cardTouch.y;cardTouch=null;if(Math.abs(dx)>36&&Math.abs(dx)>Math.abs(dy)*1.5){if(route==='today')selectWord((state.cursors[state.currentDay]||0)+(dx<0?1:-1));else if(route==='math')math.select(math.index()+(dx<0?1:-1));}},{passive:true});
document.addEventListener('pointercancel',()=>{cardTouch=null;},{passive:true});
function updateStudyViewport(){document.documentElement.style.setProperty('--study-vh',(window.visualViewport?.height||window.innerHeight)+'px');if(route==='today')setupStudyCard();else if(route==='math')math.layout();}
let viewportFrame=0;
function queueStudyViewport(){if(!viewportFrame)viewportFrame=requestAnimationFrame(()=>{viewportFrame=0;updateStudyViewport();});}
window.addEventListener('resize',queueStudyViewport,{passive:true});
window.visualViewport?.addEventListener('resize',queueStudyViewport,{passive:true});
updateStudyViewport();

// Voice enumeration is optional: older Safari exposes speechSynthesis without
// EventTarget methods. Never let it prevent vocabulary or recorded audio loading.
function prepareVoices(){
  try{
    const synth=window.speechSynthesis;
    if(!synth)return;
    const updateVoices=()=>{try{voices=typeof synth.getVoices==='function'?synth.getVoices():[];}catch{voices=[];}};
    updateVoices();
    if(typeof synth.addEventListener==='function')synth.addEventListener('voiceschanged',updateVoices);
    else if('onvoiceschanged'in synth)synth.onvoiceschanged=updateVoices;
  }catch{voices=[];}
}
async function fetchJSON(url,timeout=12000){
  const controller=typeof AbortController==='function'?new AbortController():null;
  let timer;
  try{
    return await Promise.race([
      fetch(url,controller?{signal:controller.signal}:{}).then(response=>{
        if(!response.ok)throw new Error('단어 데이터를 불러오지 못했어요.');
        return response.json();
      }),
      new Promise((_,reject)=>{timer=setTimeout(()=>{
        reject(new Error('연결이 늦어지고 있어요. 인터넷 연결을 확인하고 다시 불러와 주세요.'));
        controller?.abort();
      },timeout);})
    ]);
  }finally{clearTimeout(timer);}
}
async function init(){
  try{
    days=await fetchJSON('./vocabulary.json');
    if(days.length!==60||days.some(d=>d.words.length!==20))throw new Error('학습 데이터가 완전하지 않아요.');
    all=days.flatMap(d=>d.words.map((w,i)=>({...w,id:`d${pad(d.day)}-${pad(i+1)}`,day:d.day,index:i})));
    byId=Object.fromEntries(all.map(w=>[w.id,w]));
    days=days.map(d=>({...d,words:all.filter(w=>w.day===d.day)}));
    state=defaults();
    try{const stored=localStorage.getItem(STORAGE_KEY);if(stored)state=validateState(JSON.parse(stored),all);}
    catch{storageError=true;toast('저장 기록을 읽지 못했어요. 백업이 있다면 설정에서 가져와 주세요.');}
    audioManifest=Object.fromEntries(all.filter(w=>w.audio).map(w=>[w.id,w.audio]));
    prepareWordAudio();
    prepareListening();
    render();
    window.N2Boot?.ready();
    if(!Object.keys(audioManifest).length)fetchJSON('./audio-manifest.json').then(m=>{audioManifest=m;warmAudio();}).catch(()=>{});
    prepareVoices();
    if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }catch(err){
    if(window.N2Boot)window.N2Boot.failed(err.message);
    else main.innerHTML=`<section class="glass error-box"><h1>단어장을 불러오지 못했어요.</h1><p>${esc(err.message)}</p><button class="button" onclick="location.reload()">다시 불러오기</button></section>`;
  }
}
init();
