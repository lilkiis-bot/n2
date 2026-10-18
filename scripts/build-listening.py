"""Build continuous, screen-lock-friendly tracks; no browser speech/timers needed."""
import asyncio, concurrent.futures, hashlib, json, pathlib, subprocess, time
import edge_tts
import imageio_ffmpeg

ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'qa/listening-cache'
OUT=ROOT/'dist/listening'
CACHE.mkdir(parents=True,exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
DAYS=json.loads((ROOT/'dist/vocabulary.json').read_text(encoding='utf-8'))
AUDIO=json.loads((ROOT/'dist/audio-manifest.json').read_text(encoding='utf-8'))
VOICE='ko-KR-SunHiNeural'
RATE=24000
VERSION='continuous-v1-sunhi-5pct-3jp'

def digest(value): return hashlib.sha256(value.encode()).hexdigest()[:18]
def korean_path(text): return CACHE/(digest(VERSION+'|'+text)+'.mp3')

async def speech():
    values=sorted({w['meaning'] for d in DAYS for w in d['words']})
    pending=[t for t in values if not korean_path(t).exists() or korean_path(t).stat().st_size<1000]
    sem=asyncio.Semaphore(6)
    done=0
    print(f'Korean meanings: {len(pending)} to generate',flush=True)
    async def generate(text):
        nonlocal done
        async with sem:
            for attempt in range(5):
                try:
                    await asyncio.wait_for(edge_tts.Communicate(text,VOICE,rate='-5%',pitch='+3Hz').save(str(korean_path(text))),60)
                    if korean_path(text).stat().st_size<1000: raise RuntimeError('Empty recording')
                    done+=1
                    if done%100==0: print(f'Korean meanings: {done}/{len(pending)}',flush=True)
                    return
                except Exception:
                    if attempt==4: raise
                    await asyncio.sleep(2**attempt)
    await asyncio.gather(*(generate(t) for t in pending))

def pcm(path):
    target=CACHE/(digest(str(path)) + '.pcm')
    if not target.exists():
        result=subprocess.run([FFMPEG,'-v','error','-i',str(path),'-f','s16le','-ac','1','-ar',str(RATE),'pipe:1'],capture_output=True,check=True)
        target.write_bytes(result.stdout)
    return target.read_bytes()

def encode(sources,target):
    if target.exists() and target.stat().st_size>1000: return
    process=subprocess.Popen([FFMPEG,'-v','error','-y','-f','s16le','-ar',str(RATE),'-ac','1','-i','pipe:0','-c:a','libmp3lame','-b:a','40k','-write_xing','1',str(target)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    for source in sources:
        with source.open('rb') as stream:
            while chunk:=stream.read(1024*1024): process.stdin.write(chunk)
    process.stdin.close()
    error=process.stderr.read()
    if process.wait()!=0: raise RuntimeError(error.decode())

def build_day(day):
    number=day['day']
    entries=[]
    content=bytearray()
    gap=b'\0'*int(RATE*2*.48)
    tail=b'\0'*int(RATE*2*1.05)
    for index,w in enumerate(day['words']):
        word_id=f'd{number:02}-{index+1:02}'
        start=len(content)/(RATE*2)
        pronunciation=pcm(ROOT/'dist'/AUDIO[word_id]['word'])
        for _ in range(3): content.extend(pronunciation); content.extend(gap)
        meaning_at=len(content)/(RATE*2)
        content.extend(pcm(korean_path(w['meaning'])))
        content.extend(tail)
        entries.append({'id':word_id,'at':round(start,3),'meaningAt':round(meaning_at,3),'end':round(len(content)/(RATE*2),3)})
    fingerprint=digest(VERSION+json.dumps(day,ensure_ascii=False))
    raw=CACHE/f'day-{number:02}-{fingerprint}.pcm'
    raw.write_bytes(content)
    filename=f'day-{number:02}-{fingerprint}.mp3'
    encode([raw],OUT/filename)
    return {'id':f'day-{number:02}','from':number,'to':number,'src':'listening/'+filename,'duration':round(len(content)/(RATE*2),3),'words':entries},raw

def main():
    started=time.time()
    asyncio.run(speech())
    built=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for track,raw in pool.map(build_day,DAYS):
            built.append((track,raw))
            print(f'Day track {track["from"]}/60: {track["duration"]:.0f}s',flush=True)
    tracks=[track for track,_ in built]
    ranges=[(start,start+4) for start in range(1,61,5)]+[(1,60)]
    for start,end in ranges:
        selected=built[start-1:end]
        offset=0
        entries=[]
        for track,_ in selected:
            entries.extend({**entry,'at':round(entry['at']+offset,3),'meaningAt':round(entry['meaningAt']+offset,3),'end':round(entry['end']+offset,3)} for entry in track['words'])
            offset+=track['duration']
        track_id='all' if end==60 and start==1 else f'five-{start:02}'
        fingerprint=digest('|'.join(track['src'] for track,_ in selected))
        filename=f'{track_id}-{fingerprint}.mp3'
        encode([raw for _,raw in selected],OUT/filename)
        assert (OUT/filename).stat().st_size<95*1024*1024,'Track exceeds GitHub individual-file limit'
        tracks.append({'id':track_id,'from':start,'to':end,'src':'listening/'+filename,'duration':round(offset,3),'words':entries})
        print(f'Combined {track_id}: {offset/60:.1f} minutes',flush=True)
    manifest={'version':1,'pattern':'pronunciation-3-meaning-1','tracks':tracks}
    (ROOT/'dist/listening-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Complete: {len(tracks)} continuous tracks in {time.time()-started:.0f}s',flush=True)

if __name__=='__main__': main()
