# 几何配图生成：按坐标画线段、射线、点和字母，输出和精编卷一致风格的 SVG。
# 用法：from figure_svg import fig; fig(path, w, h, lines=[((x1,y1),(x2,y2)), ...], labels=[(x,y,'A'), ...], dots=[(x,y)], arcs=[...])
# 坐标是 SVG 像素坐标（y 向下）。
import os


def fig(path, w, h, lines=(), labels=(), dots=(), dashed=(), arcs=(), texts=()):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="Times New Roman, serif" font-size="18" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
           f'<rect width="{w}" height="{h}" fill="#fff" stroke="none"/>']
    for (a, b) in lines:
        out.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}"/>')
    for (a, b) in dashed:
        out.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke-dasharray="6 5"/>')
    for (cx, cy, r, a1, a2) in arcs:  # 小角弧，角度单位：度，SVG 方向（顺时针为正）
        import math
        x1, y1 = cx + r * math.cos(math.radians(a1)), cy + r * math.sin(math.radians(a1))
        x2, y2 = cx + r * math.cos(math.radians(a2)), cy + r * math.sin(math.radians(a2))
        large = 1 if (a2 - a1) % 360 > 180 else 0
        out.append(f'<path d="M{x1:.1f} {y1:.1f} A{r} {r} 0 {large} 1 {x2:.1f} {y2:.1f}" stroke-width="1.5"/>')
    for (x, y) in dots:
        out.append(f'<circle cx="{x}" cy="{y}" r="3" fill="#111" stroke="none"/>')
    for (x, y, t) in labels:
        out.append(f'<text x="{x}" y="{y}" fill="#111" stroke="none">{t}</text>')
    for (x, y, t, size) in texts:
        out.append(f'<text x="{x}" y="{y}" fill="#111" stroke="none" font-size="{size}">{t}</text>')
    out.append('</svg>')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf8').write('\n'.join(out) + '\n')
