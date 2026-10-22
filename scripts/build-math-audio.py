"""Generate cached Japanese word/example recordings after running check.mjs."""
import asyncio, json, pathlib
import edge_tts

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/'dist/math-vocabulary.json').read_text(encoding='utf8'))
OUT=ROOT/'dist/math-audio'
OUT.mkdir(exist_ok=True)

async def main():
    jobs={w['audio'][kind]:(w['reading'] if kind=='word' else w['example']) for g in DATA['groups'] for w in g['words'] for kind in ['word','example']}
    pending=[(path,text) for path,text in jobs.items() if not (ROOT/'dist'/path).exists() or (ROOT/'dist'/path).stat().st_size<1000]
    print(f'Math recordings: {len(pending)} to generate',flush=True)
    sem=asyncio.Semaphore(6)
    done=0
    async def generate(path,text):
        nonlocal done
        async with sem:
            target=ROOT/'dist'/path
            temporary=target.with_suffix('.part')
            for attempt in range(4):
                try:
                    await asyncio.wait_for(edge_tts.Communicate(text,'ja-JP-NanamiNeural',rate='-8%',pitch='+3Hz').save(str(temporary)),40)
                    if temporary.stat().st_size<1000:raise RuntimeError('Empty audio')
                    temporary.replace(target);done+=1
                    if done%48==0:print(f'Math recordings: {done}/{len(pending)}',flush=True)
                    return
                except Exception:
                    if attempt==3:raise
                    await asyncio.sleep(2**attempt)
    await asyncio.gather(*(generate(path,text) for path,text in pending))
    print(f'Math audio ready: {len(jobs)} recordings',flush=True)

asyncio.run(main())
