export function listeningSelection(scope='day',day=1){
  day=Math.max(1,Math.min(60,Number(day)||1));
  if(scope==='all')return {scope:'all',start:1,end:60,id:'all'};
  if(scope==='five'){const start=Math.floor((day-1)/5)*5+1;return {scope:'five',start,end:start+4,id:`five-${String(start).padStart(2,'0')}`};}
  return {scope:'day',start:day,end:day,id:`day-${String(day).padStart(2,'0')}`};
}
export function entryAt(words,time){
  let low=0,high=words.length-1;
  while(low<high){const mid=Math.ceil((low+high)/2);if(words[mid].at<=time)low=mid;else high=mid-1;}
  return words[low]||null;
}
export function formatTime(seconds){seconds=Math.max(0,Math.floor(seconds||0));const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=String(seconds%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`;}

// A single native media file contains every repetition and meaning in the scope.
// No timers, speechSynthesis, or track switching are needed while the screen is locked.
export class ListeningPlayer{
  constructor(audio,{onUpdate=()=>{},onSave=()=>{},onError=()=>{},getWord=()=>null}={}){
    this.audio=audio;this.onUpdate=onUpdate;this.onSave=onSave;this.onError=onError;this.getWord=getWord;
    this.track=null;this.pendingSeek=null;this.lastSave=0;this.lastWord=null;
    audio.addEventListener('loadedmetadata',()=>{if(this.pendingSeek!==null){this.seek(this.pendingSeek);this.pendingSeek=null;}this.update(true);});
    for(const event of ['play','pause','ended','ratechange','seeked'])audio.addEventListener(event,()=>this.update(true));
    audio.addEventListener('timeupdate',()=>this.update());
    audio.addEventListener('error',()=>{if(audio.error&&this.track)this.onError('음성을 불러오지 못했어요. 연결을 확인하고 다시 재생해 주세요.');});
    for(const [action,handler] of Object.entries({play:()=>this.play(),pause:()=>this.pause(),stop:()=>this.pause(),seekbackward:d=>this.seek(audio.currentTime-(d.seekOffset||10)),seekforward:d=>this.seek(audio.currentTime+(d.seekOffset||10)),seekto:d=>this.seek(d.seekTime),previoustrack:()=>this.skip(-1),nexttrack:()=>this.skip(1)})){
      try{navigator.mediaSession?.setActionHandler(action,handler);}catch{}
    }
  }
  load(track,position=0){
    if(this.track?.id===track.id)return;
    this.audio.pause();this.track=track;this.lastWord=null;this.pendingSeek=position;
    this.audio.src=new URL(track.src,document.baseURI).href;
    this.audio.load();this.update();
  }
  async play(){
    if(!this.track)return;
    try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
    try{await this.audio.play();}catch(error){if(error.name!=='AbortError')this.onError('재생 버튼을 다시 눌러 주세요. 인터넷 연결도 확인해 주세요.');}
  }
  pause(){this.audio.pause();this.update(true);}
  clear(){this.pause();this.track=null;this.pendingSeek=null;this.audio.removeAttribute('src');this.audio.load();}
  seek(time){
    if(!this.track)return;
    const position=Math.max(0,Math.min(this.track.duration-.05,Number(time)||0));
    if(!this.audio.readyState){this.pendingSeek=position;return;}
    try{this.audio.currentTime=position;this.pendingSeek=null;}catch{this.pendingSeek=position;}
  }
  skip(direction){
    if(!this.track)return;
    const current=entryAt(this.track.words,this.audio.currentTime),index=this.track.words.indexOf(current);
    const target=direction<0&&this.audio.currentTime-current.at>2?index:Math.max(0,Math.min(this.track.words.length-1,index+direction));
    this.seek(this.track.words[target].at);
  }
  snapshot(){const position=this.pendingSeek??this.audio.currentTime;return {trackId:this.track?.id||null,position,playing:!this.audio.paused,duration:this.track?.duration||0,entry:this.track?entryAt(this.track.words,position):null};}
  update(force=false){
    const status=this.snapshot();
    if(!this.track)return;
    if(force||performance.now()-this.lastSave>5000){this.onSave(status);this.lastSave=performance.now();}
    if(document.visibilityState!=='hidden')this.onUpdate(status);
    if(status.entry?.id!==this.lastWord){
      this.lastWord=status.entry?.id;
      const w=this.getWord(this.lastWord);
      try{if(w&&'MediaMetadata'in window)navigator.mediaSession.metadata=new MediaMetadata({title:`${w.word} · ${w.meaning}`,artist:'발음 3번 · 한국어 뜻',album:`N2 60일 · ${this.track.from}–${this.track.to}일차`,artwork:[{src:new URL('./icon-512.png',document.baseURI).href,sizes:'512x512',type:'image/png'}]});}catch{}
    }
    try{navigator.mediaSession.playbackState=status.playing?'playing':'paused';if(Number.isFinite(this.audio.duration))navigator.mediaSession.setPositionState({duration:this.audio.duration,playbackRate:this.audio.playbackRate,position:Math.min(this.audio.currentTime,this.audio.duration)});}catch{}
  }
}
