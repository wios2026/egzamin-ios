#!/usr/bin/env python3
"""Buduje pojedynczy plik HTML (wersja offline) z wbudowanymi pytaniami, CSS i JS.
Użycie:  python3 build_offline.py   ->  nauka-egzamin-ios-offline.html"""
import json, re, pathlib
root = pathlib.Path(__file__).parent
html = (root/'index.html').read_text(encoding='utf-8')
css = (root/'style.css').read_text(encoding='utf-8')
js = (root/'app.js').read_text(encoding='utf-8')
# numer wersji z app.js trafia do adresów plików w index.html (?v=...), dzięki temu nowa wersja nie bierze starych plików z pamięci podręcznej
ver = re.search(r"APP_VERSION = '([^']+)'", js).group(1)
html = re.sub(r'(href="style\.css|src="app\.js)(\?v=[^"]*)?"', lambda m: m.group(1) + '?v=' + ver + '"', html)
(root/'index.html').write_text(html, encoding='utf-8')
data = json.dumps(json.loads((root/'data/questions.json').read_text(encoding='utf-8')), ensure_ascii=False).replace('</', '<\\/')
html = re.sub(r'<link rel="manifest"[^>]*>\n?', '', html)
html = re.sub(r'<link rel="stylesheet" href="style\.css[^"]*">', lambda m: '<style>\n'+css+'\n</style>', html)
html = re.sub(r'<script src="app\.js[^"]*"></script>', lambda m: '<script type="application/json" id="embedded-data">'+data+'</script>\n<script>\n'+js.replace('</script>', '<\\/script>')+'\n</script>', html)
out = root/'nauka-egzamin-ios-offline.html'
out.write_text(html, encoding='utf-8'); print('OK', out, round(out.stat().st_size/1024), 'KB')
