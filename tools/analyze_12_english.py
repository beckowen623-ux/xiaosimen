import os
import zipfile
import pymupdf

ROOT_2025 = r'C:\Users\admin\Desktop\审计\相关基础知识\2025-2026全国各地中考真题汇总\2025年全国各地中考真题汇总（完整版）'
ROOT_2026 = r'C:\Users\admin\Desktop\审计\相关基础知识\2025-2026全国各地中考真题汇总\2026年全国各地中考真题汇总'

papers = [
    ("xj-2025-english", "新疆 2025", [
        ("Q", os.path.join(ROOT_2025, r"新疆\英语（真题+答案）\2025年新疆中考英语真题原卷完整版.pdf")),
        ("A_zip", os.path.join(ROOT_2025, r"新疆\英语（真题+答案）\2025年新疆中考英语真题答案含评分标准.zip"))
    ]),
    ("fj-2025-english", "福建 2025", [
        ("QA", os.path.join(ROOT_2025, r"福建省\英语（真题+答案）\2025年福建省中考英语真题及答案含评分标准完整版.pdf")),
        ("Q_alt", os.path.join(ROOT_2025, r"福建省\英语（真题+答案）\2025年福建省中考英语试题(含答案).pdf"))
    ]),
    ("cq-2025-english", "重庆 2025", [
        ("Q", os.path.join(ROOT_2025, r"重庆市\英语\2025年重庆市中考英语真题完整版.pdf")),
        ("A_zip", os.path.join(ROOT_2025, r"重庆市\英语\25重庆中考英语真题答案.zip"))
    ]),
    ("gd-2025-english", "广东 2025", [
        ("Q", os.path.join(ROOT_2025, r"广东省\广东省统考\英语（真题+答案）\2025年广东中考英语真题原卷完整版.pdf")),
        ("A", os.path.join(ROOT_2025, r"广东省\广东省统考\英语（真题+答案）\2025年广东省中考英语试题(含听力原文和答案).pdf"))
    ]),
    ("gx-2025-english", "广西 2025", [
        ("QA", os.path.join(ROOT_2025, r"广西\英语（真题+答案）\2025年广西中考英语真题及答案原卷完整版.pdf")),
        ("Q_alt", os.path.join(ROOT_2025, r"广西\英语（真题+答案）\2025年广西中考英语试题(含听力原文材料).pdf"))
    ]),
    ("gz-2025-english", "贵州 2025", [
        ("Q", os.path.join(ROOT_2025, r"贵州省\英语（真题+答案）\2025年贵州省中考英语真题原卷高清版本.pdf")),
        ("A_zip", os.path.join(ROOT_2025, r"贵州省\英语（真题+答案）\2025年贵州省中考英语真题答案.zip"))
    ]),
    ("ha-2025-english", "河南 2025", [
        ("Q", os.path.join(ROOT_2025, r"河南省\英语（真题+答案）\2025年河南省中考英语真题原卷完整版.pdf")),
        ("A_zip", os.path.join(ROOT_2025, r"河南省\英语（真题+答案）\2025年河南省中考英语真题答案完整版含评分标准.zip"))
    ]),
    ("hb-2025-english", "河北 2025", [
        ("QA_zip", os.path.join(ROOT_2025, r"河北省\英语（真题+答案）\2025年河北省中考英语真题原卷及官方答案含评分标准.zip")),
        ("Q_alt", os.path.join(ROOT_2025, r"河北省\英语（真题+答案）\2025年河北省中考英语试题(含听力原文材料).pdf"))
    ]),
    ("hn-2025-english", "湖南 2025", [
        ("Q", os.path.join(ROOT_2025, r"湖南省\湖南省统考\英语（真题+答案）\2025年湖南中考英语真题完整版.pdf")),
        ("A", os.path.join(ROOT_2025, r"湖南省\湖南省统考\英语（真题+答案）\2025年湖南省中考英语真题答案详解官方.pdf"))
    ]),
    ("sx-2025-english", "陕西 2025", [
        ("Q", os.path.join(ROOT_2025, r"陕西省\英语（真题+答案）\2025年陕西省中考英语真题原卷.pdf")),
        ("QA_alt", os.path.join(ROOT_2025, r"陕西省\英语（真题+答案）\2025年陕西省中考英语试题(含听力原文材料).pdf"))
    ]),
    ("jx-2026-english", "江西 2026", [
        ("Q", os.path.join(ROOT_2026, r"江西\江西（官方版试卷及答案高清）\2026年江西英语试题卷.pdf")),
        ("A", os.path.join(ROOT_2026, r"江西\江西（官方版试卷及答案高清）\2026年江西英语试题卷参考答案.pdf"))
    ]),
    ("sxi-2026-english", "山西 2026", [
        ("Q", os.path.join(ROOT_2026, r"山西\2026山西中考英语试题与答案\2026年山西省初中学业水平考试英语.pdf")),
        ("A_2025", os.path.join(ROOT_2025, r"山西省\英语（真题+答案）\2025山西中考英语答案.pdf"))
    ])
]

for pid, name, flist in papers:
    print(f"=== {name} ({pid}) ===")
    for kind, path in flist:
        if not os.path.exists(path):
            print(f"  {kind}: NOT FOUND: {path}")
            continue
        if path.endswith('.pdf'):
            doc = pymupdf.open(path)
            has_txt = any(len(p.get_text()) > 50 for p in doc)
            print(f"  {kind}: {len(doc)} pages, text: {has_txt} ({os.path.basename(path)})")
        elif path.endswith('.zip'):
            with zipfile.ZipFile(path) as z:
                print(f"  {kind}: zip with {z.namelist()} ({os.path.basename(path)})")
