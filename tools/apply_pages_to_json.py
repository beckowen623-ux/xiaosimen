import json
import os

with open(r'scratch\english_pages_map.json', 'r', encoding='utf-8') as f:
    pages_map = json.load(f)

src_dir = r'english-src\papers'

updated_count = 0
for pid, info in pages_map.items():
    json_path = os.path.join(src_dir, f"{pid}.json")
    if not os.path.exists(json_path):
        print(f"File not found: {json_path}")
        continue
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    data["pages"] = info["pages"]
    data["answerPages"] = info["answerPages"]
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    updated_count += 1
    print(f"Updated {pid}.json: {len(info['pages'])} Q pages, {len(info['answerPages'])} A pages")

print(f"\nSuccessfully updated {updated_count} paper JSON files.")
