#!/usr/bin/env python3
"""Independent expected-value extraction for the accuracy gate (#184).

Derives expected-*.json DIRECTLY from the raw XLSX shared-strings/sheet
XML — it does NOT run the TypeScript adapters, so the expected record is
independent evidence, not a mirror of production parsing logic.
"""
import zipfile, re, json, html, unicodedata, sys

def cells(z):
    ss=z.read('xl/sharedStrings.xml').decode()
    strings=[html.unescape(re.sub(r'<[^>]+>','',s)) for s in re.findall(r'<si>(.*?)</si>',ss,re.S)]
    s=z.read('xl/worksheets/sheet1.xml').decode()
    rows={}
    for m in re.finditer(r'<row r="(\d+)".*?</row>',s,re.S):
        c={}
        for cm in re.finditer(r'<c ([^>]*?)r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)</v>|<is><t[^>]*>([^<]*)</t></is>)?',m.group(0)):
            attrs=cm.group(1)+cm.group(3); v=cm.group(4) if cm.group(4) is not None else cm.group(5)
            if v is not None and 't="s"' in attrs: v=strings[int(v)]
            c[cm.group(2)]=v
        rows[int(m.group(1))]=c
    return rows

def slug(s):
    s=unicodedata.normalize('NFD',s); s=''.join(c for c in s if unicodedata.category(c)!='Mn')
    return re.sub(r'[^A-Za-z0-9]+','-',s).strip('-').upper()

def bls(path,out):
    z=zipfile.ZipFile(path); rows=cells(z); hdr=rows[1]; e={}
    for rn in range(2,10):
        r=rows[rn]; rec={"sourceRow":rn,"sourceId":r['A'],"name":r['B'],"nutrients":{}}
        for letter,h in hdr.items():
            m=re.match(r'^([A-Z][A-Z0-9:]*) +(.+) \[([^\]]+)/100g\]$',h or '')
            if m: rec['nutrients'][m.group(1)]={"value":r.get(letter),"unit":m.group(3),"basis":"per 100 g"}
        e[rec['sourceId']]=rec
    json.dump(e,open(out,'w'),indent=1)

def ciqual(path,out):
    z=zipfile.ZipFile(path); rows=cells(z); hdr=rows[1]
    letters=sorted(hdr.keys(),key=lambda L:(len(L),L)); e={}
    for rn in range(2,10):
        r=rows[rn]; rec={"sourceRow":rn,"sourceId":r['G'],"name":r['H'],"nutrients":{}}
        for letter in letters:
            h=hdr.get(letter)
            m=re.match(r'^(.+) \(([^()\r\n]+)[\r\n/ ]*100[\r\n ]*g\)\s*$',(h or '').replace('\r\n',' ').replace('\n',' '))
            if m: rec['nutrients'][f"{slug(m.group(1))}-{m.group(2).strip().upper()}"]={"value":r.get(letter),"unit":m.group(2).strip(),"basis":"per 100 g"}
        e[rec['sourceId']]=rec
    json.dump(e,open(out,'w'),indent=1)

if __name__=='__main__':
    bls('tests/fixtures/nutrition/bls-4.0-sample.xlsx','tests/fixtures/nutrition/expected-bls.json')
    ciqual('tests/fixtures/nutrition/ciqual-2025-sample.xlsx','tests/fixtures/nutrition/expected-ciqual.json')
    print('expected records regenerated')
