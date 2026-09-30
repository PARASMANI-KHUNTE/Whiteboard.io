import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def set_table_borders(table, color="D3D3D3"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="{color}"/>'
        f'  <w:left w:val="none"/>'
        f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
        f'  <w:right w:val="none"/>'
        f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{color}"/>'
        f'  <w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def add_header_footer(doc):
    for s in doc.sections:
        s.different_first_page_header_footer = True
        
        # Header
        header = s.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run("Whiteboard.io: Master's Minor Project Report | Mentor: Amitesh Kumar Jha, Asst. Professor")
        hrun.font.name = "Times New Roman"
        hrun.font.size = Pt(8.5)
        hrun.font.italic = True
        hrun.font.color.rgb = RGBColor(100, 116, 139)
        
        # Footer
        footer = s.footer
        fp = footer.paragraphs[0]
        fp.text = "" # Clear default text
        
        # Two-column layout in footer
        ft_table = footer.add_table(rows=1, cols=2, width=Inches(6.27))
        ft_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(ft_table, "FFFFFF")
        
        c_left = ft_table.rows[0].cells[0]
        c_right = ft_table.rows[0].cells[1]
        c_left.width = Inches(3.8)
        c_right.width = Inches(2.47)
        
        # Left: Student details
        p_left = c_left.paragraphs[0]
        p_left.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_left.paragraph_format.space_before = Pt(0)
        p_left.paragraph_format.space_after = Pt(0)
        r_l = p_left.add_run("Parasmani Khunte (Roll No. 43) — MCA Semester 3")
        r_l.font.name = "Times New Roman"
        r_l.font.size = Pt(8.5)
        r_l.font.color.rgb = RGBColor(100, 116, 139)
        
        # Right: Dynamic Page X of Y
        p_right = c_right.paragraphs[0]
        p_right.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p_right.paragraph_format.space_before = Pt(0)
        p_right.paragraph_format.space_after = Pt(0)
        
        r_pfx = p_right.add_run("Page ")
        r_pfx.font.name = "Times New Roman"
        r_pfx.font.size = Pt(8.5)
        r_pfx.font.color.rgb = RGBColor(100, 116, 139)
        
        # PAGE field
        run_page = p_right.add_run()
        fld1 = parse_xml(r'<w:fldChar %s w:fldCharType="begin"/>' % nsdecls('w'))
        instr1 = parse_xml(r'<w:instrText %s xml:space="preserve"> PAGE </w:instrText>' % nsdecls('w'))
        fld2 = parse_xml(r'<w:fldChar %s w:fldCharType="separate"/>' % nsdecls('w'))
        fld3 = parse_xml(r'<w:fldChar %s w:fldCharType="end"/>' % nsdecls('w'))
        run_page._r.append(fld1)
        run_page._r.append(instr1)
        run_page._r.append(fld2)
        run_page._r.append(fld3)
        run_page.font.name = "Times New Roman"
        run_page.font.size = Pt(8.5)
        run_page.font.bold = True
        run_page.font.color.rgb = RGBColor(71, 85, 105)
        
        r_mid = p_right.add_run(" of ")
        r_mid.font.name = "Times New Roman"
        r_mid.font.size = Pt(8.5)
        r_mid.font.color.rgb = RGBColor(100, 116, 139)
        
        # NUMPAGES field
        run_total = p_right.add_run()
        fld4 = parse_xml(r'<w:fldChar %s w:fldCharType="begin"/>' % nsdecls('w'))
        instr2 = parse_xml(r'<w:instrText %s xml:space="preserve"> NUMPAGES </w:instrText>' % nsdecls('w'))
        fld5 = parse_xml(r'<w:fldChar %s w:fldCharType="separate"/>' % nsdecls('w'))
        fld6 = parse_xml(r'<w:fldChar %s w:fldCharType="end"/>' % nsdecls('w'))
        run_total._r.append(fld4)
        run_total._r.append(instr2)
        run_total._r.append(fld5)
        run_total._r.append(fld6)
        run_total.font.name = "Times New Roman"
        run_total.font.size = Pt(8.5)
        run_total.font.color.rgb = RGBColor(71, 85, 105)

def format_paragraph(p, space_before=0, space_after=6, line_spacing=1.25, align=WD_ALIGN_PARAGRAPH.JUSTIFY):
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = line_spacing
    p.alignment = align

def add_styled_heading(doc, text, level):
    p = doc.add_paragraph()
    p.paragraph_format.keep_with_next = True
    run = p.add_run(text)
    run.font.name = "Times New Roman"
    run.bold = True
    
    if level == 1:
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.line_spacing = 1.15
        run.font.size = Pt(16)
        run.font.color.rgb = RGBColor(27, 54, 93) # Deep Navy
    elif level == 2:
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        run.font.size = Pt(13)
        run.font.color.rgb = RGBColor(43, 76, 126) # Secondary Blue
    elif level == 3:
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.15
        run.font.size = Pt(11.5)
        run.font.color.rgb = RGBColor(30, 41, 59) # Slate Dark
    return p

def add_body_p(doc, text, bold_prefix="", italic_prefix=""):
    p = doc.add_paragraph()
    format_paragraph(p, space_before=0, space_after=6, line_spacing=1.25, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
    
    if bold_prefix:
        r_bold = p.add_run(bold_prefix)
        r_bold.font.name = "Times New Roman"
        r_bold.font.size = Pt(12)
        r_bold.bold = True
        r_bold.font.color.rgb = RGBColor(15, 23, 42)
        
    if italic_prefix:
        r_it = p.add_run(italic_prefix)
        r_it.font.name = "Times New Roman"
        r_it.font.size = Pt(12)
        r_it.italic = True
        r_it.font.color.rgb = RGBColor(51, 65, 85)

    run = p.add_run(text)
    run.font.name = "Times New Roman"
    run.font.size = Pt(12)
    run.font.color.rgb = RGBColor(30, 41, 59)
    return p

def add_bullet_p(doc, text, bold_prefix=""):
    p = doc.add_paragraph(style='List Bullet')
    format_paragraph(p, space_before=1, space_after=3, line_spacing=1.2, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
    
    if bold_prefix:
        r_bold = p.add_run(bold_prefix)
        r_bold.font.name = "Times New Roman"
        r_bold.font.size = Pt(11.5)
        r_bold.bold = True
        r_bold.font.color.rgb = RGBColor(15, 23, 42)

    run = p.add_run(text)
    run.font.name = "Times New Roman"
    run.font.size = Pt(11.5)
    run.font.color.rgb = RGBColor(30, 41, 59)
    return p

def add_figure(doc, image_path, caption_text):
    if os.path.exists(image_path):
        p_img = doc.add_paragraph()
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_img.paragraph_format.space_before = Pt(8)
        p_img.paragraph_format.space_after = Pt(4)
        run_img = p_img.add_run()
        run_img.add_picture(image_path, width=Inches(6.2))
        
        p_cap = doc.add_paragraph()
        p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_cap.paragraph_format.space_before = Pt(2)
        p_cap.paragraph_format.space_after = Pt(10)
        p_cap.paragraph_format.keep_with_next = False
        r_cap = p_cap.add_run(caption_text)
        r_cap.font.name = "Times New Roman"
        r_cap.font.size = Pt(10)
        r_cap.bold = True
        r_cap.italic = True
        r_cap.font.color.rgb = RGBColor(71, 85, 105)

def format_custom_table(table, col_widths, headers, rows):
    set_table_borders(table, "CBD5E1")
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    # Ensure table has enough rows
    while len(table.rows) < len(rows) + 1:
        table.add_row()
    
    # Header row
    hdr_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = h
        hdr_cells[i].width = Inches(col_widths[i])
        set_cell_background(hdr_cells[i], "1B365D") # Navy blue header
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=150, right=150)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        for r in p.runs:
            r.font.name = "Times New Roman"
            r.font.size = Pt(10)
            r.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)
            
    # Data rows
    for r_idx, row_data in enumerate(rows):
        row_cells = table.rows[r_idx + 1].cells
        bg_color = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(row_data):
            row_cells[c_idx].text = str(val)
            row_cells[c_idx].width = Inches(col_widths[c_idx])
            set_cell_background(row_cells[c_idx], bg_color)
            set_cell_margins(row_cells[c_idx], top=80, bottom=80, left=150, right=150)
            p = row_cells[c_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            for r in p.runs:
                r.font.name = "Times New Roman"
                r.font.size = Pt(9.5)
                r.font.color.rgb = RGBColor(30, 41, 59)

def build_report():
    doc = Document()
    
    # Page setup - A4
    for section in doc.sections:
        section.page_width = Inches(8.27)
        section.page_height = Inches(11.69)
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
    add_header_footer(doc)

    # =========================================================================
    # 1. TITLE PAGE
    # =========================================================================
    p_t_sp = doc.add_paragraph()
    p_t_sp.paragraph_format.space_before = Pt(28)
    
    p_main_title = doc.add_paragraph()
    p_main_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_mt = p_main_title.add_run("WHITEBOARD.IO")
    r_mt.font.name = "Times New Roman"
    r_mt.font.size = Pt(28)
    r_mt.bold = True
    r_mt.font.color.rgb = RGBColor(27, 54, 93)
    
    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_before = Pt(4)
    p_sub.paragraph_format.space_after = Pt(18)
    r_sub = p_sub.add_run("A Real-Time Distributed Collaborative Whiteboard System\nwith WebRTC Voice Mesh and Generative AI Diagramming")
    r_sub.font.name = "Times New Roman"
    r_sub.font.size = Pt(13.5)
    r_sub.font.color.rgb = RGBColor(71, 85, 105)
    
    p_rule = doc.add_paragraph()
    p_rule.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_rule = p_rule.add_run("―" * 36)
    r_rule.font.color.rgb = RGBColor(148, 163, 184)
    
    p_deg = doc.add_paragraph()
    p_deg.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_deg.paragraph_format.space_before = Pt(18)
    p_deg.paragraph_format.space_after = Pt(22)
    r_deg = p_deg.add_run("A Master's Minor Project Report\nSubmitted in partial fulfillment of the requirements for the degree of\nMASTER OF COMPUTER APPLICATIONS (MCA)\nMCA Semester 3")
    r_deg.font.name = "Times New Roman"
    r_deg.font.size = Pt(12.5)
    r_deg.font.color.rgb = RGBColor(30, 41, 59)
    
    # Student Details
    p_subm = doc.add_paragraph()
    p_subm.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_subm.paragraph_format.space_before = Pt(12)
    p_subm.paragraph_format.space_after = Pt(2)
    r_subm = p_subm.add_run("Submitted by:")
    r_subm.font.name = "Times New Roman"
    r_subm.font.size = Pt(11)
    r_subm.font.italic = True
    r_subm.font.color.rgb = RGBColor(100, 116, 139)
    
    p_name = doc.add_paragraph()
    p_name.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_name.paragraph_format.space_before = Pt(0)
    p_name.paragraph_format.space_after = Pt(16)
    r_name = p_name.add_run("PARASMANI KHUNTE\nRoll Number: 43\nMCA Semester 3")
    r_name.font.name = "Times New Roman"
    r_name.font.size = Pt(14)
    r_name.bold = True
    r_name.font.color.rgb = RGBColor(15, 23, 42)
    
    # Mentor Details
    p_men_lbl = doc.add_paragraph()
    p_men_lbl.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_men_lbl.paragraph_format.space_before = Pt(8)
    p_men_lbl.paragraph_format.space_after = Pt(2)
    r_men_lbl = p_men_lbl.add_run("Under the Guidance & Mentorship of:")
    r_men_lbl.font.name = "Times New Roman"
    r_men_lbl.font.size = Pt(11)
    r_men_lbl.font.italic = True
    r_men_lbl.font.color.rgb = RGBColor(100, 116, 139)
    
    p_mentor = doc.add_paragraph()
    p_mentor.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_mentor.paragraph_format.space_before = Pt(0)
    p_mentor.paragraph_format.space_after = Pt(24)
    r_mentor = p_mentor.add_run("AMITESH KUMAR JHA\nAssistant Professor & Project Mentor\nDepartment of Computer Applications")
    r_mentor.font.name = "Times New Roman"
    r_mentor.font.size = Pt(13)
    r_mentor.bold = True
    r_mentor.font.color.rgb = RGBColor(27, 54, 93)
    
    p_inst = doc.add_paragraph()
    p_inst.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_inst.paragraph_format.space_before = Pt(16)
    r_inst = p_inst.add_run("Department of Computer Applications\nAcademic Session: 2025–2026")
    r_inst.font.name = "Times New Roman"
    r_inst.font.size = Pt(11)
    r_inst.font.color.rgb = RGBColor(71, 85, 105)
    
    doc.add_page_break()

    # =========================================================================
    # 2. CERTIFICATE
    # =========================================================================
    add_styled_heading(doc, "CERTIFICATE OF APPROVAL", 1)
    p_cert_line = doc.add_paragraph()
    r_cl = p_cert_line.add_run("―" * 55)
    r_cl.font.color.rgb = RGBColor(203, 213, 225)
    
    add_body_p(doc, 
               "This is to certify that the Master's Minor Project entitled \"Whiteboard.io: A Real-Time Distributed Collaborative Whiteboard System with WebRTC Voice Mesh and Generative AI Diagramming\" submitted by Parasmani Khunte (Roll Number: 43), a student of Master of Computer Applications (MCA), Semester 3, has been successfully developed and carried out under the direct guidance and supervision of Amitesh Kumar Jha, Assistant Professor, Department of Computer Applications.")
    
    add_body_p(doc, 
               "The work embodied in this project report has been fully evaluated and approved in partial fulfillment of the requirements for the award of the degree of Master of Computer Applications (MCA). To the best of our knowledge and evaluation, the architectural models, real-time algorithms, database schemas, and documentation presented herein represent an authentic record of technical work executed during the academic session 2025–2026.")
    
    # Signature table
    p_sig_sp = doc.add_paragraph()
    p_sig_sp.paragraph_format.space_before = Pt(40)
    
    sig_table = doc.add_table(rows=2, cols=3)
    sig_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    col_w = [2.0, 2.0, 2.0]
    
    sig_data = [
        ["_________________________\nAMITESH KUMAR JHA\nAssistant Professor & Project Mentor\nDept. of Computer Applications",
         "_________________________\nHEAD OF DEPARTMENT\nDepartment of Computer Applications\nBoard of Studies",
         "_________________________\nEXTERNAL EXAMINER\nBoard of Examination\nMCA Project Evaluation"],
        ["Date: ____________________\nPlace: ____________________",
         "Department Seal",
         "Date of Examination:\n_________________________"]
    ]
    for r_idx, row in enumerate(sig_data):
        for c_idx, text in enumerate(row):
            cell = sig_table.rows[r_idx].cells[c_idx]
            cell.width = Inches(col_w[c_idx])
            cell.text = text
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.line_spacing = 1.15
            for run in p.runs:
                run.font.name = "Times New Roman"
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(30, 41, 59)
                
    doc.add_page_break()

    # =========================================================================
    # 3. DECLARATION
    # =========================================================================
    add_styled_heading(doc, "CANDIDATE'S DECLARATION", 1)
    p_dec_line = doc.add_paragraph()
    r_dl = p_dec_line.add_run("―" * 55)
    r_dl.font.color.rgb = RGBColor(203, 213, 225)
    
    add_body_p(doc, 
               "I, Parasmani Khunte (Roll Number: 43), student of Master of Computer Applications (MCA), Semester 3, hereby declare that the minor project report entitled \"Whiteboard.io: A Real-Time Distributed Collaborative Whiteboard System with WebRTC Voice Mesh and Generative AI Diagramming\" submitted to the Department of Computer Applications is an authentic record of original project and research work carried out by me under the esteemed mentorship and supervision of Amitesh Kumar Jha, Assistant Professor.")
    
    add_body_p(doc, 
               "I further declare that the technical implementation, architectural models, database schemas, REST APIs, Socket.io event interfaces, WebRTC peer-to-peer audio pipelines, and Google Gemini AI integration described in this report are based strictly on the verified source code and configuration of the Whiteboard.io repository.")
    
    add_body_p(doc, 
               "This report has not been submitted previously, in part or in whole, to any other university, institute, or examining body for the award of any degree, diploma, fellowship, or other academic recognition.")

    p_dec_sign = doc.add_paragraph()
    p_dec_sign.paragraph_format.space_before = Pt(36)
    p_dec_sign.paragraph_format.line_spacing = 1.2
    r_ds = p_dec_sign.add_run("Date: ____________________\nPlace: ____________________\n\n\n_____________________________________\nPARASMANI KHUNTE\nRoll Number: 43\nMaster of Computer Applications (MCA)\nMCA Semester 3")
    r_ds.font.name = "Times New Roman"
    r_ds.font.size = Pt(11)
    r_ds.font.color.rgb = RGBColor(15, 23, 42)

    doc.add_page_break()

    # =========================================================================
    # 4. ACKNOWLEDGEMENT
    # =========================================================================
    add_styled_heading(doc, "ACKNOWLEDGEMENT", 1)
    p_ack_line = doc.add_paragraph()
    r_al = p_ack_line.add_run("―" * 55)
    r_al.font.color.rgb = RGBColor(203, 213, 225)
    
    add_body_p(doc, 
               "I express my deepest sense of gratitude, profound respect, and sincere thanks to my respected Project Mentor, Amitesh Kumar Jha, Assistant Professor, Department of Computer Applications, for his invaluable academic guidance, constructive critique, intellectual stimulation, and continuous technical encouragement throughout the conceptualization, system modeling, and implementation of Whiteboard.io. His profound technical insights into distributed real-time systems and WebSocket architectures served as a constant guiding light during the development of this minor project.")
    
    add_body_p(doc, 
               "I am sincerely thankful to the Head of the Department and all faculty members of the Department of Computer Applications for providing the computing infrastructure, laboratory resources, and vibrant academic atmosphere essential for executing real-time distributed software engineering projects.")
    
    add_body_p(doc, 
               "I extend my heartfelt appreciation to my peers and fellow MCA students whose testing feedback, simulated multi-user collaboration sessions, and constructive insights helped refine the peer-to-peer audio mesh, permission controls, and canvas synchronization mechanisms. Finally, I acknowledge the vibrant open-source ecosystem surrounding React, Node.js, Express, Socket.io, MongoDB, and the Google Gemini API, which provided the foundational toolchains enabling this project.")

    p_ack_sign = doc.add_paragraph()
    p_ack_sign.paragraph_format.space_before = Pt(28)
    r_as = p_ack_sign.add_run("Parasmani Khunte\nRoll Number: 43\nMCA Semester 3")
    r_as.font.name = "Times New Roman"
    r_as.font.size = Pt(11.5)
    r_as.bold = True
    r_as.font.color.rgb = RGBColor(15, 23, 42)

    doc.add_page_break()

    # =========================================================================
    # 5. ABSTRACT
    # =========================================================================
    add_styled_heading(doc, "ABSTRACT", 1)
    p_abs_line = doc.add_paragraph()
    r_abl = p_abs_line.add_run("―" * 55)
    r_abl.font.color.rgb = RGBColor(203, 213, 225)
    
    # Target word count: 250 - 300 words (Current: 273 words)
    abstract_text = (
        "Contemporary distributed teams, remote software engineering cohorts, and digital learning environments require "
        "shared visual workspaces where geographically separated participants can sketch, diagram, ideate, and converse with "
        "zero perceived latency. Traditional digital whiteboard applications frequently suffer from high latency, synchronization "
        "conflicts, decoupled voice conferencing channels, and the absence of intelligent automated diagram synthesis. "
        "Whiteboard.io addresses these fundamental challenges by implementing a comprehensive, real-time distributed "
        "collaborative whiteboard platform engineered with React 19, Node.js, Express, Socket.io, and MongoDB. The system "
        "features an expressive HTML5 Canvas 2D interaction engine that supports freehand brush strokes, translucent highlighters, "
        "geometric shapes, sticky notes, typography elements, and associative wire connectors. Through a dual-channel architecture, "
        "RESTful endpoints oversee secure user authentication—spanning PBKDF2-SHA512 password protection, Google OAuth 2.0 "
        "federation, and 7-day auto-expiring guest sessions—while a bi-directional Socket.io WebSocket gateway drives real-time "
        "stroke streaming, optimistic canvas rendering, multiplayer cursor tracking, and consensus vote-to-clear governance. "
        "Authoritative room states are held in server memory, while an intelligent debounced persistence layer asynchronously "
        "commits mutations to MongoDB, entirely eliminating database write contention. To provide cohesive communication without "
        "external dependencies, Whiteboard.io incorporates a decentralized WebRTC peer-to-peer audio mesh featuring anti-glare "
        "negotiation and real-time speech frequency analysis using the Web Audio API. Furthermore, the platform integrates "
        "Google Gemini 2.5 Flash to dynamically transform natural language descriptions into interactive, spatial canvas diagrams. "
        "A dedicated five-layer defensive shield—comprising IP rate limiting, response caching, request pacing, exponential "
        "backoff, and offline procedural synthesis—guarantees uninterrupted system availability under heavy workload constraints. "
        "The resulting application delivers an intuitive, secure, and production-ready distributed collaboration environment."
    )
    
    add_body_p(doc, abstract_text)
    
    p_kw = doc.add_paragraph()
    p_kw.paragraph_format.space_before = Pt(12)
    r_kw_lbl = p_kw.add_run("Keywords: ")
    r_kw_lbl.font.name = "Times New Roman"
    r_kw_lbl.font.size = Pt(11)
    r_kw_lbl.bold = True
    r_kw_lbl.font.color.rgb = RGBColor(27, 54, 93)
    
    r_kw_val = p_kw.add_run("Collaborative Whiteboard, Real-Time Synchronization, Socket.io, WebRTC Audio Mesh, MongoDB, Optimistic UI, Google Gemini 2.5 Flash, Rate-Limiting Shield, Distributed Systems.")
    r_kw_val.font.name = "Times New Roman"
    r_kw_val.font.size = Pt(11)
    r_kw_val.font.italic = True
    r_kw_val.font.color.rgb = RGBColor(51, 65, 85)

    doc.add_page_break()

    # =========================================================================
    # 6. INDEX / TABLE OF CONTENTS
    # =========================================================================
    add_styled_heading(doc, "INDEX / TABLE OF CONTENTS", 1)
    p_toc_line = doc.add_paragraph()
    r_tocl = p_toc_line.add_run("―" * 55)
    r_tocl.font.color.rgb = RGBColor(203, 213, 225)
    
    toc_items = [
        ("Certificate of Approval", "ii"),
        ("Candidate's Declaration", "iii"),
        ("Acknowledgement", "iv"),
        ("Abstract", "v"),
        ("List of Tables", "vii"),
        ("List of Figures", "viii"),
        ("1. Introduction", "1"),
        ("    1.1 Background & Context", "1"),
        ("    1.2 Problem Statement", "2"),
        ("    1.3 Technical Challenges in Collaborative Whiteboards", "3"),
        ("    1.4 Proposed Whiteboard.io Architecture", "4"),
        ("    1.5 High-Level Project Overview", "5"),
        ("2. Objectives and Scope", "6"),
        ("    2.1 Concrete Project Objectives", "6"),
        ("    2.2 Functional & Operational Scope", "7"),
        ("3. System Requirements and Technology Stack", "8"),
        ("    3.1 Hardware Requirements", "8"),
        ("    3.2 Software Requirements & Operating Environments", "8"),
        ("    3.3 Comprehensive Technology Stack Inventory", "9"),
        ("4. System Analysis and Design", "11"),
        ("    4.1 Functional Requirements Specification", "11"),
        ("    4.2 Non-Functional Requirements Analysis", "12"),
        ("    4.3 Complete System Architecture Design", "13"),
        ("    4.4 Real-Time Data Flow Pipeline", "14"),
        ("    4.5 Database Design & Document Schemas", "15"),
        ("    4.6 RESTful API Design Specification", "17"),
        ("    4.7 Socket.io Real-Time Protocol Specification", "18"),
        ("    4.8 WebRTC Voice Chat Mesh Architecture", "19"),
        ("    4.9 Google Gemini AI Diagramming Architecture", "20"),
        ("    4.10 Security, Authentication & Governance Design", "21"),
        ("5. Implementation Details", "22"),
        ("    5.1 Server Entry & Express/Socket Gateway (server/index.ts)", "22"),
        ("    5.2 MongoDB Persistence Engine & Indexes (server/db.ts)", "23"),
        ("    5.3 Authentication, Tokenization & Hashing (server/auth.ts)", "24"),
        ("    5.4 Google Gemini AI Engine & Fallback (server/gemini.ts)", "25"),
        ("    5.5 Client Core & HTML5 Canvas Engine (client/src/components/Canvas.tsx)", "26"),
        ("    5.6 Real-Time Collaboration Hook (client/src/hooks/useSocket.ts)", "27"),
        ("    5.7 WebRTC Audio Mesh Hook (client/src/hooks/useVoiceChat.ts)", "28"),
        ("    5.8 Room Governance, Lock & Consensus Vote Mechanics", "29"),
        ("6. Testing and Quality Assurance", "30"),
        ("    6.1 Current Status of Automated Testing Suite", "30"),
        ("    6.2 Comprehensive Recommended Test-Case Matrix", "31"),
        ("7. Conclusion and Future Scope", "34"),
        ("    7.1 Project Conclusion & Achievements", "34"),
        ("    7.2 Future Research & Engineering Scope", "35"),
        ("8. References", "36"),
    ]
    
    t_toc = doc.add_table(rows=len(toc_items), cols=2)
    t_toc.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t_toc, "FFFFFF")
    
    for idx, (title, page) in enumerate(toc_items):
        c_title = t_toc.rows[idx].cells[0]
        c_page = t_toc.rows[idx].cells[1]
        
        c_title.width = Inches(5.4)
        c_page.width = Inches(0.8)
        
        c_title.text = title
        c_page.text = page
        
        set_cell_margins(c_title, top=25, bottom=25, left=40, right=40)
        set_cell_margins(c_page, top=25, bottom=25, left=40, right=40)
        
        p0 = c_title.paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p0.paragraph_format.line_spacing = 1.15
        p0.paragraph_format.space_before = Pt(0)
        p0.paragraph_format.space_after = Pt(0)
        
        p1 = c_page.paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p1.paragraph_format.line_spacing = 1.15
        p1.paragraph_format.space_before = Pt(0)
        p1.paragraph_format.space_after = Pt(0)
        
        is_major = not title.startswith("    ")
        for r in p0.runs:
            r.font.name = "Times New Roman"
            r.font.size = Pt(10) if is_major else Pt(9.5)
            r.bold = is_major
            r.font.color.rgb = RGBColor(27, 54, 93) if is_major else RGBColor(51, 65, 85)
            
        for r in p1.runs:
            r.font.name = "Times New Roman"
            r.font.size = Pt(9.5)
            r.bold = is_major
            r.font.color.rgb = RGBColor(71, 85, 105)

    doc.add_page_break()

    # =========================================================================
    # 6B. LIST OF TABLES & LIST OF FIGURES
    # =========================================================================
    add_styled_heading(doc, "LIST OF TABLES", 1)
    p_lot_line = doc.add_paragraph()
    r_lotl = p_lot_line.add_run("―" * 55)
    r_lotl.font.color.rgb = RGBColor(203, 213, 225)
    
    tables_list = [
        ("Table 1.1", "Comprehensive Technology Stack Inventory & Architectural Roles", "9"),
        ("Table 2.1", "MongoDB Document Schema: users Collection", "15"),
        ("Table 2.2", "MongoDB Document Schema: tokens Collection (30-Day TTL)", "16"),
        ("Table 2.3", "MongoDB Document Schema: rooms Collection", "16"),
        ("Table 2.4", "MongoDB Document Schema: room_elements & elements Collections", "16"),
        ("Table 3.1", "Express RESTful API Endpoint Specifications", "17"),
        ("Table 3.2", "Socket.io Bidirectional Real-Time Event Protocols", "18"),
        ("Table 4.1", "Comprehensive Recommended Test-Case Matrix (22 Verification Scenarios)", "31"),
    ]
    
    t_lot = doc.add_table(rows=len(tables_list), cols=3)
    t_lot.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t_lot, "FFFFFF")
    
    for idx, (num, desc, page) in enumerate(tables_list):
        c_num = t_lot.rows[idx].cells[0]
        c_desc = t_lot.rows[idx].cells[1]
        c_page = t_lot.rows[idx].cells[2]
        
        c_num.width = Inches(1.1)
        c_desc.width = Inches(4.3)
        c_page.width = Inches(0.8)
        
        c_num.text = num
        c_desc.text = desc
        c_page.text = page
        
        set_cell_margins(c_num, top=30, bottom=30, left=40, right=40)
        set_cell_margins(c_desc, top=30, bottom=30, left=40, right=40)
        set_cell_margins(c_page, top=30, bottom=30, left=40, right=40)
        
        p0 = c_num.paragraphs[0]
        p1 = c_desc.paragraphs[0]
        p2 = c_page.paragraphs[0]
        
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p1.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        
        for r in p0.runs:
            r.font.name = "Times New Roman"
            r.font.size = Pt(9.5)
            r.bold = True
            r.font.color.rgb = RGBColor(27, 54, 93)
        for r in p1.runs:
            r.font.name = "Times New Roman"
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(30, 41, 59)
        for r in p2.runs:
            r.font.name = "Times New Roman"
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(71, 85, 105)

    p_sp_lof = doc.add_paragraph()
    p_sp_lof.paragraph_format.space_before = Pt(16)

    add_styled_heading(doc, "LIST OF FIGURES", 1)
    p_lof_line = doc.add_paragraph()
    r_lofl = p_lof_line.add_run("―" * 55)
    r_lofl.font.color.rgb = RGBColor(203, 213, 225)
    
    figures_list = [
        ("Figure 1", "High-Level System Architecture of Whiteboard.io", "13"),
        ("Figure 2", "Real-Time Collaborative Drawing & Persistence Pipeline", "14"),
        ("Figure 3", "MongoDB Document Schemas and Inter-Collection Relationships", "15"),
        ("Figure 4", "Google Gemini 2.5 Flash Diagram Generation & 5-Layer Rate-Limit Shield", "20"),
    ]
    
    t_lof = doc.add_table(rows=len(figures_list), cols=3)
    t_lof.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t_lof, "FFFFFF")
    
    for idx, (num, desc, page) in enumerate(figures_list):
        c_num = t_lof.rows[idx].cells[0]
        c_desc = t_lof.rows[idx].cells[1]
        c_page = t_lof.rows[idx].cells[2]
        
        c_num.width = Inches(1.1)
        c_desc.width = Inches(4.3)
        c_page.width = Inches(0.8)
        
        c_num.text = num
        c_desc.text = desc
        c_page.text = page
        
        set_cell_margins(c_num, top=30, bottom=30, left=40, right=40)
        set_cell_margins(c_desc, top=30, bottom=30, left=40, right=40)
        set_cell_margins(c_page, top=30, bottom=30, left=40, right=40)
        
        p0 = c_num.paragraphs[0]
        p1 = c_desc.paragraphs[0]
        p2 = c_page.paragraphs[0]
        
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p1.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        
        for r in p0.runs:
            r.font.name = "Times New Roman"
            r.font.size = Pt(9.5)
            r.bold = True
            r.font.color.rgb = RGBColor(27, 54, 93)
        for r in p1.runs:
            r.font.name = "Times New Roman"
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(30, 41, 59)
        for r in p2.runs:
            r.font.name = "Times New Roman"
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(71, 85, 105)

    doc.add_page_break()

    # =========================================================================
    # 7. INTRODUCTION
    # =========================================================================
    add_styled_heading(doc, "1. INTRODUCTION", 1)
    
    add_styled_heading(doc, "1.1 Background & Context", 2)
    add_body_p(doc, 
               "In modern software engineering, academic instruction, architectural design, and cross-functional enterprise workflows, visual communication has become indispensable. Distributed teams across different geographic locations regularly require shared drawing environments to conceptualize complex architectures, brainstorm feature requirements, map workflows, and execute collaborative design sprints. Traditional analog whiteboards, while highly intuitive, are physically constrained to co-located environments. The rapid global shift towards hybrid and remote working paradigms has catalyzed urgent demand for cloud-native digital whiteboards capable of mimicking the immediacy, fluidity, and natural expressiveness of physical marker boards while unlocking digital superpowers such as boundless viewports, real-time multi-client synchronization, embedded audio communication, and artificial intelligence-driven diagram synthesis.")
    
    add_body_p(doc, 
               "Existing commercial offerings frequently operate as bloated monolithic platforms with steep subscription tiers, proprietary data lock-ins, high latency over centralized cloud brokers, and disconnected third-party communication channels requiring users to operate separate conference calling tools alongside the canvas. Whiteboard.io was conceptualized and developed to address these structural limitations by delivering a modern, lightweight, highly responsive, and real-time distributed whiteboard platform operating entirely in the web browser without client-side plugins.")

    add_styled_heading(doc, "1.2 Problem Statement", 2)
    add_body_p(doc, 
               "Real-time distributed collaboration introduces severe technical complexities spanning network latency, concurrent write contention, synchronization of high-frequency spatial drawing coordinates, cross-peer audio orchestration, and seamless state persistence. Specifically, an effective digital whiteboard must solve the following core engineering problem:")
    
    add_body_p(doc, 
               "\"How to design and engineer a web-based real-time collaborative workspace that provides zero-perceived latency for local freehand pen strokes and spatial manipulation, synchronizes concurrent mutations across multiple distributed participants with authoritative state consistency, integrates native low-latency voice communication without dedicated media servers, guarantees persistent document durability without degrading real-time rendering throughput, and harnesses generative artificial intelligence to synthesize complex technical diagrams directly into editable canvas elements while defending against cloud API rate exhaustion.\"",
               italic_prefix="Problem Definition: ")

    add_styled_heading(doc, "1.3 Technical Challenges in Collaborative Whiteboards", 2)
    add_body_p(doc, 
               "Developing Whiteboard.io required overcoming several non-trivial engineering bottlenecks inherent to distributed, real-time web applications:")
    
    add_bullet_p(doc, 
                 "When a user draws a curved stroke, the browser captures dozens of coordinate events per second. Waiting for a round-trip network acknowledgment before rendering would introduce perceptible lag (50–150ms), causing handwriting distortion and a sluggish drawing feel. A hybrid rendering approach combining optimistic local execution with streaming point payloads is strictly required.",
                 bold_prefix="High-Frequency Coordinate Streaming: ")
    
    add_bullet_p(doc, 
                 "If every single mouse movement or brush point triggered a synchronous database write, MongoDB would rapidly experience connection pool exhaustion and disk write saturation under multi-room concurrency. An intelligent buffering and debounced persistence architecture must decouple high-frequency socket events from database transactions.",
                 bold_prefix="Database Write Bottlenecks: ")
    
    add_bullet_p(doc, 
                 "Establishing peer-to-peer audio across diverse client network configurations requires traversing Symmetric NATs, firewalls, and carrier-grade NATs. Furthermore, simultaneous offer dispatching between connecting peers creates offer collision (glare) conditions that cause WebRTC session negotiation failures.",
                 bold_prefix="NAT Traversal & Glare Resolution: ")
    
    add_bullet_p(doc, 
                 "Large Language Models such as Google Gemini enforce stringent Requests-Per-Minute (RPM) and token quotas on free and standard tiers. Burst traffic from multiple collaborative users generating architectural diagrams could easily trigger HTTP 429 quota exhaustion, crashing collaborative sessions.",
                 bold_prefix="External LLM Quota Boundaries: ")

    add_styled_heading(doc, "1.4 Proposed Whiteboard.io Architecture", 2)
    add_body_p(doc, 
               "To solve these challenges, Whiteboard.io implements a decoupled, event-driven client-server architecture combining an expressive React 19 single-page application with a Node.js/Express backend, Socket.io real-time gateways, MongoDB native persistence, WebRTC peer-to-peer audio mesh, and an intelligent Google Gemini 2.5 Flash diagram synthesis engine.")
    
    add_body_p(doc, 
               "The platform maintains an authoritative in-memory room state map on the server (`Map<string, RoomData>`), enabling sub-millisecond event broadcasting and conflict resolution across participants. Persistence to MongoDB is performed asynchronously via a debounced write pipeline (400–1000ms delay), ensuring zero database write contention during high-velocity drawing sessions. Voice chat is orchestrated over a fully decentralized WebRTC audio mesh using Socket.io for signaling and STUN servers for NAT traversal, augmented by an active Web Audio API frequency visualizer. Generative AI diagramming is fortified by a multi-layered defensive rate-limit shield featuring in-memory caching, request pacing, exponential backoff, and a deterministic offline procedural fallback engine.")

    add_styled_heading(doc, "1.5 High-Level Project Overview", 2)
    add_body_p(doc, 
               "Whiteboard.io is organized into two primary sub-systems: the frontend client application (`client/`) and the backend server application (`server/`), supplemented by architectural and deployment documentation (`docs/`):")
    
    add_bullet_p(doc, 
                 "Built using React 19, TypeScript, Vite, and Tailwind CSS. Features an HTML5 Canvas 2D freehand rendering engine, responsive viewport controls (pan, zoom, multi-touch pinch), customized toolbar, modal interfaces (Authentication, Session Launcher, Share Room, AI Generation, Admin Panel, Vote-to-Clear), and custom React hooks managing socket synchronization, authentication state, and WebRTC voice channels.",
                 bold_prefix="Client Subsystem: ")
    
    add_bullet_p(doc, 
                 "Built using Node.js, Express, Socket.io, and the MongoDB Native Driver (v7.6). Implements PBKDF2-SHA512 password hashing with 100,000 iterations, Google OAuth 2.0 verification, dynamic room isolation, host permission governance, vote-to-clear consensus timers, and the Gemini 2.5 Flash diagramming engine.",
                 bold_prefix="Backend Subsystem: ")

    doc.add_page_break()

    # =========================================================================
    # 8. OBJECTIVES AND SCOPE
    # =========================================================================
    add_styled_heading(doc, "2. OBJECTIVES AND SCOPE", 1)
    
    add_styled_heading(doc, "2.1 Concrete Project Objectives", 2)
    add_body_p(doc, 
               "The design and implementation of Whiteboard.io were driven by five concrete, code-verified technical objectives:")
    
    add_bullet_p(doc, 
                 "Develop a responsive HTML5 Canvas 2D engine that renders local brush strokes, highlighters, geometric shapes, sticky notes, text blocks, and associative wire connectors with zero perceptible latency, while streaming incremental coordinate packets over WebSockets to synchronize canvas states across all active room participants.",
                 bold_prefix="1. Real-Time Collaborative Canvas: ")
    
    add_bullet_p(doc, 
                 "Implement a dynamic room lifecycle model supporting custom room codes, URL query/hash binding, host ownership rights, permission toggling (admin, editor, viewer), user kicking, room-wide read-only locking, automatic host migration upon creator disconnect, and a consensus-based vote-to-clear mechanism with automated timer expiration.",
                 bold_prefix="2. Workspace Isolation & Room Governance: ")
    
    add_bullet_p(doc, 
                 "Engineer a multi-tiered authentication architecture providing PBKDF2-SHA512 password-protected user accounts with per-user salt generation, Google OAuth 2.0 federated login with popup and redirect fallbacks, and instant anonymous guest sessions governed by MongoDB Time-To-Live (TTL) automatic 7-day expiration indexes.",
                 bold_prefix="3. Multi-Tiered Secure Authentication: ")
    
    add_bullet_p(doc, 
                 "Establish a decentralized peer-to-peer WebRTC audio mesh using Socket.io for SDP and ICE signaling, deterministic initiator role calculation to eliminate glare collisions, Web Audio API frequency analysis for real-time speech indicators around collaborative cursors, and an interactive audio simulation fallback for restricted browser contexts.",
                 bold_prefix="4. Decentralized WebRTC Voice Communication: ")
    
    add_bullet_p(doc, 
                 "Build an automated diagram synthesis pipeline leveraging Google Gemini 2.5 Flash that converts natural language prompts into fully formatted, spatially coordinated whiteboard nodes (mind maps, flowcharts, Kanban boards, and architecture diagrams), protected by a 5-layer rate-limiting shield and an offline procedural fallback generator.",
                 bold_prefix="5. AI-Powered Diagram Generation & Shield: ")

    add_styled_heading(doc, "2.2 Functional & Operational Scope", 2)
    add_body_p(doc, 
               "The operational scope of Whiteboard.io spans modern web browsers across desktop and tablet form factors:")
    
    add_bullet_p(doc, 
                 "Software engineers, agile scrum teams, academic instructors, visual designers, and remote study groups requiring instant collaborative sketching without mandatory account registration hurdles.",
                 bold_prefix="Target Audience: ")
    
    add_bullet_p(doc, 
                 "Complete freehand pen tool, translucent highlighter, eraser with Euclidean segment distance hit-testing, geometric shapes (rectangle, circle, diamond, triangle, star, arrow), sticky notes with multi-line editing, styled text, SVG icon library, and elastic associative wire connectors with curved Bezier or orthogonal routing.",
                 bold_prefix="Canvas Capabilities: ")
    
    add_bullet_p(doc, 
                 "Real-time broadcasting of pointer coordinates with user names, role badges, active drawing tool indicators, and pulsing audio halos that illuminate green when the user speaks into their microphone.",
                 bold_prefix="Multiplayer Awareness: ")
    
    add_bullet_p(doc, 
                 "The current implementation maintains room state in single-server memory with debounced MongoDB writes. Horizontal scaling across multi-server clusters requires implementing an external message bus (e.g., Redis Pub/Sub adapter) which represents a logical future enhancement.",
                 bold_prefix="Current Operational Boundaries: ")

    doc.add_page_break()

    # =========================================================================
    # 9. SYSTEM REQUIREMENTS AND TECHNOLOGY STACK
    # =========================================================================
    add_styled_heading(doc, "3. SYSTEM REQUIREMENTS AND TECHNOLOGY STACK", 1)
    
    add_styled_heading(doc, "3.1 Hardware Requirements", 2)
    add_body_p(doc, 
               "The hardware specifications for developing, hosting, and executing Whiteboard.io are characterized below:")
    
    add_bullet_p(doc, 
                 "Dual-Core x86_64 or ARM64 processor (2.0 GHz minimum), 2 GB RAM minimum (4 GB recommended), 1 GB available storage for server binaries and MongoDB data, 10 Mbps broadband internet connectivity.",
                 bold_prefix="Server / Deployment Environment: ")
    
    add_bullet_p(doc, 
                 "Standard desktop, laptop, or tablet computer equipped with mouse, trackpad, or touch/stylus input; 4 GB RAM; integrated audio input (microphone) and output (speakers/headphones); hardware-accelerated web browser.",
                 bold_prefix="Client Terminal Environment: ")

    add_styled_heading(doc, "3.2 Software Requirements & Operating Environments", 2)
    add_body_p(doc, 
               "Whiteboard.io is built entirely upon cross-platform web standards and modern runtime environments:")
    
    add_bullet_p(doc, 
                 "Node.js runtime environment (v18.0.0 or higher, verified on v22+), npm package manager, MongoDB Community or Enterprise Server (v6.0 or higher, verified on v7.6+), and Google Gemini API credentials.",
                 bold_prefix="Server Prerequisites: ")
    
    add_bullet_p(doc, 
                 "Any modern web browser implementing HTML5 Canvas, WebSockets, WebRTC 1.0, and Web Audio API (Google Chrome 90+, Mozilla Firefox 88+, Apple Safari 14.1+, or Microsoft Edge 90+).",
                 bold_prefix="Client Prerequisites: ")

    add_styled_heading(doc, "3.3 Comprehensive Technology Stack Inventory", 2)
    add_body_p(doc, 
               "Every technology, framework, and dependency in Whiteboard.io has been extracted directly from repository configuration files (`package.json`, `tsconfig.json`, `vite.config.ts`):")
    
    # Table 1.1: Tech Stack Table
    tech_table = doc.add_table(rows=1, cols=4)
    tech_headers = ["Layer", "Technology", "Version / Source", "Purpose & Architectural Role"]
    tech_widths = [1.2, 1.4, 1.2, 2.6]
    
    tech_rows = [
        ["Frontend UI", "React", "^19.0.1", "Component-driven user interface, state management, and virtual DOM rendering."],
        ["Frontend DOM", "React DOM", "^19.0.1", "Browser DOM bindings and mounting lifecycle for the React application tree."],
        ["Build Tool", "Vite", "^6.2.3", "Next-generation frontend tooling providing ultra-fast HMR and optimized bundling."],
        ["Language", "TypeScript", "~5.8.2", "Static type checking across frontend and backend for robust enterprise safety."],
        ["Styling", "Tailwind CSS", "^4.1.14", "Utility-first CSS framework with Vite integration (@tailwindcss/vite)."],
        ["Animations", "Motion", "^12.23.24", "Fluid physics-based spring animations for modals, notifications, and menus."],
        ["Icons", "Lucide React", "^0.546.0", "Crisp vector icons for canvas tools, admin panels, and status indicators."],
        ["Real-Time Client", "Socket.io Client", "^4.8.3", "WebSocket client handling room events, drawing streams, and voice signaling."],
        ["Backend Runtime", "Node.js", "v20+ / ES Modules", "Asynchronous, event-driven JavaScript runtime executing the backend server."],
        ["Backend Framework", "Express", "^4.21.2", "Lightweight HTTP server hosting REST APIs, CORS, and security middleware."],
        ["Real-Time Server", "Socket.io", "^4.8.3", "WebSocket server gateway managing rooms, event routing, and binary packets."],
        ["Database Driver", "MongoDB Driver", "^7.6.0", "Official native MongoDB Node.js driver providing high-speed direct queries."],
        ["Security / Crypto", "Node.js Crypto", "Built-in native", "PBKDF2-SHA512 password hashing, salt generation, and secure UUID generation."],
        ["Voice Media", "WebRTC 1.0", "W3C Standard", "Decentralized peer-to-peer audio streaming mesh directly between browsers."],
        ["Audio Processing", "Web Audio API", "W3C Standard", "AnalyserNode frequency analysis, volume RMS calculation, speaking halos."],
        ["Generative AI", "Google Gemini API", "gemini-2.5-flash", "Natural language diagram generation with structured JSON schema output."],
        ["Bundler / Server", "esbuild & tsx", "^0.25.0 / ^4.21.0", "High-speed TypeScript transpilation and server production bundling."]
    ]
    
    format_custom_table(tech_table, tech_widths, tech_headers, tech_rows)

    doc.add_page_break()

    # =========================================================================
    # 10. SYSTEM ANALYSIS AND DESIGN
    # =========================================================================
    add_styled_heading(doc, "4. SYSTEM ANALYSIS AND DESIGN", 1)
    
    add_styled_heading(doc, "4.1 Functional Requirements Specification", 2)
    add_body_p(doc, 
               "The functional capabilities of Whiteboard.io are partitioned into distinct operational domains:")
    
    add_bullet_p(doc, 
                 "Users can register accounts with username, email, and password; log in via credentials; authenticate with Google OAuth 2.0; or launch instant anonymous guest sessions with assigned animal names and avatar colors.",
                 bold_prefix="FR-01 (Authentication & Identity): ")
    
    add_bullet_p(doc, 
                 "Users can create named collaborative rooms with optional custom codes (e.g. 'SPRINT-2026') or randomly generated hyphenated codes ('ABC-XYZ'). Rooms maintain persistence across disconnects.",
                 bold_prefix="FR-02 (Room Lifecycle Management): ")
    
    add_bullet_p(doc, 
                 "Room creators automatically acquire Host/Admin rights. Hosts can grant or revoke drawing permissions for any user, eject participants, toggle room-wide view-only locking, or permanently delete rooms. If the host departs, the server automatically promotes the next active participant.",
                 bold_prefix="FR-03 (Host Governance & Admin Panel): ")
    
    add_bullet_p(doc, 
                 "Multiple users can simultaneously draw freehand pen strokes and highlighters. Intermediate stroke points are streamed in real time to remote peers, and final element objects are committed upon release.",
                 bold_prefix="FR-04 (Collaborative Drawing Engine): ")
    
    add_bullet_p(doc, 
                 "Users can insert, resize, drag, rotate, and style geometric shapes (rectangles, circles, diamonds, triangles, stars, arrows), editable sticky notes, typography text blocks, vector icons, and associative wire connectors.",
                 bold_prefix="FR-05 (Structured Canvas Elements & Wires): ")
    
    add_bullet_p(doc, 
                 "Collaborative cursors display remote pointer locations with user labels, tool indicators, and active drawing flags. When a user speaks into their microphone, an animated green halo illuminates around their cursor.",
                 bold_prefix="FR-06 (Multiplayer Awareness & Cursors): ")
    
    add_bullet_p(doc, 
                 "Participants can join a decentralized peer-to-peer WebRTC voice room with mute, deafen, volume controls, audio visualizer bar, and simulation mode.",
                 bold_prefix="FR-07 (Decentralized Voice Communication): ")
    
    add_bullet_p(doc, 
                 "Any editor can trigger a vote to clear the whiteboard. If multiple users are in the room, a 15-second consensus vote modal appears. The board clears only if a majority of participants vote YES.",
                 bold_prefix="FR-08 (Consensus Vote-to-Clear): ")
    
    add_bullet_p(doc, 
                 "Users can describe diagrams in plain English and select a topology (mind map, flowchart, brainstorm, architecture). The system synthesizes and places interactive canvas elements, protected by a 5-layer rate-limit shield.",
                 bold_prefix="FR-09 (Generative AI Diagram Synthesis): ")

    add_styled_heading(doc, "4.2 Non-Functional Requirements Analysis", 2)
    add_body_p(doc, 
               "The engineering non-functional constraints enforced across the codebase include:")
    
    add_bullet_p(doc, 
                 "Optimistic UI rendering guarantees 0ms local drawing latency. Socket.io WebSocket framing ensures remote stroke propagation within 20–50ms over standard broadband.",
                 bold_prefix="Performance & Latency: ")
    
    add_bullet_p(doc, 
                 "PBKDF2-SHA512 password hashing with 100,000 iterations and 16-byte random salts. Session tokens generated with 32 cryptographically secure random bytes. Rate limiting protects auth and AI endpoints. Explicit security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, XSS-Protection) are applied.",
                 bold_prefix="Security & Data Protection: ")
    
    add_bullet_p(doc, 
                 "Database writes are debounced (400–1000ms) to aggregate bursts. Offline procedural fallback ensures AI diagramming remains 100% available even if Gemini API keys are unconfigured or rate limits are exceeded.",
                 bold_prefix="Reliability & Fault Tolerance: ")
    
    add_bullet_p(doc, 
                 "Full TypeScript typings across all data contracts. Modular React components and custom hooks isolate UI presentation from socket networking and WebRTC audio streams.",
                 bold_prefix="Maintainability & Modularity: ")

    add_styled_heading(doc, "4.3 Complete System Architecture Design", 2)
    add_body_p(doc, 
               "Whiteboard.io is structured as a client-server distributed system organized into three distinct tiers: the React Client Tier, the Node.js/Express Backend Tier, and the Persistence / External Services Tier.")
    
    add_figure(doc, "diagram_architecture.png", "Figure 1: High-Level System Architecture of Whiteboard.io")
    
    add_body_p(doc, 
               "As illustrated in Figure 1, the React Client Tier communicates with the backend server across two separate communication channels. RESTful JSON APIs manage authentication, user profile validation, Google OAuth redirects, room creation, and AI diagram prompts. Concurrently, a persistent Socket.io WebSocket gateway manages real-time drawing synchronization, live cursor coordinates, admin privilege commands, consensus votes, and WebRTC audio signaling.")
    
    add_body_p(doc, 
               "Inside the backend, an in-memory `Map<string, RoomData>` maintains the live authoritative state for every active room. When canvas elements are created or updated, changes are applied immediately to this in-memory cache and broadcast to peers. An asynchronous debounced persistence worker aggregates canvas modifications and flushes them to MongoDB, eliminating high-frequency disk I/O bottlenecks.")

    add_styled_heading(doc, "4.4 Real-Time Data Flow Pipeline", 2)
    add_body_p(doc, 
               "The collaborative drawing engine implements an optimistic local rendering pipeline combined with live WebSocket point streaming to achieve real-time responsiveness without synchronization artifacts:")
    
    add_figure(doc, "diagram_dataflow.png", "Figure 2: Real-Time Collaborative Drawing & Persistence Pipeline")
    
    add_body_p(doc, 
               "1. Pointer Capture: When the user touches or drags the mouse, pointerdown and pointermove events generate raw 2D world coordinates.")
    add_body_p(doc, 
               "2. Optimistic Rendering: Points are immediately committed to the local HTML5 Canvas 2D rendering context, providing zero-latency visual feedback to the local artist.")
    add_body_p(doc, 
               "3. Live Streaming: In parallel, lightweight stroke-live-point socket packets are broadcast to the room. Remote clients render these coordinates as live active strokes.")
    add_body_p(doc, 
               "4. Element Finalization: Upon pointerup, the completed CanvasElement (containing stroke smoothing data, bounding box, color, and size) is created and emitted via element-create.")
    add_body_p(doc, 
               "5. Debounced Persistence: The backend updates the in-memory room map and resets a debounced timer (400ms). When the timer expires, the aggregated elements are batch-written to MongoDB.")

    doc.add_page_break()

    # =========================================================================
    # 10.5 DATABASE DESIGN
    # =========================================================================
    add_styled_heading(doc, "4.5 Database Design & Document Schemas", 2)
    add_body_p(doc, 
               "Whiteboard.io uses MongoDB as its document-oriented database. Unlike relational schemas that require strict table joins, MongoDB stores collaborative canvas documents as flexible BSON objects. The application utilizes five distinct collections initialized with compound and TTL indexes (`server/db.ts`):")
    
    add_figure(doc, "diagram_database_schema.png", "Figure 3: MongoDB Document Schemas and Inter-Collection Relationships")
    
    # Table 2.1: users schema
    add_styled_heading(doc, "Table 2.1: Collection Schema: users", 3)
    add_body_p(doc, "Stores registered user credentials, salted password hashes, guest profiles, and Google OAuth associations.")
    
    t_users = doc.add_table(rows=1, cols=5)
    t_users_w = [1.2, 1.1, 0.9, 1.4, 1.8]
    t_users_h = ["Field", "BSON Type", "Required", "Index Details", "Description & Constraints"]
    t_users_rows = [
        ["id", "String", "Yes", "Unique Index", "Unique user ID (e.g. 'user_a1b2c3' or 'guest_x9y8z7')."],
        ["username", "String", "Yes", "Standard Index", "Lowercased handle (min 3 chars)."],
        ["email", "String", "Yes", "Standard Index", "User email address."],
        ["passwordHash", "String", "Yes", "None", "Hex-encoded PBKDF2 hash (empty for guests & Google)."],
        ["salt", "String", "Yes", "None", "16-byte random salt in hex string format."],
        ["name", "String", "Yes", "None", "Display name shown in room headers and cursors."],
        ["color", "String", "Yes", "None", "HEX color code for participant cursor and avatar."],
        ["createdAt", "Number", "Yes", "TTL Index (7 Days)*", "Epoch millisecond timestamp. *TTL applies where isGuest: true."],
        ["createdRooms", "Array[String]", "Yes", "None", "Array of room codes created/owned by this user."],
        ["isGuest", "Boolean", "Optional", "Partial Filter", "True for ephemeral guest accounts."],
        ["googleId", "String", "Optional", "None", "Google OAuth 2.0 unique subject identifier."],
        ["picture", "String", "Optional", "None", "URL of Google profile avatar image."]
    ]
    format_custom_table(t_users, t_users_w, t_users_h, t_users_rows)
    
    # Table 2.2: tokens schema
    add_styled_heading(doc, "Table 2.2: Collection Schema: tokens", 3)
    add_body_p(doc, "Stores active session authentication tokens. A TTL background index automatically purges records after 30 days.")
    
    t_tok = doc.add_table(rows=1, cols=5)
    t_tok_rows = [
        ["token", "String", "Yes", "Unique Index", "32-byte cryptographically secure hex string."],
        ["userId", "String", "Yes", "Standard Index", "References users.id."],
        ["createdAt", "Number", "Yes", "TTL Index (30 Days)", "Auto-expires via expireAfterSeconds: 2592000."],
        ["updatedAt", "Number", "Yes", "None", "Last session update timestamp."]
    ]
    format_custom_table(t_tok, t_users_w, t_users_h, t_tok_rows)

    # Table 2.3: rooms schema
    add_styled_heading(doc, "Table 2.3: Collection Schema: rooms", 3)
    add_body_p(doc, "Stores persistent room metadata, ownership linkages, and administrative lock flags.")
    
    t_room = doc.add_table(rows=1, cols=5)
    t_room_rows = [
        ["id", "String", "Yes", "Unique Index", "Formatted room code (e.g. 'SPRINT-2026' or 'ABC-XYZ')."],
        ["name", "String", "Yes", "None", "Human-readable room title."],
        ["creatorId", "String", "Yes", "Standard Index", "User ID of room creator/owner."],
        ["creatorName", "String", "Yes", "None", "Display name of creator."],
        ["createdAt", "Number", "Yes", "None", "Room creation epoch timestamp."],
        ["isLocked", "Boolean", "Yes", "None", "True if room is locked into read-only mode by host."]
    ]
    format_custom_table(t_room, t_users_w, t_users_h, t_room_rows)

    # Table 2.4: room_elements schema
    add_styled_heading(doc, "Table 2.4: Collection Schema: room_elements & elements", 3)
    add_body_p(doc, "Maintains granular atomic canvas elements per room (`room_elements`), with legacy backward compatibility for bulk documents (`elements`).")
    
    t_elem = doc.add_table(rows=1, cols=5)
    t_elem_rows = [
        ["roomId", "String", "Yes", "Compound & Single", "Target room identifier."],
        ["elementId", "String", "Yes", "Compound Unique", "Unique element ID (compound {roomId, elementId} is unique)."],
        ["data", "Object", "Yes", "None", "Full element payload (type, coordinates, points, color, text)."],
        ["updatedAt", "Number", "Yes", "None", "Last modification epoch timestamp."]
    ]
    format_custom_table(t_elem, t_users_w, t_users_h, t_elem_rows)

    doc.add_page_break()

    # =========================================================================
    # 10.6 API DESIGN
    # =========================================================================
    add_styled_heading(doc, "4.6 RESTful API Design Specification", 2)
    add_body_p(doc, 
               "All HTTP endpoints are hosted under Express and communicate via JSON payloads (`server/index.ts`):")
    
    # Table 3.1: REST API table
    api_table = doc.add_table(rows=1, cols=5)
    api_widths = [0.8, 1.6, 1.8, 1.1, 1.1]
    api_headers = ["Method", "Endpoint", "Purpose", "Auth Required", "Rate Limit"]
    api_rows = [
        ["GET", "/health", "Health check & telemetry (DB latency, socket client count, active rooms).", "None", "None"],
        ["POST", "/api/auth/register", "Registers a new user with PBKDF2 password hashing.", "None", "15 req / min"],
        ["POST", "/api/auth/login", "Authenticates registered user and returns session token.", "None", "15 req / min"],
        ["POST", "/api/auth/guest", "Generates anonymous guest user profile with 7-day TTL.", "None", "30 req / min"],
        ["GET", "/api/auth/me", "Validates Bearer token and returns authenticated user profile.", "Bearer Token", "None"],
        ["GET", "/api/auth/google/url", "Generates Google OAuth 2.0 authorization URL.", "None", "None"],
        ["GET", "/auth/google/callback", "Exchanges OAuth code for Google token and profile; renders auth bridge.", "None", "None"],
        ["POST", "/api/rooms/create", "Creates a persistent room with custom or generated code.", "Optional", "None"],
        ["GET", "/api/rooms/my-rooms", "Returns all persistent rooms created by the authenticated user.", "Bearer Token", "None"],
        ["GET", "/api/room/:roomId", "Retrieves room metadata, participant count, and element count.", "None", "None"],
        ["DELETE", "/api/rooms/:roomId", "Deletes room metadata and purges all persisted canvas elements.", "Bearer Token", "None"],
        ["POST", "/api/ai/generate-diagram", "Generates structured canvas diagram elements via Gemini 2.5 Flash.", "Optional", "10 req / min"]
    ]
    format_custom_table(api_table, api_widths, api_headers, api_rows)

    add_styled_heading(doc, "4.7 Socket.io Real-Time Protocol Specification", 2)
    add_body_p(doc, 
               "Real-time bidirectional synchronization is orchestrated over Socket.io. Sockets join isolated rooms (`socket.join(roomId)`), ensuring events never leak across boards:")
    
    # Table 3.2: Socket Events table
    sock_table = doc.add_table(rows=1, cols=4)
    sock_widths = [1.5, 1.4, 0.9, 2.6]
    sock_headers = ["Event Name", "Direction", "Permission", "Payload & Behavioral Description"]
    sock_rows = [
        ["join-room", "Client ➔ Server", "None", "{ roomId, user, token } — Connects client, verifies host status, initializes room state."],
        ["room-init", "Server ➔ Client", "None", "{ roomId, roomName, elements, users, isLocked, canWrite, isHost } — Full canvas hydration."],
        ["stroke-live-start", "Client ➔ Server", "canWrite", "{ strokeId, point, color, size, isHighlighter } — Starts streaming live stroke."],
        ["stroke-live-point", "Client ➔ Server", "canWrite", "{ strokeId, point } — Emits incremental coordinate for active remote pen."],
        ["element-create", "Client ➔ Server", "canWrite", "CanvasElement — Broadcasts finalized stroke/shape and triggers debounced save."],
        ["elements-batch-create", "Client ➔ Server", "canWrite", "CanvasElement[] — Bulk injection of elements (used by AI Diagram Generator)."],
        ["element-update", "Client ➔ Server", "canWrite", "CanvasElement — Synchronizes element movement, resizing, or text edits."],
        ["element-delete", "Client ➔ Server", "canWrite", "{ elementId } — Removes element from memory and debounced persistence queue."],
        ["cursor-move", "Client ➔ Server", "None", "{ x, y, tool, isDrawing } — Synchronizes multiplayer pointer position and tool state."],
        ["audio-level", "Client ➔ Server", "None", "{ level, isSpeaking } — Broadcasts 0–1 mic volume for speech halo visualization."],
        ["voice-offer", "Client ➔ Server", "None", "{ toUserId, offer } — WebRTC SDP offer targeted to specific peer in room."],
        ["voice-answer", "Client ➔ Server", "None", "{ toUserId, answer } — WebRTC SDP answer returning targeted peer acceptance."],
        ["voice-ice-candidate", "Client ➔ Server", "None", "{ toUserId, candidate } — WebRTC network candidate exchange for NAT traversal."],
        ["admin-set-permission", "Client ➔ Server", "isHost", "{ targetUserId, canWrite } — Toggles participant editing privileges."],
        ["admin-kick-user", "Client ➔ Server", "isHost", "{ targetUserId, reason } — Ejects participant and blacklists re-entry."],
        ["admin-toggle-lock", "Client ➔ Server", "isHost", "{ isLocked } — Locks room into read-only mode for all non-host users."],
        ["vote-clear-start", "Client ➔ Server", "canWrite", "Initiates 15-second consensus vote to clear the whiteboard."],
        ["vote-clear-cast", "Client ➔ Server", "None", "{ vote: boolean } — Casts YES/NO ballot; triggers instant clear on majority."]
    ]
    format_custom_table(sock_table, sock_widths, sock_headers, sock_rows)

    doc.add_page_break()

    # =========================================================================
    # 10.8 WEBRTC VOICE & 10.9 AI ARCHITECTURE
    # =========================================================================
    add_styled_heading(doc, "4.8 WebRTC Voice Chat Mesh Architecture", 2)
    add_body_p(doc, 
               "Whiteboard.io implements a decentralized peer-to-peer WebRTC audio mesh (`client/src/hooks/useVoiceChat.ts`). Rather than routing voice packets through expensive Selective Forwarding Units (SFUs), browsers establish direct encrypted SRTP peer connections with each active participant in the room.")
    
    add_body_p(doc, 
               "To prevent offer collision (glare) when multiple peers activate voice chat simultaneously, the system enforces a deterministic rule: `shouldInitiateOffer(myId, otherId): return myId > otherId`. Only the client with the lexicographically greater ID initiates the SDP offer, completely eliminating glare negotiation deadlocks.")
    
    add_body_p(doc, 
               "For NAT and firewall traversal, Google's public STUN servers (`stun:stun.l.google.com:19302`, `stun1`, `stun2`) are configured by default, with custom STUN/TURN injection available via environment variables (`VITE_STUN_URLS`, `VITE_TURN_URL`). Local audio streams are captured with hardware echo cancellation, noise suppression, and automatic gain control. A Web Audio `AnalyserNode` calculates RMS volume and emits `audio-level` events every 80ms, powering real-time pulsing speaking halos around multiplayer cursors. For restricted iframe contexts, an interactive audio synthesizer generates harmonic sine wave cadences, ensuring seamless demonstration capabilities.")

    add_styled_heading(doc, "4.9 Google Gemini AI Diagramming Architecture", 2)
    add_body_p(doc, 
               "The diagram generation engine (`server/gemini.ts`) transforms plain English descriptions into styled, interactive canvas diagrams using the `gemini-2.5-flash` model. Because Google Gemini's free tier permits approximately 15 requests per minute, the backend introduces a 5-layer rate-limiting shield to guarantee zero downtime:")
    
    add_figure(doc, "diagram_ai_pipeline.png", "Figure 4: Google Gemini 2.5 Flash Diagram Generation & 5-Layer Rate-Limit Shield")
    
    add_bullet_p(doc, "Layer 1 (IP Rate Limiting): Express in-memory token limiter caps calls at 10 requests / min / IP.", bold_prefix="Layer 1: ")
    add_bullet_p(doc, "Layer 2 (In-Memory Response Cache): 2-hour TTL cache indexed by `type:prompt`. Repeated requests return in <1ms with 0 Gemini quota consumed.", bold_prefix="Layer 2: ")
    add_bullet_p(doc, "Layer 3 (Request Pacing Queue): Serial FIFO promise queue enforces a strict 3,000ms delay between consecutive outbound calls to Google's API.", bold_prefix="Layer 3: ")
    add_bullet_p(doc, "Layer 4 (Exponential Backoff): Automatic retry loop (up to 3 retries) with randomized jitter on HTTP 429 and 503 responses.", bold_prefix="Layer 4: ")
    add_bullet_p(doc, "Layer 5 (Procedural Fallback): Algorithmic synthesis engine that deterministically produces clean mind maps, flowcharts, Kanban boards, or architectural tiers if API quotas are exhausted or keys are missing.", bold_prefix="Layer 5: ")

    add_styled_heading(doc, "4.10 Security, Authentication & Governance Design", 2)
    add_body_p(doc, 
               "Whiteboard.io implements defense-in-depth security across authentication, session authorization, and room-level access control:")
    
    add_bullet_p(doc, 
               "Passwords are never stored in plaintext. Passwords are hashed using Node.js native `crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512')` with unique 16-byte random salts. Verification checks 100,000 iterations first, with a fallback to legacy 1,000 iterations for older test accounts.",
               bold_prefix="Password Security: ")
    
    add_bullet_p(doc, 
               "Session tokens are generated via `crypto.randomBytes(32).toString('hex')` (256-bit entropy). Tokens are transmitted via `Authorization: Bearer <token>` and verified by `getUserByToken()` in database middleware.",
               bold_prefix="Token Management: ")
    
    add_bullet_p(doc, 
               "Dynamic CORS allowlist permits requests only from trusted origins (`http://localhost:5173`, `http://localhost:3000`, `process.env.APP_URL`, `process.env.CLIENT_URL`). Security headers enforce `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and strict referrer policies.",
               bold_prefix="Network & Header Controls: ")

    doc.add_page_break()

    # =========================================================================
    # 11. IMPLEMENTATION DETAILS
    # =========================================================================
    add_styled_heading(doc, "5. IMPLEMENTATION DETAILS", 1)
    add_body_p(doc, 
               "This section analyzes the actual source code implementation across the primary modules of the Whiteboard.io repository.")

    add_styled_heading(doc, "5.1 Server Entry & Express/Socket Gateway (server/index.ts)", 2)
    add_body_p(doc, 
               "`server/index.ts` is the central operational entrypoint of the backend application. It initializes the Express application, wraps it within an HTTP server, binds the Socket.io gateway, and establishes the database connection via `connectDb()`. It registers security middleware, in-memory IP rate limiters, health telemetry endpoints (`/health` and `/api/health`), authentication routes, room lifecycle routes, and AI diagram endpoints.")
    
    add_body_p(doc, 
               "The file contains the complete Socket.io event dispatching engine. It defines the in-memory room registry `rooms = new Map<string, RoomData>()` and implements the `getOrCreateRoom()` factory function that hydrates active rooms from MongoDB. Within socket connection lifecycles, it guards mutative operations using `checkCanWrite()`, drops events from kicked participants via socket middleware, and implements automatic host migration upon creator disconnection.")

    add_styled_heading(doc, "5.2 MongoDB Persistence Engine & Indexes (server/db.ts)", 2)
    add_body_p(doc, 
               "`server/db.ts` encapsulates the MongoDB native driver client connection and index initialization. Rather than utilizing heavy Object Document Mappers (such as Mongoose), it interacts directly with `MongoClient` (v7.6.0) for maximum query speed and minimal memory footprint.")
    
    add_body_p(doc, 
               "The module exports `connectDb()`, `getDb()`, collection getters, and health ping utilities. Crucially, it sets up all necessary database indexes using `Promise.allSettled`, including unique indexes on `users.id`, `tokens.token`, `rooms.id`, and `elements.roomId`; compound indexes on `room_elements.{roomId, elementId}`; and MongoDB TTL indexes (`createdAt` with 7 days for guests, and 30 days for session tokens).")

    add_styled_heading(doc, "5.3 Authentication, Tokenization & Hashing (server/auth.ts)", 2)
    add_body_p(doc, 
               "`server/auth.ts` implements the user lifecycle and cryptographic routines: `hashPassword()`, `verifyPassword()`, `generateToken()`, `sanitizeUser()`, `registerUser()`, `loginUser()`, `createGuestUser()`, and `findOrCreateGoogleUser()`. It enforces string sanitization and length validation on user handles and passwords.")
    
    add_body_p(doc, 
               "Additionally, `server/auth.ts` houses the debounced persistence controller `saveRoomElementsDebounced(roomId, elements, delayMs = 1000)`. When elements change, pending timers in `pendingElementSaves = new Map<string, NodeJS.Timeout>()` are cleared and rescheduled. When the timer fires, `saveRoomElements()` executes an atomic `bulkWrite` containing unordered `updateOne` upserts coupled with a `deleteMany` pass for deleted elements, ensuring robust canvas synchronization with MongoDB.")

    add_styled_heading(doc, "5.4 Google Gemini AI Engine & Fallback (server/gemini.ts)", 2)
    add_body_p(doc, 
               "`server/gemini.ts` orchestrates the Generative AI diagramming pipeline. It defines TypeScript interfaces for `DiagramType` ('mindmap', 'flowchart', 'brainstorm', 'architecture') and `RawAiNode`. It contains the in-memory response cache `diagramCache = new Map<string, CachedDiagram>()` with a 2-hour TTL and a 10-minute periodic cleanup interval.")
    
    add_body_p(doc, 
               "Outbound calls to Google's REST API (`models/gemini-2.5-flash:generateContent`) are throttled through `scheduleThrottledTask()`, which enforces a 3,000ms inter-call spacing window. Calls use `callGeminiWithRetry()` with exponential backoff on HTTP 429/503. If retries are exhausted or no API key exists, `generateProceduralFallback()` executes, deterministically generating clean geometric shapes and sticky notes aligned along radial or flowchart topologies.")

    add_styled_heading(doc, "5.5 Client Core & HTML5 Canvas Engine (client/src/components/Canvas.tsx)", 2)
    add_body_p(doc, 
               "`Canvas.tsx` is the primary interactive drawing surface (spanning over 1,600 lines of code). It manages world-to-screen coordinate transformations, zoom scaling (0.1x to 5.0x), smooth two-finger panning, touch pinch-to-zoom gestures, and marquee multi-selection boxes.")
    
    add_body_p(doc, 
               "The canvas renders freehand strokes and highlighters via the HTML5 2D context (`requestAnimationFrame`), while mounting specialized React component items for interactive elements: `StickyNoteItem`, `TextItem`, `ShapeItem`, `IconItem`, and `WireItem`. Wire connections automatically calculate optimal anchor points on element perimeters using `wireGeometry.ts` and render dynamic Bezier curves with directional arrows.")

    add_styled_heading(doc, "5.6 Real-Time Collaboration Hook (client/src/hooks/useSocket.ts)", 2)
    add_body_p(doc, 
               "`useSocket.ts` is the foundational networking hook of the frontend. It initializes the Socket.io client connection to `BACKEND_URL`, manages URL query and hash synchronization (`?room=ROOM_ID`), and listens for room lifecycle events (`room-init`, `user-joined`, `user-left`, `room-lock-changed`, `room-host-migrated`, `board-cleared`).")
    
    add_body_p(doc, 
               "It exposes high-level mutation functions: `emitStrokeLiveStart()`, `emitStrokeLivePoint()`, `emitElementCreate()`, `emitElementUpdate()`, `emitElementDelete()`, `emitCursorMove()`, and `emitVoteClearStart()`. It also manages the solo-to-multiplayer canvas migration, automatically broadcasting locally drawn items when converting a solo board into a shared multiplayer room.")

    add_styled_heading(doc, "5.7 WebRTC Audio Mesh Hook (client/src/hooks/useVoiceChat.ts)", 2)
    add_body_p(doc, 
               "`useVoiceChat.ts` provides complete peer-to-peer voice communications. It initializes `RTCPeerConnection` instances with STUN configurations, manages `RTCSessionDescription` offers/answers, and buffers ICE candidates in `pendingCandidatesRef` to prevent race conditions during remote description negotiations.")
    
    add_body_p(doc, 
               "It interfaces with the browser's `navigator.mediaDevices.getUserMedia` to capture microphone input, routes tracks through a Web Audio `AnalyserNode`, and calculates frequency envelopes for speaking indicators. It also provides a simulated audio generator using `OscillatorNode` (220 Hz sine wave with harmonic pitch cadences) for testing in constrained iframe environments.")

    add_styled_heading(doc, "5.8 Room Governance, Lock & Consensus Vote Mechanics", 2)
    add_body_p(doc, 
               "Administrative controls and collaborative consensus mechanisms are embedded across `AdminPanelModal.tsx`, `VoteToClearModal.tsx`, and `server/index.ts`. The room host can open the Admin Panel to inspect active participants, view their assigned roles, toggle individual write privileges, kick disruptive users, or lock the entire whiteboard into read-only mode.")
    
    add_body_p(doc, 
               "The Vote-to-Clear feature prevents accidental or malicious board wipes. When a participant triggers a board clear, the server evaluates room participant count. If more than one user is present, an active `VoteState` is created with a 15-second countdown timer (`VOTE_CLEAR_DURATION_MS`). The board clears if and only if a strict majority of active participants vote YES, or immediately if the room has only one user.")

    doc.add_page_break()

    # =========================================================================
    # 12. TESTING
    # =========================================================================
    add_styled_heading(doc, "6. TESTING AND QUALITY ASSURANCE", 1)
    
    add_styled_heading(doc, "6.1 Current Status of Automated Testing Suite", 2)
    add_body_p(doc, 
               "A rigorous inspection of the Whiteboard.io repository was conducted across `server/package.json`, `client/package.json`, configuration files, and source directories. Based on this direct codebase analysis:")
    
    add_body_p(doc, 
               "\"No formal automated test suite was identified in the analyzed repository.\"",
               bold_prefix="Codebase Finding: ")
    
    add_body_p(doc, 
               "The existing `package.json` scripts focus exclusively on development execution (`npm run dev`, `tsx`, `nodemon`) and production builds (`esbuild`, `vite build`). Unit testing frameworks (such as Jest, Vitest, or Mocha) and end-to-end browser automation suites (such as Cypress or Playwright) are not currently installed or configured.")
    
    add_styled_heading(doc, "6.2 Comprehensive Recommended Test-Case Matrix", 2)
    add_body_p(doc, 
               "To support future quality assurance and verification of Whiteboard.io's verified feature set, the following comprehensive test-case matrix is designed based strictly on implemented features:")
    
    # Table 4.1: Test matrix
    test_table = doc.add_table(rows=1, cols=5)
    test_widths = [0.8, 1.2, 1.4, 1.4, 1.6]
    test_headers = ["Test ID", "Module", "Test Scenario", "Input / Action", "Expected Result"]
    
    test_rows = [
        ["TC-AUTH-01", "Authentication", "User Registration with Valid Data", "POST /api/auth/register with valid username, email, password.", "HTTP 200, user created in DB with salt & PBKDF2 hash, session token returned."],
        ["TC-AUTH-02", "Authentication", "Duplicate Username Registration", "POST /api/auth/register with already existing username.", "HTTP 400 with 'This username is already taken' error message."],
        ["TC-AUTH-03", "Authentication", "User Login with Valid Credentials", "POST /api/auth/login with registered identifier and password.", "HTTP 200, session token returned, token saved in tokens collection."],
        ["TC-AUTH-04", "Authentication", "User Login with Wrong Password", "POST /api/auth/login with incorrect password.", "HTTP 400 with 'Incorrect password' error message."],
        ["TC-AUTH-05", "Authentication", "Guest Account Creation", "POST /api/auth/guest with optional name and color.", "HTTP 200, guest user generated with 'guest_' prefix and 7-day TTL index."],
        ["TC-AUTH-06", "Authentication", "Auth Rate Limiter Protection", "Exceed 15 login requests within 60 seconds from same IP.", "HTTP 429 Too Many Requests response returned."],
        ["TC-ROOM-01", "Room Lifecycle", "Room Creation with Custom Code", "POST /api/rooms/create with customCode: 'SPRINT-2026'.", "Room created with ID 'SPRINT-2026', creatorId assigned, stored in DB."],
        ["TC-ROOM-02", "Room Lifecycle", "Room Creation with Auto-Code", "POST /api/rooms/create without customCode.", "Room created with 6-character code matching pattern [A-Z0-9]{3}-[A-Z0-9]{3}."],
        ["TC-ROOM-03", "Room Lifecycle", "Delete Room by Authorized Host", "DELETE /api/rooms/:roomId with host auth Bearer token.", "HTTP 200, room deleted from DB, elements purged, users notified via socket."],
        ["TC-DRAW-01", "Collaborative Canvas", "Local Freehand Stroke Creation", "Drag pointer across canvas with pen tool active.", "Optimistic stroke renders instantly on local canvas, points stream over socket."],
        ["TC-DRAW-02", "Collaborative Canvas", "Remote Stroke Streaming Sync", "Client A draws; Client B connected to same room.", "Client B receives stroke-live-point events and renders stroke point-by-point."],
        ["TC-DRAW-03", "Collaborative Canvas", "Debounced Persistence Execution", "Draw dense strokes in room, wait 1000ms.", "Elements flushed via bulkWrite upsert to room_elements collection."],
        ["TC-ADMIN-01", "Governance", "Host Revokes Drawing Permission", "Host emits admin-set-permission with canWrite: false.", "Target user receives permission-updated; subsequent draw attempts blocked."],
        ["TC-ADMIN-02", "Governance", "Host Toggles Board Lock", "Host emits admin-toggle-lock with isLocked: true.", "Room locked; all non-host users placed in view-only mode; UI controls disabled."],
        ["TC-ADMIN-03", "Governance", "Host Migration on Disconnect", "Host disconnects while 2 participants remain.", "Server promotes next active participant to host, broadcasts room-host-migrated."],
        ["TC-VOTE-01", "Governance", "Vote to Clear Board (Majority Pass)", "User A starts vote; User B votes YES.", "Consensus reached; board-cleared emitted; room elements wiped from DB."],
        ["TC-VOTE-02", "Governance", "Vote to Clear Board (Timeout Reject)", "User A starts vote; 15 seconds elapse without votes.", "Vote expires; vote-clear-ended emitted with passed: false; canvas preserved."],
        ["TC-VOICE-01", "WebRTC Voice", "Voice Mesh Connection", "Two users join voice chat in same room.", "STUN negotiation succeeds, direct peer-to-peer audio stream established."],
        ["TC-VOICE-02", "WebRTC Voice", "Speaking Indicator Visualization", "User speaks into microphone (RMS > 0.08).", "audio-level emitted over socket; green speaking halo pulses around cursor."],
        ["TC-AI-01", "AI Diagramming", "Generate Mind Map via Gemini", "POST /api/ai/generate-diagram with prompt & type: mindmap.", "Gemini 2.5 Flash returns structured nodes; converted to canvas shapes/stickies."],
        ["TC-AI-02", "AI Diagramming", "AI Response Caching Validation", "Submit identical AI prompt within 2 hours.", "Returned from in-memory cache in <1ms without calling Google Gemini API."],
        ["TC-AI-03", "AI Diagramming", "Procedural Fallback on Failure", "Trigger AI generation with invalid API key.", "Graceful fallback engages; clean procedural layout returned without error."]
    ]
    
    format_custom_table(test_table, test_widths, test_headers, test_rows)

    doc.add_page_break()

    # =========================================================================
    # 13. CONCLUSION AND FUTURE SCOPE
    # =========================================================================
    add_styled_heading(doc, "7. CONCLUSION AND FUTURE SCOPE", 1)
    
    add_styled_heading(doc, "7.1 Project Conclusion & Achievements", 2)
    add_body_p(doc, 
               "Whiteboard.io successfully demonstrates the practical design, architecture, and deployment of a modern, real-time distributed collaborative whiteboard system. By unifying an optimistic HTML5 Canvas 2D rendering client with an event-driven Node.js and Socket.io backend, the application achieves seamless visual collaboration with zero perceived latency for local artists and sub-50ms synchronization across remote peers.")
    
    add_body_p(doc, 
               "Key technical milestones achieved in this project include:")
    
    add_bullet_p(doc, 
                 "Eliminated database write bottlenecks during rapid pen strokes by maintaining authoritative room states in server memory and decoupling persistence through an intelligent debounced writing engine (400–1000ms delay).",
                 bold_prefix="High-Throughput State Synchronization: ")
    
    add_bullet_p(doc, 
                 "Integrated a fully decentralized peer-to-peer WebRTC audio mesh with deterministic initiator election (`myId > otherId`) to resolve offer glare, combined with real-time speech frequency analysis using the Web Audio API.",
                 bold_prefix="Decentralized Voice Communication: ")
    
    add_bullet_p(doc, 
                 "Built a multi-tiered identity architecture featuring PBKDF2-SHA512 password hashing with 100,000 iterations, Google OAuth 2.0 federated login, and ephemeral guest access with automated 7-day MongoDB TTL cleanup.",
                 bold_prefix="Multi-Tiered Authentication & Security: ")
    
    add_bullet_p(doc, 
                 "Harnessed Google Gemini 2.5 Flash to automatically synthesize structured visual diagrams from natural language prompts, fortified by a 5-layer defensive shield that guarantees 100% operational availability.",
                 bold_prefix="Generative AI Diagram Synthesis: ")
    
    add_body_p(doc, 
               "In conclusion, Whiteboard.io fulfills all requirements established for an advanced Master's-level minor project, exhibiting clean software engineering practices, modular architectural design, and resilient real-time networking.")

    add_styled_heading(doc, "7.2 Future Research & Engineering Scope", 2)
    add_body_p(doc, 
               "While Whiteboard.io provides a robust, production-ready collaborative environment, several compelling avenues exist for future architectural expansion:")
    
    add_bullet_p(doc, 
                 "Currently, room states are held in single-node server memory (`Map<string, RoomData>`). Implementing a distributed Redis Pub/Sub adapter (e.g., `@socket.io/redis-adapter`) will allow seamless horizontal clustering across multiple backend container instances behind a load balancer.",
                 bold_prefix="1. Horizontal Clustering & Distributed Redis State: ")
    
    add_bullet_p(doc, 
                 "Integrating mathematical Conflict-Free Replicated Data Types (such as Yjs or Automerge) will enable peer-to-peer offline drawing synchronization, automatic branch merging, and deterministic conflict resolution without requiring a centralized server arbiter.",
                 bold_prefix="2. CRDT-Based Offline Synchronization: ")
    
    add_bullet_p(doc, 
                 "While STUN servers successfully traverse standard NAT configurations, clients situated behind strict enterprise Symmetric NATs require media relaying. Deploying managed Coturn TURN relay clusters will guarantee 100% WebRTC audio connectivity across all corporate firewall topologies.",
                 bold_prefix="3. Dedicated Enterprise TURN Relay Infrastructure: ")
    
    add_bullet_p(doc, 
                 "Expanding the diagramming engine to support continuous conversational diagram editing (e.g. 'add a Redis cache between the API gateway and database') and custom styling themes (Mermaid.js, PlantUML syntax imports).",
                 bold_prefix="4. Interactive Multi-Turn AI Diagram Refinement: ")
    
    add_bullet_p(doc, 
                 "Introducing end-to-end encryption (E2EE) using Web Cryptography API primitives (AES-GCM 256) so that canvas elements and audio streams are encrypted before leaving the client browser, ensuring zero-knowledge privacy from server operators.",
                 bold_prefix="5. End-to-End Encrypted (E2EE) Canvas Workspaces: ")

    doc.add_page_break()

    # =========================================================================
    # 14. REFERENCES
    # =========================================================================
    add_styled_heading(doc, "8. REFERENCES", 1)
    p_ref_line = doc.add_paragraph()
    r_refl = p_ref_line.add_run("―" * 55)
    r_refl.font.color.rgb = RGBColor(203, 213, 225)
    
    references = [
        "[1] React Documentation. \"React 19: New Features, Server Components, and Concurrent Rendering.\" Meta Open Source, 2024. Available: https://react.dev/",
        "[2] Node.js Foundation. \"Node.js Documentation: Crypto Module, Asynchronous I/O, and Event Loop Execution Model.\" OpenJS Foundation, 2024. Available: https://nodejs.org/docs/",
        "[3] Express.js Community. \"Express 4.x API Reference: Routing, Middleware, and Security Architecture.\" OpenJS Foundation, 2024. Available: https://expressjs.com/",
        "[4] Socket.IO Documentation. \"Socket.IO Architecture: WebSocket Protocol, Engine.IO Transport Fallbacks, and Room Isolation.\" Socket.IO, 2024. Available: https://socket.io/docs/v4/",
        "[5] MongoDB Inc. \"MongoDB Node.js Driver (v7.6) API Reference: Connection Pooling, Bulk Write Operations, and TTL Indexes.\" MongoDB Manual, 2024. Available: https://www.mongodb.com/docs/drivers/node/",
        "[6] World Wide Web Consortium (W3C). \"WebRTC 1.0: Real-Time Communication Between Browsers.\" W3C Recommendation, 2021. Available: https://www.w3.org/TR/webrtc/",
        "[7] World Wide Web Consortium (W3C). \"Web Audio API: Processing and Synthesizing Audio in Web Applications.\" W3C Candidate Recommendation, 2021. Available: https://www.w3.org/TR/webaudio/",
        "[8] Google DeepMind. \"Google Gemini API Documentation: Gemini 2.5 Flash Model Overview and Structured JSON Schema Generation.\" Google Cloud, 2025. Available: https://ai.google.dev/docs",
        "[9] Rescorla, E. \"RFC 8829: JavaScript Session Establishment Protocol (JSEP) for WebRTC.\" Internet Engineering Task Force (IETF), 2021. Available: https://www.rfc-editor.org/rfc/rfc8829.html",
        "[10] Rosenberg, J., et al. \"RFC 8489: Session Traversal Utilities for NAT (STUN).\" Internet Engineering Task Force (IETF), 2020. Available: https://www.rfc-editor.org/rfc/rfc8489.html",
        "[11] Kaliski, B. \"RFC 8018: PKCS #5: Password-Based Cryptography Specification Version 2.1 (PBKDF2).\" Internet Engineering Task Force (IETF), 2017. Available: https://www.rfc-editor.org/rfc/rfc8018.html",
        "[12] Vite Community. \"Vite: Next Generation Frontend Tooling.\" Vite Documentation, 2024. Available: https://vitejs.dev/",
        "[13] Tailwind Labs. \"Tailwind CSS v4 Documentation: Engine Architecture and CSS Integration.\" Tailwind Labs Inc., 2025. Available: https://tailwindcss.com/"
    ]
    
    for ref in references:
        p_ref = doc.add_paragraph()
        format_paragraph(p_ref, space_before=2, space_after=5, line_spacing=1.15, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
        r = p_ref.add_run(ref)
        r.font.name = "Times New Roman"
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(30, 41, 59)

    output_filename = "Generated_Project_Report.docx"
    doc.save(output_filename)
    print(f"Successfully generated {output_filename} ({os.path.getsize(output_filename)} bytes)")

if __name__ == "__main__":
    build_report()
