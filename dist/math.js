// The hidden notebook loads its vocabulary only when opened.
const DATA_URL='./math-vocabulary.json?v=d57101965e5b';

export function installSevenTap(open,{document:doc=document,now=()=>performance.now()}={}){
  let pointer=null,count=0,last=0,first=0,blockClickUntil=0;
  const reset=()=>{pointer=null;count=0;last=0;first=0;};
  doc.addEventListener('pointerdown',event=>{
    if(event.isPrimary===false||event.button!==0){reset();return;}
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,at:now()};
  },{capture:true,passive:true});
  doc.addEventListener('pointermove',event=>{
    if(pointer&&event.pointerId===pointer.id&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>12)reset();
  },{capture:true,passive:true});
  doc.addEventListener('pointercancel',reset,{capture:true,passive:true});
  doc.addEventListener('pointerup',event=>{
    const p=pointer,t=now();pointer=null;
    if(!p||p.id!==event.pointerId||t-p.at>450||Math.hypot(event.clientX-p.x,event.clientY-p.y)>12){reset();return;}
    if(!count||t-last>850||t-first>4000){count=0;first=t;}
    last=t;
    if(++count===7){reset();if(open()!==false)blockClickUntil=t+650;}
  },{capture:true,passive:true});
  // The seventh tap opens the notebook without activating the button underneath.
  doc.addEventListener('click',event=>{
    if(now()<blockClickUntil){blockClickUntil=0;event.preventDefault();event.stopImmediatePropagation();}
  },true);
  doc.addEventListener('visibilitychange',reset);
}

export class MathNotebook{
  constructor({getProgress,getSettings,save,refresh,stop,esc,icon,exampleMarkup,warm}){
    Object.assign(this,{getProgress,getSettings,save,refresh,stop,esc,icon,exampleMarkup,warm});
    this.data=null;this.words=new Map();this.promise=null;this.error='';this.returnRoute='today';
  }
  load(){
    if(this.data)return Promise.resolve();
    if(this.promise)return this.promise;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    this.error='';
    this.promise=fetch(DATA_URL,{signal:controller.signal}).then(r=>{
      if(!r.ok)throw new Error('수학 단어장을 불러오지 못했어요. 연결 후 다시 눌러 주세요.');
      return r.json();
    }).then(data=>{
      if(data.version!==1||data.groups.length!==12||data.groups.some(g=>g.words.length!==12))throw new Error('수학 자료를 다시 불러와 주세요.');
      this.data=data;this.words=new Map(data.groups.flatMap(g=>g.words.map(w=>[w.id,w])));
    }).catch(error=>{this.error=error.name==='AbortError'?'연결이 늦어요. 인터넷 연결 후 다시 눌러 주세요.':error.message;})
      .finally(()=>{clearTimeout(timer);this.promise=null;this.refresh();});
    return this.promise;
  }
  group(){return this.data?.groups.find(g=>g.id===this.getProgress().group)||this.data?.groups[0];}
  index(){return Math.max(0,Math.min(11,this.getProgress().cursors[this.group().id]||0));}
  word(){return this.group()?.words[this.index()];}
  getWord(id){return this.words.get(id);}
  warmWords(){return this.group()?.words.slice(this.index(),this.index()+3)||[];}
  render(){
    const {esc,icon}=this;
    const head=`<div class="math-heading"><div><div class="eyebrow">HIDDEN NOTEBOOK · MUSABI</div><h1>수학을 읽는 일본어</h1><p>무사시노미술대 · 영상 / 크리에이티브 이노베이션</p></div><button class="button secondary" data-action="math-close">${icon('left')} 돌아가기</button></div>`;
    if(!this.data){if(!this.promise&&!this.error)this.load();return head+`<section class="glass math-loading" role="status"><p>${esc(this.error||'수학 단어장을 펼치고 있어요…')}</p>${this.error?'<button class="button" data-action="math-retry">다시 불러오기</button>':''}</section>`;}
    const progress=this.getProgress(),g=this.group(),idx=this.index(),w=this.word();
    return head+`<div class="math-workspace"><div class="math-toolbar"><label for="math-group">공부할 분야<select id="math-group">${this.data.groups.map(group=>`<option value="${group.id}" ${g.id===group.id?'selected':''}>${esc(group.title)} · 12단어</option>`).join('')}</select></label><p id="math-progress" aria-live="polite">외운 단어 ${progress.known.length} / 144</p></div>
      <section class="word-card glass math-word-card" aria-label="수학 단어"><div class="word-card-top"><div class="word-meta"><span class="tag">MATH</span><span class="word-counter">WORD ${String(idx+1).padStart(2,'0')}</span></div><button class="math-known" data-action="math-known" aria-pressed="${progress.known.includes(w.id)}">${icon('check')}<span>${progress.known.includes(w.id)?'외웠어요':'외움 표시'}</span></button></div>
      <div class="word-main"><p class="reading" lang="ja">${this.getSettings().showReadings?esc(w.reading):'· · ·'}</p><button class="kanji-button" lang="ja" data-action="speak" data-id="${w.id}" data-kind="word" aria-label="${esc(w.word)} 발음 듣기" style="--word-chars:${[...w.word].length*1.09}">${esc(w.word)}</button><p class="word-meaning">${esc(w.meaning)}</p><div class="word-audio-controls"><button class="word-play" data-action="speak" data-id="${w.id}" data-kind="word">${icon('sound')} 단어만 듣기</button><button class="icon-button stop-audio" data-action="stop-audio" aria-label="음성 멈추기">${icon('close')}</button></div></div>
      ${this.exampleMarkup(w)}<div class="word-nav"><button class="button secondary" data-action="math-prev" ${idx===0?'disabled':''}>${icon('left')} 이전</button><span class="word-index"><b>${String(idx+1).padStart(2,'0')}</b> / 12</span><button class="button secondary" data-action="math-next" ${idx===11?'disabled':''}>다음 ${icon('arrow')}</button></div><label class="math-scrubber"><input id="math-scrub" type="range" min="0" max="11" value="${idx}" step="1" aria-label="수학 단어 넘기기" aria-valuetext="${idx+1}번째 단어 ${esc(w.word)}"><span>좌우로 쓸어서 넘기기</span></label></section>
      <p class="math-scope">${esc(g.scope)} <span>· 학습 위치와 외움 표시 자동 저장</span></p>
      <details class="math-source"><summary>시험 범위와 자료 안내</summary><p>2027학년도 조형구상학부 학부통일 방식: 영어＋수학 선택. 각 60분·100점, 객관식입니다.</p><p>수학Ⅰ·Ⅱ, 수학A(도형의 성질·경우의 수와 확률), 수학B(수열) 범위에서 고른 핵심 용어 144개와 자체 예문이에요. 공식 지정 단어 목록은 아니며, 문제 풀이도 함께 연습해 주세요.</p><a href="https://www.musabi.ac.jp/wp-content/uploads/2026/07/2027_ba_guideline.pdf#page=12" target="_blank" rel="noopener">2027 공식 모집요강 · 11쪽 ↗</a><p>화면 어디든 빠르게 7번 탭하면 다시 열 수 있어요.</p></details></div>`;
  }
  select(index){
    if(!this.data)return;
    const next=Math.max(0,Math.min(11,Number(index)||0));
    if(next===this.index())return;
    this.getProgress().cursors[this.group().id]=next;this.stop();this.update();this.save();this.warm();
  }
  setGroup(id){
    if(!this.data?.groups.some(g=>g.id===id))return;
    this.getProgress().group=id;this.stop();this.save();this.refresh();
  }
  toggleKnown(){
    const p=this.getProgress(),id=this.word()?.id;if(!id)return;
    p.known=p.known.includes(id)?p.known.filter(v=>v!==id):[...p.known,id];this.update();this.save();
  }
  update(){
    const card=document.querySelector('.math-word-card');if(!card)return;
    const w=this.word(),idx=this.index(),p=this.getProgress();
    for(const [selector,key] of [['.word-meaning','meaning'],['.example-jp','example'],['.example-reading','exampleReading'],['.example-ko','translation']])card.querySelector(selector).textContent=w[key];
    card.querySelector('.reading').textContent=this.getSettings().showReadings?w.reading:'· · ·';
    const kanji=card.querySelector('.kanji-button');kanji.textContent=w.word;kanji.style.setProperty('--word-chars',[...w.word].length*1.09);kanji.setAttribute('aria-label',w.word+' 발음 듣기');
    card.querySelectorAll('[data-action="speak"]').forEach(button=>button.dataset.id=w.id);
    card.querySelector('.word-counter').textContent='WORD '+String(idx+1).padStart(2,'0');card.querySelector('.word-index b').textContent=String(idx+1).padStart(2,'0');
    card.querySelector('[data-action="math-prev"]').disabled=idx===0;card.querySelector('[data-action="math-next"]').disabled=idx===11;
    const known=card.querySelector('.math-known');known.setAttribute('aria-pressed',p.known.includes(w.id));known.querySelector('span').textContent=p.known.includes(w.id)?'외웠어요':'외움 표시';
    document.querySelector('#math-progress').textContent=`외운 단어 ${p.known.length} / 144`;
    const scrub=card.querySelector('#math-scrub');scrub.value=idx;scrub.setAttribute('aria-valuetext',`${idx+1}번째 단어 ${w.word}`);
  }
  layout(){
    const card=document.querySelector('.math-word-card');if(!card||!this.data)return;
    card.style.setProperty('--word-width',Math.max(150,card.querySelector('.word-main').clientWidth-8)+'px');
    const example=card.querySelector('.example'),key=[this.group().id,example.clientWidth,this.getSettings().showReadings].join(':');
    if(card.dataset.layoutKey===key)return;card.dataset.layoutKey=key;
    const fragment=document.createDocumentFragment(),probes=this.group().words.map(w=>{
      const probe=example.cloneNode(true);probe.setAttribute('aria-hidden','true');probe.style.cssText=`position:absolute;visibility:hidden;pointer-events:none;width:${example.getBoundingClientRect().width}px;height:auto;min-height:0;left:0;top:0;`;
      for(const [selector,key] of [['.example-jp','example'],['.example-reading','exampleReading'],['.example-ko','translation']])probe.querySelector(selector).textContent=w[key];fragment.append(probe);return probe;
    });
    card.append(fragment);const height=Math.max(...probes.map(p=>p.getBoundingClientRect().height));probes.forEach(p=>p.remove());card.style.setProperty('--example-height',Math.ceil(height)+2+'px');
  }
}
