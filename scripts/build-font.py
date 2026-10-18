"""Self-host Noto Serif JP. Requires fonttools and brotli (WOFF2 support)."""
import json, pathlib, re, urllib.request
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/fonts'
CACHE=ROOT/'qa/font-source'
OUT.mkdir(exist_ok=True)
CACHE.mkdir(parents=True,exist_ok=True)
api='https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&display=swap'
css=urllib.request.urlopen(api).read().decode()
url=re.search(r'url\((.*?)\)',css)[1]
source=CACHE/'noto-serif-jp-600.ttf'
if not source.exists(): source.write_bytes(urllib.request.urlopen(url).read())
font=TTFont(source)
if 'fvar' in font:
    from fontTools.varLib.instancer import instantiateVariableFont
    font=instantiateVariableFont(font,{'wght':600},inplace=True)
cmap=font.getBestCmap()
days=json.loads((ROOT/'dist/vocabulary.json').read_text(encoding='utf-8'))
text=''.join(w[key] for d in days for w in d['words'] for key in ['word','reading','example','exampleReading'])
required=set(map(ord,text))
missing=required-set(cmap)
assert not missing,'Missing glyphs: '+repr(''.join(map(chr,missing)))
font.flavor='woff2'
font.save(OUT/'noto-serif-jp-complete.woff2')
options=subset.Options()
options.flavor='woff2'
subsetter=subset.Subsetter(options=options)
subsetter.populate(unicodes=required|set(range(32,127)))
subsetter.subset(font)
font.save(OUT/'noto-serif-jp-vocabulary.woff2')
license_url='https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifjp/OFL.txt'
(OUT/'OFL.txt').write_bytes(urllib.request.urlopen(license_url).read())
(ROOT/'dist/fonts.css').write_text("""/* Noto Serif JP, SIL Open Font License 1.1; see fonts/OFL.txt. */
@font-face{font-family:'N2 Mincho';font-style:normal;font-weight:600;font-display:swap;src:url('./fonts/noto-serif-jp-vocabulary.woff2') format('woff2')}
@font-face{font-family:'N2 Mincho Complete';font-style:normal;font-weight:600;font-display:swap;src:url('./fonts/noto-serif-jp-complete.woff2') format('woff2')}
""",encoding='utf-8')
(OUT/'coverage.json').write_text(json.dumps({'source':url,'family':'Noto Serif JP','weight':600,'fontCodepoints':len(cmap),'vocabularyCodepoints':len(required),'missing':[]}),encoding='utf-8')
print(f'Font: {len(cmap)} supported codepoints; all {len(required)} vocabulary characters verified; subset {(OUT/"noto-serif-jp-vocabulary.woff2").stat().st_size//1024} KiB')
