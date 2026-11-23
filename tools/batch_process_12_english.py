import os
import zipfile
import io
import pymupdf
from PIL import Image

BASE_ASSETS = r'C:\Users\admin\.gemini\antigravity\scratch\xiaosimen\assets\national'
ROOT_2025 = r'C:\Users\admin\Desktop\审计\相关基础知识\2025-2026全国各地中考真题汇总\2025年全国各地中考真题汇总（完整版）'
ROOT_2026 = r'C:\Users\admin\Desktop\审计\相关基础知识\2025-2026全国各地中考真题汇总\2026年全国各地中考真题汇总'

def render_doc_pages(doc, page_range, out_dir, prefix, dpi=144):
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    idx = 1
    for pno in page_range:
        page = doc[pno - 1]
        pix = page.get_pixmap(dpi=dpi)
        filename = f"{prefix}{idx:02d}.webp" if prefix.endswith('-') or prefix == 'p' else f"{prefix}_{idx:02d}.webp"
        if prefix == 'p':
            filename = f"p{idx:02d}.webp"
        elif prefix == 'p-ans':
            filename = f"p{idx:02d}-answer.webp"
        out_path = os.path.join(out_dir, filename)
        pix.pil_save(out_path)
        rel_path = f"./assets/national/{os.path.basename(out_dir)}/{filename}"
        paths.append(rel_path)
        idx += 1
    return paths

results = {}

# 1. 新疆 2025
print("Processing 1. 新疆 2025...")
xj_dir = os.path.join(BASE_ASSETS, "xj-2025-english")
doc_q = pymupdf.open(os.path.join(ROOT_2025, r"新疆\英语（真题+答案）\2025年新疆中考英语真题原卷完整版.pdf"))
xj_q_pages = render_doc_pages(doc_q, range(1, len(doc_q) + 1), xj_dir, "p")
with zipfile.ZipFile(os.path.join(ROOT_2025, r"新疆\英语（真题+答案）\2025年新疆中考英语真题答案含评分标准.zip")) as z:
    doc_a = pymupdf.open(stream=z.read(z.namelist()[0]), filetype='pdf')
    xj_a_pages = render_doc_pages(doc_a, range(1, len(doc_a) + 1), xj_dir, "p-ans")
results["xj-2025-english"] = {"pages": xj_q_pages, "answerPages": xj_a_pages}

# 2. 福建 2025
print("Processing 2. 福建 2025...")
fj_dir = os.path.join(BASE_ASSETS, "fj-2025-english")
doc_fj = pymupdf.open(os.path.join(ROOT_2025, r"福建省\英语（真题+答案）\2025年福建省中考英语真题及答案含评分标准完整版.pdf"))
fj_q_pages = render_doc_pages(doc_fj, range(1, 13), fj_dir, "p")
fj_a_pages = render_doc_pages(doc_fj, range(13, 15), fj_dir, "p-ans")
results["fj-2025-english"] = {"pages": fj_q_pages, "answerPages": fj_a_pages}

# 3. 重庆 2025
print("Processing 3. 重庆 2025...")
cq_dir = os.path.join(BASE_ASSETS, "cq-2025-english")
doc_cq = pymupdf.open(os.path.join(ROOT_2025, r"重庆市\英语\2025年重庆市中考英语真题完整版.pdf"))
cq_q_pages = render_doc_pages(doc_cq, range(1, len(doc_cq) + 1), cq_dir, "p")
cq_a_pages = []
with zipfile.ZipFile(os.path.join(ROOT_2025, r"重庆市\英语\25重庆中考英语真题答案.zip")) as z:
    docx_bytes = z.read(z.namelist()[0])
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as dz:
        # image1 and image2
        img_idx = 1
        for img_name in ['word/media/image1.jpeg', 'word/media/image2.jpeg']:
            if img_name in dz.namelist():
                im = Image.open(io.BytesIO(dz.read(img_name)))
                fname = f"p{img_idx:02d}-answer.webp"
                fpath = os.path.join(cq_dir, fname)
                im.save(fpath, format='WEBP', quality=90)
                cq_a_pages.append(f"./assets/national/cq-2025-english/{fname}")
                img_idx += 1
results["cq-2025-english"] = {"pages": cq_q_pages, "answerPages": cq_a_pages}

# 4. 广东 2025
print("Processing 4. 广东 2025...")
gd_dir = os.path.join(BASE_ASSETS, "gd-2025-english")
doc_gd_q = pymupdf.open(os.path.join(ROOT_2025, r"广东省\广东省统考\英语（真题+答案）\2025年广东中考英语真题原卷完整版.pdf"))
gd_q_pages = render_doc_pages(doc_gd_q, range(1, len(doc_gd_q) + 1), gd_dir, "p")
doc_gd_a = pymupdf.open(os.path.join(ROOT_2025, r"广东省\广东省统考\英语（真题+答案）\2025年广东省中考英语试题(含听力原文和答案).pdf"))
gd_a_pages = render_doc_pages(doc_gd_a, range(13, 20), gd_dir, "p-ans")
results["gd-2025-english"] = {"pages": gd_q_pages, "answerPages": gd_a_pages}

# 5. 广西 2025
print("Processing 5. 广西 2025...")
gx_dir = os.path.join(BASE_ASSETS, "gx-2025-english")
doc_gx = pymupdf.open(os.path.join(ROOT_2025, r"广西\英语（真题+答案）\2025年广西中考英语真题及答案原卷完整版.pdf"))
gx_q_pages = render_doc_pages(doc_gx, range(1, 9), gx_dir, "p")
# page 9 is answer
gx_a_pages = render_doc_pages(doc_gx, [9], gx_dir, "p-ans")
# let's also grab pages 10-13 from alt to get full scoring criteria if available
doc_gx_alt = pymupdf.open(os.path.join(ROOT_2025, r"广西\英语（真题+答案）\2025年广西中考英语试题(含听力原文材料).pdf"))
if len(doc_gx_alt) >= 13:
    extra_a = render_doc_pages(doc_gx_alt, range(10, 14), gx_dir, "p-ans_alt")
    # let's keep gx_a_pages with page 9 plus extra detailed pages
    for i, pth in enumerate(extra_a):
        # rename to p02-answer, p03-answer...
        target_name = f"p{i+2:02d}-answer.webp"
        src_path = os.path.join(gx_dir, os.path.basename(pth))
        dst_path = os.path.join(gx_dir, target_name)
        if os.path.exists(dst_path): os.remove(dst_path)
        os.rename(src_path, dst_path)
        gx_a_pages.append(f"./assets/national/gx-2025-english/{target_name}")
results["gx-2025-english"] = {"pages": gx_q_pages, "answerPages": gx_a_pages}

# 6. 贵州 2025
print("Processing 6. 贵州 2025...")
gz_dir = os.path.join(BASE_ASSETS, "gz-2025-english")
doc_gz_q = pymupdf.open(os.path.join(ROOT_2025, r"贵州省\英语（真题+答案）\2025年贵州省中考英语真题原卷高清版本.pdf"))
gz_q_pages = render_doc_pages(doc_gz_q, range(1, len(doc_gz_q) + 1), gz_dir, "p")
with zipfile.ZipFile(os.path.join(ROOT_2025, r"贵州省\英语（真题+答案）\2025年贵州省中考英语真题答案.zip")) as z:
    doc_gz_a = pymupdf.open(stream=z.read(z.namelist()[0]), filetype='pdf')
    gz_a_pages = render_doc_pages(doc_gz_a, range(1, len(doc_gz_a) + 1), gz_dir, "p-ans")
results["gz-2025-english"] = {"pages": gz_q_pages, "answerPages": gz_a_pages}

# 7. 河南 2025
print("Processing 7. 河南 2025...")
ha_dir = os.path.join(BASE_ASSETS, "ha-2025-english")
doc_ha_q = pymupdf.open(os.path.join(ROOT_2025, r"河南省\英语（真题+答案）\2025年河南省中考英语真题原卷完整版.pdf"))
ha_q_pages = render_doc_pages(doc_ha_q, range(1, len(doc_ha_q) + 1), ha_dir, "p")
with zipfile.ZipFile(os.path.join(ROOT_2025, r"河南省\英语（真题+答案）\2025年河南省中考英语真题答案完整版含评分标准.zip")) as z:
    doc_ha_a = pymupdf.open(stream=z.read(z.namelist()[0]), filetype='pdf')
    ha_a_pages = render_doc_pages(doc_ha_a, range(1, len(doc_ha_a) + 1), ha_dir, "p-ans")
results["ha-2025-english"] = {"pages": ha_q_pages, "answerPages": ha_a_pages}

# 8. 河北 2025
print("Processing 8. 河北 2025...")
hb_dir = os.path.join(BASE_ASSETS, "hb-2025-english")
with zipfile.ZipFile(os.path.join(ROOT_2025, r"河北省\英语（真题+答案）\2025年河北省中考英语真题原卷及官方答案含评分标准.zip")) as z:
    doc_hb = pymupdf.open(stream=z.read(z.namelist()[0]), filetype='pdf')
    hb_q_pages = render_doc_pages(doc_hb, range(1, 9), hb_dir, "p")
    hb_a_pages = render_doc_pages(doc_hb, range(9, len(doc_hb) + 1), hb_dir, "p-ans")
results["hb-2025-english"] = {"pages": hb_q_pages, "answerPages": hb_a_pages}

# 9. 湖南 2025
print("Processing 9. 湖南 2025...")
hn_dir = os.path.join(BASE_ASSETS, "hn-2025-english")
doc_hn_q = pymupdf.open(os.path.join(ROOT_2025, r"湖南省\湖南省统考\英语（真题+答案）\2025年湖南中考英语真题完整版.pdf"))
hn_q_pages = render_doc_pages(doc_hn_q, range(1, len(doc_hn_q) + 1), hn_dir, "p")
doc_hn_a = pymupdf.open(os.path.join(ROOT_2025, r"湖南省\湖南省统考\英语（真题+答案）\2025年湖南省中考英语真题答案详解官方.pdf"))
hn_a_pages = render_doc_pages(doc_hn_a, range(1, len(doc_hn_a) + 1), hn_dir, "p-ans")
results["hn-2025-english"] = {"pages": hn_q_pages, "answerPages": hn_a_pages}

# 10. 陕西 2025
print("Processing 10. 陕西 2025...")
sx_dir = os.path.join(BASE_ASSETS, "sx-2025-english")
doc_sx_q = pymupdf.open(os.path.join(ROOT_2025, r"陕西省\英语（真题+答案）\2025年陕西省中考英语真题原卷.pdf"))
sx_q_pages = render_doc_pages(doc_sx_q, range(1, len(doc_sx_q) + 1), sx_dir, "p")
doc_sx_a = pymupdf.open(os.path.join(ROOT_2025, r"陕西省\英语（真题+答案）\2025年陕西省中考英语试题(含听力原文材料).pdf"))
sx_a_pages = render_doc_pages(doc_sx_a, range(11, 15), sx_dir, "p-ans")
results["sx-2025-english"] = {"pages": sx_q_pages, "answerPages": sx_a_pages}

# 11. 江西 2026
print("Processing 11. 江西 2026...")
jx_dir = os.path.join(BASE_ASSETS, "jx-2026-english")
doc_jx_q = pymupdf.open(os.path.join(ROOT_2026, r"江西\江西（官方版试卷及答案高清）\2026年江西英语试题卷.pdf"))
jx_q_pages = render_doc_pages(doc_jx_q, range(1, len(doc_jx_q) + 1), jx_dir, "p")
doc_jx_a = pymupdf.open(os.path.join(ROOT_2026, r"江西\江西（官方版试卷及答案高清）\2026年江西英语试题卷参考答案.pdf"))
jx_a_pages = render_doc_pages(doc_jx_a, [1], jx_dir, "p-ans")
results["jx-2026-english"] = {"pages": jx_q_pages, "answerPages": jx_a_pages}

# 12. 山西 2026
print("Processing 12. 山西 2026...")
sxi_dir = os.path.join(BASE_ASSETS, "sxi-2026-english")
doc_sxi = pymupdf.open(os.path.join(ROOT_2026, r"山西\2026山西中考英语试题与答案\2026年山西省初中学业水平考试英语.pdf"))
# pages 2 to 8 are clean question paper
sxi_q_pages = render_doc_pages(doc_sxi, range(2, 9), sxi_dir, "p")
# pages 9 to 15 are answer paper with answers and scoring
sxi_a_pages = render_doc_pages(doc_sxi, range(9, 16), sxi_dir, "p-ans")
results["sxi-2026-english"] = {"pages": sxi_q_pages, "answerPages": sxi_a_pages}

print("\n--- Summary of Extracted Pages ---")
for pid, info in results.items():
    print(f"{pid}: {len(info['pages'])} Q pages, {len(info['answerPages'])} A pages")

import json
with open(r'scratch\english_pages_map.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print("Saved map to scratch/english_pages_map.json")
