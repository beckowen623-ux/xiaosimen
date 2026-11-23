import os, glob, json

# Read all papers in national-catalog.js
txt = open('data/national-catalog.js', encoding='utf-8').read()
sources = set()
ids = set()
for line in txt.splitlines():
    if '"id":' in line:
        parts = line.split('"id":')
        if len(parts) > 1:
            val = parts[1].replace('"', '').replace(',', '').strip()
            ids.add(val)
    if '"source":' in line:
        parts = line.split('"source":')
        if len(parts) > 1:
            val = parts[1].replace('"', '').replace(',', '').strip()
            sources.add(val)

print('Catalog total papers:', len(ids))

# Scan 2026 directory
base2026 = r'C:\Users\admin\Desktop\审计\相关基础知识\2025-2026全国各地中考真题汇总\2026年全国各地中考真题汇总'
all_2026_pdfs = []
for r, d, files in os.walk(base2026):
    for f in files:
        if f.endswith('.pdf'):
            full = os.path.join(r, f)
            rel = os.path.relpath(full, base2026)
            all_2026_pdfs.append((rel, f, os.path.getsize(full)))

print(f'Total 2026 PDFs: {len(all_2026_pdfs)}')
matched = 0
unmatched = []
for rel, f, sz in all_2026_pdfs:
    found = False
    for s in sources:
        if s and (s in f or f in s):
            found = True
            break
    if found:
        matched += 1
    else:
        unmatched.append((rel, f, sz))

print(f'Matched: {matched}, Unmatched: {len(unmatched)}')

# Group unmatched by province/folder
by_prov = {}
for rel, f, sz in unmatched:
    prov = rel.split(os.sep)[0]
    by_prov.setdefault(prov, []).append((rel, f, sz))

print('\nUnmatched by province:')
for prov, items in sorted(by_prov.items(), key=lambda x: -len(x[1])):
    print(f'  {prov}: {len(items)} PDFs')
    for rel, f, sz in items[:5]:
        print(f'    - {f} ({sz//1024} KB)')
    if len(items) > 5:
        print(f'    ... and {len(items)-5} more')
