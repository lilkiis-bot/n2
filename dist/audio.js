// Reuse one media element and keep only a few nearby clips in memory.
export class WordAudio {
  constructor(audio,{onState=()=>{},timeout=7000}={}){
    this.audio=audio;this.onState=onState;this.timeout=timeout;
    this.version=0;this.timer=0;this.cache=new Map();this.pending=new Map();this.queue=[];this.activeURL=null;
  }
  stop(){
    this.version++;clearTimeout(this.timer);
    this.audio.onplaying=this.audio.onwaiting=this.audio.onstalled=this.audio.onerror=this.audio.onended=null;
    this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.activeURL=null;this.onState('idle');
  }
  play(source,rate=1,onError=()=>{}){
    this.stop();const token=this.version;
    const fail=error=>{if(token!==this.version)return;this.stop();onError(error);};
    const waiting=()=>{if(token!==this.version)return;this.onState('loading');clearTimeout(this.timer);this.timer=setTimeout(()=>fail(new Error('audio-timeout')),this.timeout);};
    this.audio.onplaying=()=>{if(token!==this.version)return;clearTimeout(this.timer);this.onState('playing');};
    this.audio.onwaiting=this.audio.onstalled=waiting;
    this.audio.onerror=()=>fail(this.audio.error);
    this.audio.onended=()=>{if(token===this.version){clearTimeout(this.timer);this.onState('idle');}};
    this.activeURL=this.cache.get(source)||source;
    this.audio.src=this.activeURL;this.audio.playbackRate=rate;this.audio.preservesPitch=true;
    waiting();
    try{const result=this.audio.play();if(result?.catch)result.catch(fail);}catch(error){fail(error);}
  }
  warm(sources){
    const wanted=new Set(sources.filter(Boolean).slice(0,6));
    for(const [source,controller] of this.pending)if(!wanted.has(source))controller.abort();
    this.queue=[...wanted].filter(source=>!this.cache.has(source)&&!this.pending.has(source));this.pump();
  }
  pump(){
    while(this.pending.size<2&&this.queue.length){
      const source=this.queue.shift(),controller=new AbortController();this.pending.set(source,controller);
      const timer=setTimeout(()=>controller.abort(),6000);
      fetch(source,{signal:controller.signal,cache:'force-cache'}).then(response=>{if(!response.ok)throw new Error('audio-fetch');return response.blob();}).then(blob=>{
        if(controller.signal.aborted)return;
        this.cache.set(source,URL.createObjectURL(blob));
        for(const [key,url] of this.cache){if(this.cache.size<=8)break;if(url===this.activeURL)continue;URL.revokeObjectURL(url);this.cache.delete(key);}
      }).catch(()=>{}).finally(()=>{clearTimeout(timer);this.pending.delete(source);this.pump();});
    }
  }
}
