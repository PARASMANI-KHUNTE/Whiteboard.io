"""
Whiteboard.io - Concise One-Page Presentation Speaker Script Generator
Generates `docs/Whiteboard_io_Presentation_Script.docx` formatted cleanly on a
single printable page aligned slide-by-slide with `docs/Whiteboard_io_Presentation.pptx`.
"""

import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

TOOLING_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.dirname(TOOLING_DIR)
OUTPUT_DOCX = os.path.join(DOCS_DIR, "Whiteboard_io_Presentation_Script.docx")

SLIDE_SCRIPTS = [
    (
        "Slide 1\nCover & Intro",
        "Good morning everyone. Today I am presenting Whiteboard.io, a real-time collaborative digital whiteboard with an infinite canvas, built-in peer voice chat, and AI diagramming—all running directly in the browser.",
    ),
    (
        "Slide 2\nTech Stack",
        "We built the app in TypeScript as a full-stack monorepo. The frontend uses React 19, Vite, and Tailwind CSS with HTML5 Canvas 2D; the backend runs Node.js, Express, Socket.io, MongoDB 7, and WebRTC audio.",
    ),
    (
        "Slide 3\nCore Features",
        "Whiteboard.io combines six tools in one place: rich canvas shapes and sticky notes, live cursor sync, an AI diagram generator and chat drawer, browser voice calls, host safety controls, and previewable exports.",
    ),
    (
        "Slide 4\nArchitecture",
        "As shown in this diagram, it follows a three-tier architecture. The browser client uses REST APIs for login and AI, Socket.io for live canvas updates, MongoDB for cloud storage, and cloud or local AI models.",
    ),
    (
        "Slide 5\nLive Sync Flow",
        "When you draw, strokes render locally in under five milliseconds while streaming to others. Releasing simplifies points by 70 percent with RDP, and a 2D spatial grid keeps zooming smooth at 60 FPS.",
    ),
    (
        "Slide 6\nAI Pipeline",
        "Our AI engine supports six providers—Gemini, Groq, OpenRouter, DeepSeek, NVIDIA NIM, and local Ollama. A five-layer shield adds rate limiting, caching, failover, and procedural fallback while highlighting AI edits.",
    ),
    (
        "Slide 7\nVoice, Auth & Export",
        "Teams talk peer-to-peer over WebRTC with live speaking rings around cursors. Users can sign in via password, Google, or a 7-day guest pass, and export live previews as PNG, SVG, JPEG, WebP, or JSON.",
    ),
    (
        "Slide 8\nData & Storage",
        "Shared rooms sync to MongoDB every half second with auto-expiring guest and token TTL indexes. Solo sketches autosave offline via IndexedDB and merge cleanly across open browser tabs.",
    ),
    (
        "Slide 9\nUse Cases",
        "In practice, teams use Whiteboard.io for architecture reviews, agile sprint retrospectives protected by our 15-second Vote-to-Clear, live technical teaching with host locks, and offline solo sketching.",
    ),
    (
        "Slide 10\nLimits & Wrap-Up",
        "Currently rooms live in single-server memory with a peer-to-peer audio mesh. Next on our roadmap are Redis clustering, a WebRTC SFU, TURN relays, CRDT offline merge, and end-to-end encryption. Thank you!",
    ),
]


def set_cell_shading(cell, fill_hex):
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def set_cell_margins(cell, top=55, bottom=55, left=110, right=110):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement("w:tcMar")
    for side, val in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        node = OxmlElement(f"w:{side}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tcMar.append(node)
    tcPr.append(tcMar)


def set_table_borders(table):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        '<w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
        '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
        '<w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
        '<w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
        "</w:tblBorders>"
    )
    tblPr.append(borders)


def build_script_docx(output_path=OUTPUT_DOCX):
    doc = Document()

    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11.0)
    section.top_margin = Inches(0.45)
    section.bottom_margin = Inches(0.45)
    section.left_margin = Inches(0.55)
    section.right_margin = Inches(0.55)

    # Header Title
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(2)
    r_title = p_title.add_run("Whiteboard.io — One-Page Presentation Script")
    r_title.font.name = "Segoe UI"
    r_title.font.size = Pt(15)
    r_title.font.bold = True
    r_title.font.color.rgb = RGBColor(15, 23, 42)

    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(8)
    r_sub = p_sub.add_run("10-Slide Speaker Guide (~3 min total pace)  •  Matches docs/Whiteboard_io_Presentation.pptx")
    r_sub.font.name = "Segoe UI"
    r_sub.font.size = Pt(9)
    r_sub.font.color.rgb = RGBColor(100, 116, 139)

    table = doc.add_table(rows=len(SLIDE_SCRIPTS) + 1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)

    col_widths = [Inches(1.55), Inches(5.85)]

    # Header Row
    hdr_cells = table.rows[0].cells
    for idx, label in enumerate(("Slide / Topic", "What to Say (Simple & Natural Cue)")):
        cell = hdr_cells[idx]
        cell.width = col_widths[idx]
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        set_cell_shading(cell, "1E3A8A")
        set_cell_margins(cell, top=65, bottom=65, left=110, right=110)
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(label)
        r.font.name = "Segoe UI"
        r.font.size = Pt(9)
        r.font.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)

    # Content Rows
    for row_idx, (slide_label, cue_text) in enumerate(SLIDE_SCRIPTS, start=1):
        row = table.rows[row_idx]
        trPr = row._tr.get_or_add_trPr()
        trPr.append(OxmlElement("w:cantSplit"))

        bg_hex = "F8FAFC" if row_idx % 2 == 0 else "FFFFFF"
        c_left, c_right = row.cells[0], row.cells[1]
        c_left.width = col_widths[0]
        c_right.width = col_widths[1]
        c_left.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        c_right.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        set_cell_shading(c_left, "EFF6FF" if row_idx % 2 == 1 else "E0F2FE")
        set_cell_shading(c_right, bg_hex)
        set_cell_margins(c_left, top=52, bottom=52, left=100, right=90)
        set_cell_margins(c_right, top=52, bottom=52, left=110, right=110)

        p_l = c_left.paragraphs[0]
        p_l.paragraph_format.space_before = Pt(0)
        p_l.paragraph_format.space_after = Pt(0)
        p_l.paragraph_format.line_spacing = 1.1
        lines = slide_label.split("\n")
        r_num = p_l.add_run(lines[0])
        r_num.font.name = "Segoe UI"
        r_num.font.size = Pt(8.5)
        r_num.font.bold = True
        r_num.font.color.rgb = RGBColor(37, 99, 235)
        if len(lines) > 1:
            r_topic = p_l.add_run("\n" + lines[1])
            r_topic.font.name = "Segoe UI"
            r_topic.font.size = Pt(8.5)
            r_topic.font.bold = True
            r_topic.font.color.rgb = RGBColor(15, 23, 42)

        p_r = c_right.paragraphs[0]
        p_r.paragraph_format.space_before = Pt(0)
        p_r.paragraph_format.space_after = Pt(0)
        p_r.paragraph_format.line_spacing = 1.12
        r_body = p_r.add_run(cue_text)
        r_body.font.name = "Segoe UI"
        r_body.font.size = Pt(9.2)
        r_body.font.color.rgb = RGBColor(30, 41, 59)

    p_tip = doc.add_paragraph()
    p_tip.paragraph_format.space_before = Pt(7)
    p_tip.paragraph_format.space_after = Pt(0)
    p_tip.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_tip = p_tip.add_run(
        "Presenter Tip: Pause briefly as you advance each slide and point directly to the flowcharts on Slides 4–8  •  Live Demo: whiteboard-io-1.onrender.com"
    )
    r_tip.font.name = "Segoe UI"
    r_tip.font.size = Pt(8.2)
    r_tip.font.italic = True
    r_tip.font.color.rgb = RGBColor(100, 116, 139)

    doc.save(output_path)
    print(f"Saved {output_path} ({os.path.getsize(output_path) / 1024:.1f} KB)")


if __name__ == "__main__":
    build_script_docx()
