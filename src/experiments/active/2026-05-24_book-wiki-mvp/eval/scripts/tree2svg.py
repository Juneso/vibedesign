#!/usr/bin/env python3
"""빅콜 런 마크다운(위계 트리)을 SVG 다이어그램으로 변환."""
import re, sys, html, os

CARD_W      = 400          # 키워드 카드 폭
COL_PITCH   = 452          # 열 간격
PAD         = 12
HDR_H       = 30
LINE_H      = 16
SENT_GAP    = 7
CARD_GAP    = 14           # 형제 카드 세로 간격
MARGIN      = 36
FS_HDR      = 13.5
FS_SENT     = 11

ROLE_COLORS = {
    "배경": ("#1d4ed8", "#eff4ff"),
    "진단": ("#b91c1c", "#fef2f2"),
    "처방": ("#047857", "#ecfdf5"),
    "문제의식": ("#c2410c", "#fff7ed"),
}
CONTRAST = ("#b45309", "#fffbeb")   # 대조축
PLAIN    = ("#334155", "#f8fafc")   # 일반 키워드


def text_w(s, fs):
    """대략적 텍스트 폭 — 한글/한자는 1em, 그 외는 0.55em."""
    w = 0.0
    for ch in s:
        w += 1.0 if ord(ch) > 0x2E80 else 0.55
    return w * fs


def wrap(s, fs, max_w):
    lines, cur = [], ""
    for word in s.split(" "):
        trial = word if not cur else cur + " " + word
        if text_w(trial, fs) <= max_w:
            cur = trial
            continue
        if cur:
            lines.append(cur)
        # 단어 하나가 줄보다 길면 글자 단위로 쪼갬
        cur = ""
        for ch in word:
            if text_w(cur + ch, fs) > max_w:
                lines.append(cur)
                cur = ch
            else:
                cur += ch
    if cur:
        lines.append(cur)
    return lines or [""]


class Node:
    def __init__(self, name, depth):
        self.name, self.depth = name, depth
        self.score = None
        self.role = None
        self.contrast = False
        self.why = None
        self.sents = []          # (page, text)
        self.kids = []
        self.x = self.y = self.h = 0


def parse(path):
    raw = open(path, encoding="utf-8").read()
    title = raw.split("\n", 1)[0].lstrip("# ").strip()
    meta = ""
    m = re.search(r"^> (.+)$", raw, re.M)
    if m:
        meta = m.group(1).strip()

    thesis = ""
    if "## 테제" in raw:
        thesis = raw.split("## 테제", 1)[1].split("##", 1)[0].strip()
    tree_txt = raw.split("## 트리", 1)[1].split("## 대조")[0]
    contrasts = []
    if "## 대조" in raw:
        for ln in raw.split("## 대조", 1)[1].strip().split("\n"):
            ln = ln.strip()
            if ln.startswith("- "):
                contrasts.append(ln[2:])
    return title, meta, thesis, roots_from(tree_txt), contrasts


def roots_from(tree_txt):

    roots, stack = [], []
    for ln in tree_txt.split("\n"):
        if not ln.strip().startswith("- "):
            continue
        indent = len(ln) - len(ln.lstrip(" "))
        depth = indent // 2
        body = ln.strip()[2:]

        pm = re.match(r"^p\.(\d+)\s+(.*)$", body)
        if pm:                                   # 문장 → 가장 가까운 키워드에 붙임
            if stack:
                stack[-1].sents.append((pm.group(1), pm.group(2)))
            continue
        wm = re.match(r"^_why:\s*(.*?)_?\s*$", body)
        if wm:                                   # why → 부모 키워드의 메타 설명
            if stack:
                stack[-1].why = wm.group(1)
            continue

        name = body
        node = Node("", depth)
        cm = re.search(r"\(대조축\)\s*$", name)
        if cm:
            node.contrast = True
            name = name[: cm.start()].strip()
        rm = re.search(r"\[([^\]]+)\]\s*$", name)
        if rm:
            node.role = rm.group(1)
            name = name[: rm.start()].strip()
        sm = re.search(r"\(([01]?\.\d+)\)\s*$", name)
        if sm:
            node.score = sm.group(1)
            name = name[: sm.start()].strip()
        node.name = name.strip().strip("*").strip()

        while stack and stack[-1].depth >= depth:
            stack.pop()
        if stack:
            stack[-1].kids.append(node)
        else:
            roots.append(node)
        stack.append(node)

    return roots


def measure(n):
    """카드 자체 높이 + 서브트리 높이."""
    inner = CARD_W - 2 * PAD
    n.why_lines = wrap(n.why, FS_SENT, inner) if n.why else []
    n.lines = []
    for page, txt in n.sents:
        ls = wrap(txt, FS_SENT, inner - 30)
        n.lines.append((page, ls))
    own = HDR_H + PAD
    if n.why_lines:
        own += len(n.why_lines) * LINE_H + SENT_GAP + 2
    for _, ls in n.lines:
        own += len(ls) * LINE_H + SENT_GAP
    if not n.sents and not n.why_lines:
        own = HDR_H + 8
    n.card_h = own

    kids_h = 0
    for k in n.kids:
        measure(k)
        kids_h += k.sub_h + CARD_GAP
    kids_h = max(0, kids_h - CARD_GAP)
    n.sub_h = max(n.card_h, kids_h)
    return n.sub_h


def place(n, x, y):
    n.x = x
    kids_h = sum(k.sub_h + CARD_GAP for k in n.kids) - CARD_GAP if n.kids else 0
    # 부모 카드를 자식 묶음 중앙에 맞춤(자식이 더 클 때)
    if kids_h > n.card_h:
        n.y = y + (kids_h - n.card_h) / 2
    else:
        n.y = y
    cy = y + (n.card_h - kids_h) / 2 if n.card_h > kids_h else y
    for k in n.kids:
        place(k, x + COL_PITCH, cy)
        cy += k.sub_h + CARD_GAP


def colors(n):
    if n.role and n.role in ROLE_COLORS:
        return ROLE_COLORS[n.role]
    if n.contrast:
        return CONTRAST
    return PLAIN


def draw(n, out):
    stroke, fill = colors(n)
    dash = ' stroke-dasharray="5 3"' if n.contrast else ""
    h = n.card_h
    out.append(
        f'<rect x="{n.x:.1f}" y="{n.y:.1f}" width="{CARD_W}" height="{h:.1f}" rx="8" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="1.6"{dash}/>'
    )
    out.append(
        f'<rect x="{n.x:.1f}" y="{n.y:.1f}" width="4" height="{h:.1f}" rx="2" fill="{stroke}"/>'
    )
    ty = n.y + 20
    label = html.escape(n.name)
    out.append(
        f'<text x="{n.x + PAD:.1f}" y="{ty:.1f}" font-size="{FS_HDR}" font-weight="700" '
        f'fill="{stroke}">{label}</text>'
    )
    badge = []
    if n.score:
        badge.append(n.score)
    if n.contrast:
        badge.append("대조축")
    if badge:
        out.append(
            f'<text x="{n.x + CARD_W - PAD:.1f}" y="{ty:.1f}" font-size="10" '
            f'text-anchor="end" fill="{stroke}" opacity="0.75">{" · ".join(badge)}</text>'
        )

    sy = n.y + HDR_H + 10
    if n.why_lines:
        for i, ln in enumerate(n.why_lines):
            out.append(
                f'<text x="{n.x + PAD:.1f}" y="{sy + i * LINE_H:.1f}" '
                f'font-size="{FS_SENT}" font-style="italic" fill="{stroke}" opacity="0.85">'
                f'{html.escape(ln)}</text>'
            )
        sy += len(n.why_lines) * LINE_H + SENT_GAP + 2
    for page, ls in n.lines:
        out.append(
            f'<text x="{n.x + PAD:.1f}" y="{sy:.1f}" font-size="9.5" font-weight="600" '
            f'fill="{stroke}" opacity="0.8">p.{page}</text>'
        )
        for i, ln in enumerate(ls):
            out.append(
                f'<text x="{n.x + PAD + 30:.1f}" y="{sy + i * LINE_H:.1f}" '
                f'font-size="{FS_SENT}" fill="#334155">{html.escape(ln)}</text>'
            )
        sy += len(ls) * LINE_H + SENT_GAP

    for k in n.kids:
        x1, y1 = n.x + CARD_W, n.y + min(h / 2, 40)
        x2, y2 = k.x, k.y + min(k.card_h / 2, 20)
        mx = (x1 + x2) / 2
        out.append(
            f'<path d="M{x1:.1f},{y1:.1f} C{mx:.1f},{y1:.1f} {mx:.1f},{y2:.1f} {x2:.1f},{y2:.1f}" '
            f'fill="none" stroke="#cbd5e1" stroke-width="1.4"/>'
        )
        draw(k, out)


def render(path, dest):
    title, meta, thesis, roots, contrasts = parse(path)
    for r in roots:
        measure(r)

    thesis_lines = []
    top = MARGIN + 58
    if thesis:
        thesis_lines = wrap(thesis, 12, 760)
        top += len(thesis_lines) * 18 + 22
    y = top
    for r in roots:
        place(r, MARGIN, y)
        y += r.sub_h + 28
    tree_bottom = y

    def maxx(n):
        return max([n.x + CARD_W] + [maxx(k) for k in n.kids])

    W = max([maxx(r) for r in roots]) + MARGIN
    W = max(W, 900)

    out = []
    # 대조 목록
    cy = tree_bottom + 18
    if contrasts:
        out.append(
            f'<text x="{MARGIN}" y="{cy:.1f}" font-size="13" font-weight="700" '
            f'fill="{CONTRAST[0]}">대조 구도 {len(contrasts)}쌍</text>'
        )
        cy += 20
        inner = W - 2 * MARGIN - 20
        for c in contrasts:
            for i, ln in enumerate(wrap(c, 11.5, inner)):
                out.append(
                    f'<text x="{MARGIN + (0 if i == 0 else 14):.1f}" y="{cy:.1f}" '
                    f'font-size="11.5" fill="#475569">'
                    f'{"↔ " if i == 0 else ""}{html.escape(ln)}</text>'
                )
                cy += 17
            cy += 3
    H = cy + MARGIN

    body = []
    for r in roots:
        draw(r, body)

    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" '
        f'viewBox="0 0 {W:.0f} {H:.0f}" font-family="-apple-system, \'Apple SD Gothic Neo\', '
        f'\'Noto Sans KR\', sans-serif">',
        f'<rect width="{W:.0f}" height="{H:.0f}" fill="#ffffff"/>',
        f'<text x="{MARGIN}" y="{MARGIN + 8}" font-size="19" font-weight="800" '
        f'fill="#0f172a">{html.escape(title)}</text>',
        f'<text x="{MARGIN}" y="{MARGIN + 30}" font-size="11.5" fill="#64748b">'
        f'{html.escape(meta)}</text>',
        f'<line x1="{MARGIN}" y1="{MARGIN + 42}" x2="{W - MARGIN:.0f}" y2="{MARGIN + 42}" '
        f'stroke="#e2e8f0" stroke-width="1"/>',
    ]
    if thesis_lines:
        bh = len(thesis_lines) * 18 + 26
        svg.append(
            f'<rect x="{MARGIN}" y="{MARGIN + 52}" width="{min(W - 2 * MARGIN, 852):.0f}" '
            f'height="{bh}" rx="8" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.2"/>'
        )
        svg.append(
            f'<text x="{MARGIN + 14}" y="{MARGIN + 70}" font-size="11" font-weight="700" '
            f'fill="#475569">테제</text>'
        )
        for i, ln in enumerate(thesis_lines):
            svg.append(
                f'<text x="{MARGIN + 52}" y="{MARGIN + 70 + i * 18}" font-size="12" '
                f'fill="#1e293b">{html.escape(ln)}</text>'
            )
    svg += body
    svg += out
    svg.append("</svg>")
    open(dest, "w", encoding="utf-8").write("\n".join(svg))
    print(f"{os.path.basename(dest)}  {W:.0f}x{H:.0f}")


for p in sys.argv[1:]:
    render(p, p.replace(".md", ".svg"))
