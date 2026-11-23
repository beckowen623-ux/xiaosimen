import json
import re
import os

with open('data/national-catalog.js', 'r', encoding='utf-8') as f:
    content = f.read()

match = re.search(r'\[.*\]', content, re.DOTALL)
if not match:
    print('Failed to parse catalog')
    exit(1)

catalog = json.loads(match.group(0))
print(f'Total papers in catalog: {len(catalog)}')

real_exams = []
sync_papers = []
earlybird_papers = []

for p in catalog:
    is_sync = p.get('sync', False)
    is_earlybird = p.get('earlybird', False)
    is_xsc = p.get('stage') == 'xsc' or 'xsc' in p.get('id', '')
    if is_sync:
        sync_papers.append(p)
    elif is_earlybird or is_xsc:
        earlybird_papers.append(p)
    else:
        real_exams.append(p)

print(f'Total Real Zhongkao papers (真题卷): {len(real_exams)}')
print(f'Total Earlybird / XSC papers: {len(earlybird_papers)}')
print(f'Total Sync Chapter papers: {len(sync_papers)}')

full_duo = []           # has pages and answerPages and data
has_pages_no_ans = []   # has pages, but NO answerPages
no_pages_has_data = []  # has data, but NO pages (like xj-2025-english!)
no_data_has_pages = []  # has pages, but NO data

for p in real_exams:
    has_p = bool(p.get('pages'))
    has_a = bool(p.get('answerPages'))
    has_d = bool(p.get('data'))
    
    if has_p and has_a and has_d:
        full_duo.append(p)
    elif has_p and not has_a and has_d:
        has_pages_no_ans.append(p)
    elif not has_p and has_d:
        no_pages_has_data.append(p)
    elif has_p and not has_d:
        no_data_has_pages.append(p)

print(f'\n--- 真题分类统计 ---')
print(f'1. 双端完备 (试题页+答案页+可做题): {len(full_duo)}')
print(f'2. 有原卷页但缺官方答案页 (pages已录入但缺answerPages): {len(has_pages_no_ans)}')
print(f'3. 仅有做题版、完全缺失原卷与答案扫描页 (像新疆英语): {len(no_pages_has_data)}')
print(f'4. 仅有扫描图、未结构化录入题目: {len(no_data_has_pages)}')

print(f'\n--- 详细清单 1：完全缺失原卷与答案页 (共 {len(no_pages_has_data)} 套) ---')
for p in no_pages_has_data:
    print(f"- ID: {p['id']} | 年份: {p.get('year')} | 地区: {p.get('region')} | 科目: {p.get('subject')} | 标题: {p.get('title')} (题目数: {p.get('questionCount')})")

print(f'\n--- 详细清单 2：有原卷页但缺答案页 (共 {len(has_pages_no_ans)} 套) ---')
for p in has_pages_no_ans:
    print(f"- ID: {p['id']} | 年份: {p.get('year')} | 地区: {p.get('region')} | 科目: {p.get('subject')} | 标题: {p.get('title')} (试题页数: {len(p.get('pages', []))})")

print(f'\n--- 详细清单 3：仅有扫描图、未结构化录入题目 (共 {len(no_data_has_pages)} 套) ---')
for p in no_data_has_pages:
    print(f"- ID: {p['id']} | 年份: {p.get('year')} | 地区: {p.get('region')} | 科目: {p.get('subject')} | 标题: {p.get('title')} (试题页数: {len(p.get('pages', []))}, 答案页数: {len(p.get('answerPages', []))})")

