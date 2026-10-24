"""Build the Vietnamese operating manual. Requires reportlab and Arial/Consolas fonts."""
import os
import re
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Preformatted, Table, TableStyle, Flowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'pdf' / 'huong-dan-su-dung-ai-arena.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
fonts = Path(os.environ.get('ARENA_FONTS', 'C:/Windows/Fonts'))
for name, file in [('Body', 'arial.ttf'), ('Bold', 'arialbd.ttf'), ('Code', 'consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(fonts / file)))
INK, MUTED, LINE, LIME = '#203328', '#586454', '#d4dccc', '#d0edab'
body = ParagraphStyle('Body', fontName='Body', fontSize=10, leading=15, textColor=INK, spaceAfter=9)
styles = {
    'body': body,
    'title': ParagraphStyle('Title', parent=body, fontName='Bold', fontSize=27, leading=33, spaceBefore=14, spaceAfter=20),
    'h2': ParagraphStyle('H2', parent=body, fontName='Bold', fontSize=20, leading=27, spaceBefore=6, spaceAfter=18),
    'h3': ParagraphStyle('H3', parent=body, fontName='Bold', fontSize=12, leading=17, spaceBefore=14, spaceAfter=8),
    'code': ParagraphStyle('Code', parent=body, fontName='Code', fontSize=8.4, leading=12, backColor='#edf1e7', borderPadding=10, spaceBefore=5, spaceAfter=14),
    'table': ParagraphStyle('Table', parent=body, fontSize=9, leading=13, spaceAfter=0),
    'th': ParagraphStyle('TH', parent=body, fontName='Bold', fontSize=9, leading=13, spaceAfter=0),
    'bullet': ParagraphStyle('Bullet', parent=body, leftIndent=13, firstLineIndent=-11, spaceAfter=7),
}

def inline(text):
    value = escape(text).replace('→', ' &#8594; ')
    value = re.sub(r'\*\*(.+?)\*\*', r'<font name="Bold">\1</font>', value)
    return re.sub(r'`([^`]+)`', r'<font name="Code" size="8.8">\1</font>', value)


class Architecture(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = 491, 167

    def draw(self):
        c = self.canv
        boxes = [(0, 85, 145, 68, 'TRÌNH DUYỆT', 'BTC / sinh viên'), (172, 85, 146, 68, 'APP', 'Web + API + SQLite'), (345, 85, 146, 68, 'JUDGE', 'Engine + worker')]
        for x, y, w, h, title, text in boxes:
            c.setFillColor(colors.HexColor('#e9efe1'))
            c.roundRect(x, y, w, h, 7, fill=1, stroke=0)
            c.setFillColor(colors.HexColor(INK)); c.setFont('Bold', 10); c.drawString(x + 12, y + 42, title)
            c.setFont('Body', 8.5); c.drawString(x + 12, y + 23, text)
        c.setStrokeColor(colors.HexColor('#637953'))
        for x in [145, 318]:
            c.line(x + 4, 119, x + 23, 119); c.line(x + 19, 123, x + 23, 119); c.line(x + 19, 115, x + 23, 119)
        c.setFillColor(colors.HexColor(LIME)); c.roundRect(345, 13, 146, 52, 7, fill=1, stroke=0)
        c.setFillColor(colors.HexColor(INK)); c.setFont('Bold', 9); c.drawString(357, 45, 'HAI SANDBOX RIÊNG')
        c.setFont('Body', 8); c.drawString(357, 28, 'CPython WASI / Wasmtime')
        c.line(418, 84, 418, 66)
        c.setFillColor(colors.HexColor(MUTED)); c.setFont('Body', 8.5)
        c.drawString(0, 49, 'Chỉ app giữ dữ liệu. Worker dùng API và lease.')
        c.drawString(0, 31, 'Bot không được cấp mạng, secret hay ổ dữ liệu.')


def table(lines):
    rows = [[cell.strip() for cell in line.strip().strip('|').split('|')] for line in lines]
    rows = [row for row in rows if not all(re.fullmatch(r'[:\- ]+', cell) for cell in row)]
    cells = [[Paragraph(inline(cell), styles['th'] if i == 0 else styles['table']) for cell in row] for i, row in enumerate(rows)]
    width = 491
    widths = [width * .28, width * .72] if len(rows[0]) == 2 else [width / len(rows[0])] * len(rows[0])
    t = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6eddb')), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, -1), .4, colors.HexColor(LINE)), ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
    return t


def page(c, doc):
    c.setTitle('Hướng dẫn sử dụng và vận hành - Oẳn Tù Tì AI Arena')
    c.setAuthor('Oẳn Tù Tì AI Arena')
    w, h = doc.pagesize
    c.setStrokeColor(colors.HexColor(LINE)); c.line(52, h - 37, w - 52, h - 37)
    c.setFillColor(colors.HexColor(MUTED)); c.setFont('Body', 8)
    c.drawString(52, h - 28, 'OẲN TÙ TÌ / AI ARENA')
    c.drawRightString(w - 52, h - 28, 'HƯỚNG DẪN VẬN HÀNH')
    c.line(52, 39, w - 52, 39)
    c.drawString(52, 25, 'Bản Docker • 23/10/2026 • Mã nguồn và cấu hình đi kèm repository')
    c.drawRightString(w - 52, 25, str(doc.page))


lines = (ROOT / 'docs' / 'HUONG_DAN_SU_DUNG.md').read_text(encoding='utf-8').splitlines()
story = []
i = 0
while i < len(lines):
    line = lines[i]
    if not line.strip():
        i += 1
        continue
    if line == '---':
        story.append(PageBreak()); i += 1; continue
    if line.startswith('```'):
        code = []; i += 1
        while i < len(lines) and not lines[i].startswith('```'):
            code.append(lines[i]); i += 1
        # Commands retain their actual line endings and PowerShell continuations.
        style = ParagraphStyle('CodeBlock', parent=styles['code'])
        longest = max((pdfmetrics.stringWidth(item, 'Code', 8.4) for item in code), default=1)
        style.fontSize = min(8.4, 8.4 * 475 / max(475, longest))
        story.append(Preformatted('\n'.join(code), style)); i += 1; continue
    if line.startswith('|'):
        group = []
        while i < len(lines) and lines[i].startswith('|'):
            group.append(lines[i]); i += 1
        story += [table(group), Spacer(1, 12)]
        continue
    if line.startswith('# '):
        story.append(Paragraph(inline(line[2:]), styles['title'])); i += 1; continue
    if line.startswith('## '):
        story.append(Paragraph(inline(line[3:]), styles['h2']))
        if line.startswith('## 6.'):
            story += [Architecture(), Spacer(1, 12)]
        i += 1; continue
    if line.startswith('### '):
        story.append(Paragraph(inline(line[4:]), styles['h3'])); i += 1; continue
    paragraph = [line]; i += 1
    while i < len(lines) and lines[i].strip() and not lines[i].startswith(('#', '|', '```', '---')) and not re.match(r'^\d+\. ', lines[i]):
        paragraph.append(lines[i]); i += 1
    text = ' '.join(paragraph)
    story.append(Paragraph(inline(text), styles['bullet'] if re.match(r'^\d+\. ', text) else styles['body']))

doc = SimpleDocTemplate(str(OUT), pagesize=(595.28, 841.89), leftMargin=52, rightMargin=52, topMargin=57, bottomMargin=58, title='Hướng dẫn AI Arena')
doc.build(story, onFirstPage=page, onLaterPages=page)
print(OUT)
