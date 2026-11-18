"""Import the supplied Fujian scan and 2024 Hunan Word papers.

Run with Python, PyMuPDF and Pillow. Originals stay outside the repository.
"""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import pymupdf
from PIL import Image, ImageDraw
from io import BytesIO

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "v": "urn:schemas-microsoft-com:vml",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
}
SUBJECTS = {"english": "英语", "physics": "物理", "chemistry": "化学",
            "math": "数学", "chinese": "语文", "lishi": "历史", "daode": "道德与法治"}
FUJIAN = [
    ("chinese", 2, 8, 9, 10), ("math", 11, 15, 16, 22),
    ("english", 23, 35, 36, 37), ("physics", 38, 46, 47, 50),
    ("chemistry", 51, 57, 58, 59), ("lishi", 60, 69, 70, 70),
    ("daode", 71, 79, 80, 82),
]
# Audited question/answer boundaries on the shared source pages (1185 x 1807 rendering).
SHARED_PAGE_CUTS = {"chinese": 1430, "math": 1060, "english": 710,
                    "physics": 348, "chemistry": 940, "daode": 1090}


def write_js(path, name, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"window.{name} = " + json.dumps(value, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")


def source_info(path, root):
    return {"file": path.relative_to(root).as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def import_scan(root, output, catalog, audit):
    source = next((root / "福建").glob("*.pdf"))
    doc = pymupdf.open(source)
    if len(doc) != 82:
        raise ValueError("Unexpected Fujian source page count")
    for subject, first, last, answer_first, answer_last in FUJIAN:
        paper_id = f"fj-2026-{subject}"
        pages, answers = [], []
        for page_no in range(first, answer_last + 1):
            image_path = output / "assets" / "national" / paper_id / f"p{page_no:02}.webp"
            image_path.parent.mkdir(parents=True, exist_ok=True)
            page = doc[page_no - 1]
            pix = page.get_pixmap(matrix=pymupdf.Matrix(2.7, 2.7), alpha=False)
            image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            if page_no == answer_first and subject in SHARED_PAGE_CUTS:
                cut = round(image.height * SHARED_PAGE_CUTS[subject] / 1807)
                question_path = image_path.with_name(f"p{page_no:02}-question.webp")
                answer_path = image_path.with_name(f"p{page_no:02}-answer.webp")
                question_image = image.crop((0, 0, image.width, cut))
                answer_image = image.crop((0, cut, image.width, image.height))
                if subject == "physics":
                    # The last question and the answer heading share a horizontal line.
                    scale = image.height / 1807
                    question_image = image.crop((0, 0, image.width, round(420 * scale)))
                    ImageDraw.Draw(question_image).rectangle((round(420 * scale), round(345 * scale), image.width, question_image.height), fill="white")
                    answer_image = image.crop((0, round(345 * scale), image.width, image.height))
                    ImageDraw.Draw(answer_image).rectangle((0, 0, round(420 * scale), round(75 * scale)), fill="white")
                question_image.save(question_path, "WEBP", quality=85)
                answer_image.save(answer_path, "WEBP", quality=85)
                pages.append("./" + question_path.relative_to(output).as_posix())
                answers.append("./" + answer_path.relative_to(output).as_posix())
                continue
            image.save(image_path, "WEBP", quality=85)
            relative = "./" + image_path.relative_to(output).as_posix()
            (pages if page_no <= last else answers).append(relative)
        catalog.append({
            "id": paper_id, "subject": subject, "subjectLabel": SUBJECTS[subject],
            "region": "福建", "year": 2026, "title": f"2026 年福建中考{SUBJECTS[subject]}",
            "questionCount": 0, "pages": pages, "answerPages": answers,
            "source": source.name, "description": "完整原卷与参考答案",
        })
        audit.append({"id": paper_id, **source_info(source, root), "questionPages": [first, last],
                      "answerPages": [answer_first, answer_last], "kind": "original-scan",
                      "sharedBoundary": {"page": answer_first, "cutY": SHARED_PAGE_CUTS[subject], "renderHeight": 1807}
                      if subject in SHARED_PAGE_CUTS else None})
        used_assets = {Path(url).name for url in [*pages, *answers]}
        for asset in (output / "assets/national" / paper_id).glob("*.webp"):
            if asset.name not in used_assets:
                asset.unlink()


def word_blocks(file, output):
    blocks = []
    with ZipFile(file) as archive:
        relationships = ET.fromstring(archive.read("word/_rels/document.xml.rels"))
        targets = {item.get("Id"): item.get("Target") for item in relationships}
        document = ET.fromstring(archive.read("word/document.xml"))

        def paragraph_block(paragraph):
            text = "".join(item.text or "" for item in paragraph.findall(".//w:t", NS)).strip()
            content = []
            math = ["".join(item.text or "" for item in expression.findall(".//m:t", NS))
                    for expression in paragraph.findall(".//m:oMath", NS)]
            unsupported = any(value not in [".", "．"] for value in math)
            for run in paragraph.findall(".//w:r", NS):
                part = html.escape("".join(item.text or "" for item in run.findall("w:t", NS)))
                vertical = run.find("w:rPr/w:vertAlign", NS)
                if vertical is not None:
                    tag = "sub" if vertical.get("{" + NS["w"] + "}val") == "subscript" else "sup"
                    part = f"<{tag}>{part}</{tag}>"
                content.append(part)
                for image in [*run.findall(".//a:blip", NS), *run.findall(".//v:imagedata", NS)]:
                    ref = image.get("{" + NS["r"] + "}embed") or image.get("{" + NS["r"] + "}id")
                    target = targets.get(ref, "")
                    if not target or Path(target).suffix.lower() not in [".png", ".jpg", ".jpeg", ".gif", ".bmp"]:
                        unsupported = True
                        continue
                    data = archive.read("word/" + target)
                    digest = hashlib.sha256(data).hexdigest()[:16]
                    asset = output / "assets/national/word" / (digest + ".webp")
                    asset.parent.mkdir(parents=True, exist_ok=True)
                    if not asset.exists():
                        Image.open(BytesIO(data)).convert("RGB").save(asset, "WEBP", quality=90)
                    content.append(f'<img src="./{asset.relative_to(output).as_posix()}" alt="原题配图" loading="lazy">')
            return {"text": text, "html": "<p>" + "".join(content) + "</p>", "unsupported": unsupported}

        for element in document.find("w:body", NS):
            if element.tag == "{" + NS["w"] + "}p":
                block = paragraph_block(element)
            elif element.tag == "{" + NS["w"] + "}tbl":
                cells = []
                rows = []
                for row in element.findall("w:tr", NS):
                    columns = []
                    for cell in row.findall("w:tc", NS):
                        parts = [paragraph_block(p) for p in cell.findall("w:p", NS)]
                        cells.extend(parts)
                        span = cell.find("w:tcPr/w:gridSpan", NS)
                        colspan = int(span.get("{" + NS["w"] + "}val")) if span is not None else 1
                        columns.append(f'<td colspan="{colspan}">' + "".join(p["html"] for p in parts) + "</td>")
                    rows.append("<tr>" + "".join(columns) + "</tr>")
                block = {"text": "\n".join(cell["text"] for cell in cells),
                         "html": "<table>" + "".join(rows) + "</table>",
                         "unsupported": any(cell["unsupported"] for cell in cells)}
            else:
                continue
            if block["text"] or block["html"] != "<p></p>":
                blocks.append(block)
    return blocks

def parse_choices(blocks, paper, reading=False):
    questions, skipped = [], []
    answer_rows = [i for i, block in enumerate(blocks) if block["text"].startswith("【答案】")]
    previous = 0
    for answer_index in answer_rows:
        group = blocks[previous:answer_index]
        headings = [i for i, block in enumerate(group) if
                    ("第二部分" in block["text"] and "阅读" in block["text"]) if reading]
        if not reading:
            headings = [i for i, block in enumerate(group) if block["text"].startswith("一、选择题")]
        if headings:
            group = group[headings[-1] + 1:]
        starts = [i for i, block in enumerate(group) if re.match(r"^\d+\.\s", block["text"])]
        numbered = [(i, int(re.match(r"^(\d+)\.", group[i]["text"])[1])) for i in starts]
        answer = blocks[answer_index]["text"].removeprefix("【答案】").strip()
        end = next((i for i in answer_rows if i > answer_index), len(blocks))
        explanation_blocks = blocks[answer_index + 1:end]
        if not starts:
            previous = answer_index + 1
            continue
        answer_map = {int(n): v for n, v in re.findall(r"(\d+)\.\s*([A-D]+)", answer)}
        if len(numbered) == 1 and re.fullmatch(r"[A-D]+", answer):
            answer_map[numbered[0][1]] = answer
        material = []
        if reading:
            # The three reading passages are headed by a separate A, B or C.
            markers = [i for i in range(starts[0]) if group[i]["text"] in ["A", "B", "C"]]
            if not markers or max(n for _, n in numbered) > 10:
                previous = answer_index + 1
                continue
            material = group[markers[-1] + 1:starts[0]]
        elif len(numbered) > 1:
            lead = group[:starts[0]]
            boundaries = [i for i, block in enumerate(lead) if
                          re.search(r"故选[：:\s]*[A-D]+[。．.]?\s*$", block["text"])]
            material = lead[boundaries[-1] + 1:] if boundaries else lead
            material = [block for block in material if not re.match(r"^[一二三四五六七八九十]、", block["text"])]
        for position, (start, number) in enumerate(numbered):
            qblocks = group[start:numbered[position + 1][0] if position + 1 < len(numbered) else len(group)]
            text = "\n".join(block["text"] for block in qblocks)
            text = re.sub(r"(?m)^([A-D])[ \t]+", r"\1. ", text)
            option_positions = list(re.finditer(r"(?<![A-Za-z])([A-D])[.．、]\s*", text))
            keys = [match[1] for match in option_positions]
            if reading and all(re.search(r"(?<![A-Za-z])" + key + r"[.．、\s]", text) for key in "ABC"):
                keys = ["A", "B", "C"]
            if keys != ["A", "B", "C", "D"] and not (reading and keys == ["A", "B", "C"]):
                skipped.append({"number": number, "reason": "not a complete objective question"})
                continue
            if number not in answer_map or any(block["unsupported"] for block in [*material, *qblocks]):
                skipped.append({"number": number, "reason": "answer, equation or table needs manual review"})
                continue
            if any(char for char in text if ord(char) >= 0xF0000):
                skipped.append({"number": number, "reason": "unsupported source font glyph"})
                continue
            explanation = []
            full_explanation = "\n".join(block["text"] for block in explanation_blocks)
            marker = re.search(rf"【{number}题详解】([\s\S]*?)(?=【\d+题详解】|\n\d+\.\s|\n[A-C]\n|$)", full_explanation)
            if marker:
                explanation = [marker[1].strip()]
            elif len(numbered) == 1:
                for block in explanation_blocks:
                    if re.match(r"^(?:\d+\.\s|[一二三四五六七八九十]、|第[一二三四五六七八九十]+[节部分])", block["text"]):
                        break
                    if block["text"] not in ["【解析】", "【详解】"]:
                        explanation.append(block["text"].replace("【详解】", ""))
            if not explanation or not "".join(explanation).strip():
                skipped.append({"number": number, "reason": "missing paired explanation"})
                continue
            stem = re.sub(r"^\d+\.\s*", "", qblocks[0]["text"])
            stem = re.split(r"(?<![A-Za-z])A[.．、]", stem)[0].strip()
            answers = list(answer_map[number])
            qid = f"national-{paper['id']}-q{number:02}"
            questions.append({
                "id": qid, "national": True, "subject": paper["subject"], "subjectLabel": paper["subjectLabel"],
                "paperId": paper["id"], "number": number, "type": "multiple" if len(answers) > 1 else "single",
                "stem": stem, "originalHtml": "".join(block["html"] for block in qblocks),
                "materialHtml": "".join(block["html"] for block in material),
                "groupId": f"{paper['id']}-g{numbered[0][1]}" if reading else qid,
                "options": [{"key": key, "text": "选项 " + key} for key in keys],
                "answer": answers, "explanation": "\n".join(explanation).strip(),
                "source": paper["title"] + f" · 整理版第 {number} 题（{paper['source']}）",
                "chapter": paper["title"], "grade": "九下", "stage": "9-down",
            })
        previous = answer_index + 1
    ids = [question["id"] for question in questions]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate question numbers in " + paper["id"])
    return questions, skipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root, output = args.source, args.output
    catalog, audit = [], []
    import_scan(root, output, catalog, audit)
    names = [
        ("english", "changsha", "长沙市", "2024年湖南省长沙市中考英语真题（解析版）.docx"),
        ("physics", "hunan", "湖南省", "2024年湖南省中考物理真题（解析版）.docx"),
        ("chemistry", "hunan", "湖南省", "2024年湖南省中考化学真题（解析版）.docx"),
        ("physics", "changsha", "长沙市", "2024年湖南省长沙市中考物理真题（解析版）.docx"),
        ("chemistry", "changsha", "长沙市", "2024年湖南省长沙市中考化学真题（解析版）.docx"),
    ]
    sources = list(root.rglob("*.docx"))
    for subject, city_id, city, filename in names:
        source = next(file for file in sources if file.name == filename)
        paper = {
            "id": f"hn-{city_id}-2024-{subject}", "subject": subject, "subjectLabel": SUBJECTS[subject],
            "region": "湖南", "year": 2024, "title": f"2024 年{city}中考{SUBJECTS[subject]}",
            "source": filename, "description": "阅读理解精选" if subject == "english" else "客观题精选",
        }
        questions, skipped = parse_choices(word_blocks(source, output), paper, subject == "english")
        if not questions:
            raise ValueError("No importable questions in " + filename)
        paper["questionCount"] = len(questions)
        paper["data"] = f"./data/national/{paper['id']}.js"
        write_js(output / paper["data"].removeprefix("./"), "NATIONAL_PAPERS", {paper["id"]: questions})
        catalog.append(paper)
        audit.append({"id": paper["id"], **source_info(source, root), "questions": len(questions),
                      "importedNumbers": [q["number"] for q in questions], "skipped": skipped})
    word_assets = output / "assets/national/word"
    referenced = set()
    for paper in catalog:
        if paper.get("data"):
            data = (output / paper["data"].removeprefix("./")).read_text(encoding="utf-8")
            referenced.update(re.findall(r"assets/national/word/([a-f0-9]+\.webp)", data))
    for asset in word_assets.glob("*.webp"):
        if asset.name not in referenced:
            asset.unlink()
    write_js(output / "data/national-catalog.js", "NATIONAL_CATALOG", {"papers": catalog, "subjects": SUBJECTS})
    manifest = output / "tools/national-import-manifest.json"
    manifest.write_text(json.dumps({"sources": audit}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for paper in catalog:
        print(paper["id"], paper["questionCount"], len(paper.get("pages", [])), len(paper.get("answerPages", [])))


if __name__ == "__main__":
    main()
