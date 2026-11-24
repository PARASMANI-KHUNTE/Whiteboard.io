"""
Whiteboard.io - Technical Software Engineering Presentation Deck Generator
Generates a comprehensive 16-slide PowerPoint presentation (.pptx) focused entirely
on software engineering, technical architecture, algorithms, and project implementation.
"""

import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor

TOOLING_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(TOOLING_DIR))
OUTPUT_PPTX = os.path.join(TOOLING_DIR, "Whiteboard_io_Presentation.pptx")

# ==============================================================================
# COLOR PALETTE SPECIFICATION
# ==============================================================================
# Dark Mode Palette (Title, Highlights, Closing)
BG_DARK = RGBColor(11, 19, 43)          # #0B132B Deep Slate Navy
CARD_DARK = RGBColor(22, 34, 64)        # #162240 Dark Container
BORDER_DARK = RGBColor(40, 58, 102)     # #283A66 Subtle Border
TEXT_DARK_TITLE = RGBColor(255, 255, 255) # Pure White
TEXT_DARK_BODY = RGBColor(226, 232, 240)  # #E2E8F0 Soft White
TEXT_DARK_MUTED = RGBColor(148, 163, 184) # #94A3B8 Slate Gray

# Light Mode Palette (Technical Content, Architecture, Workflows)
BG_LIGHT = RGBColor(248, 250, 252)        # #F8FAFC Ultra-clean Gray
CARD_LIGHT = RGBColor(255, 255, 255)      # Pure White Card
BORDER_LIGHT = RGBColor(226, 232, 240)    # #E2E8F0 Card Outline
TEXT_LIGHT_TITLE = RGBColor(15, 23, 42)   # #0F172A Deep Navy
TEXT_LIGHT_SUBTITLE = RGBColor(71, 85, 105) # #475569 Slate Subtitle
TEXT_LIGHT_BODY = RGBColor(51, 65, 85)    # #334155 Body Slate
TEXT_LIGHT_MUTED = RGBColor(100, 116, 139) # #64748B Secondary Text

# Brand & Accent Tokens
ACCENT_PRIMARY = RGBColor(37, 99, 235)    # #2563EB Vibrant Blue
ACCENT_CYAN = RGBColor(6, 182, 212)       # #06B6D4 Electric Cyan
ACCENT_PURPLE = RGBColor(124, 58, 237)    # #7C3AED AI Purple
ACCENT_GREEN = RGBColor(16, 185, 129)     # #10B981 Success / Live Green
ACCENT_AMBER = RGBColor(245, 158, 11)     # #F59E0B Warning / Highlighting
ACCENT_RED = RGBColor(239, 68, 68)        # #EF4444 Alert Red

FONT_HEADING = "Segoe UI"
FONT_BODY = "Segoe UI"


def create_deck():
    prs = Presentation()
    # 16:9 Widescreen standard dimensions
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    return prs


def add_blank_slide(prs, bg_color):
    slide_layout = prs.slide_layouts[6] # Blank
    slide = prs.slides.add_slide(slide_layout)
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg.fill.solid()
    bg.fill.fore_color.rgb = bg_color
    bg.line.fill.background()
    return slide


def add_header(slide, badge_text, title_text, subtitle_text, dark_mode=False):
    """Adds a structured, responsive header to content slides."""
    # Badge Pill
    badge_shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.45), Inches(3.2), Inches(0.32)
    )
    badge_shape.fill.solid()
    badge_shape.fill.fore_color.rgb = RGBColor(30, 58, 138) if dark_mode else RGBColor(239, 246, 255)
    badge_shape.line.color.rgb = ACCENT_PRIMARY if dark_mode else RGBColor(191, 219, 254)
    badge_shape.line.width = Pt(1)
    
    tf_badge = badge_shape.text_frame
    tf_badge.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf_badge.margin_left = Pt(8)
    tf_badge.margin_top = Pt(0)
    p_b = tf_badge.paragraphs[0]
    p_b.text = badge_text.upper()
    p_b.font.name = FONT_HEADING
    p_b.font.size = Pt(8.5)
    p_b.font.bold = True
    p_b.font.color.rgb = ACCENT_CYAN if dark_mode else ACCENT_PRIMARY
    p_b.alignment = PP_ALIGN.CENTER

    # Title & Subtitle Box
    tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.85), Inches(11.733), Inches(0.95))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = Pt(0)
    tf.margin_top = Pt(0)
    tf.margin_right = Pt(0)
    tf.margin_bottom = Pt(0)

    # Title
    p_t = tf.paragraphs[0]
    p_t.text = title_text
    p_t.font.name = FONT_HEADING
    p_t.font.size = Pt(21)
    p_t.font.bold = True
    p_t.font.color.rgb = TEXT_DARK_TITLE if dark_mode else TEXT_LIGHT_TITLE
    p_t.space_after = Pt(2)

    # Subtitle
    p_s = tf.add_paragraph()
    p_s.text = subtitle_text
    p_s.font.name = FONT_BODY
    p_s.font.size = Pt(11.5)
    p_s.font.color.rgb = TEXT_DARK_MUTED if dark_mode else TEXT_LIGHT_SUBTITLE


def add_footer(slide, current_num, total_num=16, dark_mode=False):
    """Adds breadcrumb and slide indicator to the slide bottom."""
    # Divider line
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(6.92), Inches(11.733), Inches(0.015))
    line.fill.solid()
    line.fill.fore_color.rgb = BORDER_DARK if dark_mode else BORDER_LIGHT
    line.line.fill.background()

    # Footer left: Project info
    tb_l = slide.shapes.add_textbox(Inches(0.8), Inches(6.98), Inches(5.5), Inches(0.35))
    tf_l = tb_l.text_frame
    tf_l.margin_left = Pt(0)
    tf_l.margin_top = Pt(0)
    p_l = tf_l.paragraphs[0]
    p_l.text = "Whiteboard.io: Master's Minor Project Presentation | MCA Semester 3"
    p_l.font.name = FONT_BODY
    p_l.font.size = Pt(8.5)
    p_l.font.color.rgb = TEXT_DARK_MUTED if dark_mode else TEXT_LIGHT_MUTED

    # Footer center: Live URL
    tb_c = slide.shapes.add_textbox(Inches(5.0), Inches(6.98), Inches(4.5), Inches(0.35))
    tf_c = tb_c.text_frame
    tf_c.margin_left = Pt(0)
    tf_c.margin_top = Pt(0)
    p_c = tf_c.paragraphs[0]
    p_c.text = "Live Deployment: whiteboard-io-1.onrender.com"
    p_c.font.name = FONT_BODY
    p_c.font.size = Pt(8.5)
    p_c.font.bold = True
    p_c.font.color.rgb = ACCENT_CYAN if dark_mode else ACCENT_PRIMARY
    p_c.alignment = PP_ALIGN.CENTER

    # Footer right: Slide Counter
    tb_r = slide.shapes.add_textbox(Inches(10.533), Inches(6.98), Inches(2.0), Inches(0.35))
    tf_r = tb_r.text_frame
    tf_r.margin_right = Pt(0)
    tf_r.margin_top = Pt(0)
    p_r = tf_r.paragraphs[0]
    p_r.text = f"Slide {current_num} of {total_num}"
    p_r.font.name = FONT_BODY
    p_r.font.size = Pt(8.5)
    p_r.font.bold = True
    p_r.font.color.rgb = TEXT_DARK_MUTED if dark_mode else TEXT_LIGHT_MUTED
    p_r.alignment = PP_ALIGN.RIGHT


def add_card(slide, left, top, width, height, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT, border_width=1):
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = bg_color
    if border_color:
        card.line.color.rgb = border_color
        card.line.width = Pt(border_width)
    else:
        card.line.fill.background()
    return card


def add_bullet_point(text_frame, bold_prefix, text, font_size=10.5, dark_mode=False, space_after=5):
    p = text_frame.add_paragraph()
    p.space_after = Pt(space_after)
    p.margin_left = Pt(12)
    
    if bold_prefix:
        r_bold = p.add_run()
        r_bold.text = bold_prefix + " "
        r_bold.font.name = FONT_BODY
        r_bold.font.size = Pt(font_size)
        r_bold.font.bold = True
        r_bold.font.color.rgb = TEXT_DARK_TITLE if dark_mode else TEXT_LIGHT_TITLE
        
    r_body = p.add_run()
    r_body.text = text
    r_body.font.name = FONT_BODY
    r_body.font.size = Pt(font_size)
    r_body.font.color.rgb = TEXT_DARK_BODY if dark_mode else TEXT_LIGHT_BODY


def add_speaker_notes(slide, notes_text):
    notes_slide = slide.notes_slide
    tf = notes_slide.notes_text_frame
    tf.text = notes_text.strip()


# ==============================================================================
# 16 TECHNICAL PROJECT SLIDE BUILDERS
# ==============================================================================

def build_slide_1_title(prs):
    """Slide 1: Project Title & Academic Identification (Dark Theme)"""
    slide = add_blank_slide(prs, BG_DARK)

    # Accent decorative container
    glow = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.8), Inches(11.733), Inches(5.9))
    glow.fill.solid()
    glow.fill.fore_color.rgb = CARD_DARK
    glow.line.color.rgb = BORDER_DARK
    glow.line.width = Pt(1.5)

    # Academic Badge Pill
    badge = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.3), Inches(1.2), Inches(4.5), Inches(0.38))
    badge.fill.solid()
    badge.fill.fore_color.rgb = RGBColor(30, 58, 138)
    badge.line.color.rgb = ACCENT_PRIMARY
    tf_b = badge.text_frame
    tf_b.vertical_anchor = MSO_ANCHOR.MIDDLE
    p_b = tf_b.paragraphs[0]
    p_b.text = "MASTER'S MINOR PROJECT PRESENTATION | MCA SEMESTER 3"
    p_b.font.name = FONT_HEADING
    p_b.font.size = Pt(9.5)
    p_b.font.bold = True
    p_b.font.color.rgb = ACCENT_CYAN
    p_b.alignment = PP_ALIGN.CENTER

    # Main Project Title
    tb_title = slide.shapes.add_textbox(Inches(1.3), Inches(1.75), Inches(10.7), Inches(1.8))
    tf_t = tb_title.text_frame
    tf_t.word_wrap = True
    tf_t.margin_left = Pt(0)
    
    p1 = tf_t.paragraphs[0]
    p1.text = "WHITEBOARD.IO"
    p1.font.name = FONT_HEADING
    p1.font.size = Pt(36)
    p1.font.bold = True
    p1.font.color.rgb = RGBColor(255, 255, 255)
    p1.space_after = Pt(6)

    p2 = tf_t.add_paragraph()
    p2.text = "A Real-Time Distributed Collaborative Whiteboard System with WebRTC Voice Mesh and Generative AI Diagramming"
    p2.font.name = FONT_BODY
    p2.font.size = Pt(15.5)
    p2.font.color.rgb = RGBColor(186, 230, 253) # Light Sky Blue

    # Horizontal divider
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.3), Inches(3.7), Inches(10.7), Inches(0.02))
    line.fill.solid()
    line.fill.fore_color.rgb = BORDER_DARK
    line.line.fill.background()

    # Two metadata cards: Candidate & Mentor
    # Left Card: Candidate
    c_left = add_card(slide, Inches(1.3), Inches(3.95), Inches(5.1), Inches(2.2), bg_color=RGBColor(15, 23, 42), border_color=BORDER_DARK)
    tb_c1 = slide.shapes.add_textbox(Inches(1.5), Inches(4.05), Inches(4.7), Inches(2.0))
    tf_c1 = tb_c1.text_frame
    tf_c1.word_wrap = True
    
    p_h1 = tf_c1.paragraphs[0]
    p_h1.text = "CANDIDATE DETAILS"
    p_h1.font.size = Pt(9.5)
    p_h1.font.bold = True
    p_h1.font.color.rgb = ACCENT_CYAN
    p_h1.space_after = Pt(4)

    p_val1 = tf_c1.add_paragraph()
    p_val1.text = "PARASMANI KHUNTE"
    p_val1.font.size = Pt(15)
    p_val1.font.bold = True
    p_val1.font.color.rgb = RGBColor(255, 255, 255)
    p_val1.space_after = Pt(2)

    p_dt1 = tf_c1.add_paragraph()
    p_dt1.text = "Roll Number: 43 | Master of Computer Applications (MCA)\nDepartment of Computer Applications | Session 2025–2026"
    p_dt1.font.size = Pt(10)
    p_dt1.font.color.rgb = TEXT_DARK_MUTED

    # Right Card: Mentor & Institution
    c_right = add_card(slide, Inches(6.9), Inches(3.95), Inches(5.1), Inches(2.2), bg_color=RGBColor(15, 23, 42), border_color=BORDER_DARK)
    tb_c2 = slide.shapes.add_textbox(Inches(7.1), Inches(4.05), Inches(4.7), Inches(2.0))
    tf_c2 = tb_c2.text_frame
    tf_c2.word_wrap = True
    
    p_h2 = tf_c2.paragraphs[0]
    p_h2.text = "PROJECT MENTOR & GUIDANCE"
    p_h2.font.size = Pt(9.5)
    p_h2.font.bold = True
    p_h2.font.color.rgb = ACCENT_PRIMARY
    p_h2.space_after = Pt(4)

    p_val2 = tf_c2.add_paragraph()
    p_val2.text = "AMITESH KUMAR JHA"
    p_val2.font.size = Pt(15)
    p_val2.font.bold = True
    p_val2.font.color.rgb = RGBColor(255, 255, 255)
    p_val2.space_after = Pt(2)

    p_dt2 = tf_c2.add_paragraph()
    p_dt2.text = "Assistant Professor & Project Mentor\nDepartment of Computer Applications\nLive Application: https://whiteboard-io-1.onrender.com"
    p_dt2.font.size = Pt(10)
    p_dt2.font.color.rgb = TEXT_DARK_MUTED

    add_footer(slide, 1, 16, dark_mode=True)
    add_speaker_notes(
        slide,
        "Good morning respected mentor and examiners. Today I am presenting my Master's Minor Project, "
        "'Whiteboard.io'. This is a real-time distributed collaborative whiteboard system engineered with "
        "HTML5 Canvas 2D, WebSocket synchronization, a decentralized WebRTC audio mesh, and a multi-engine "
        "generative AI pipeline. The project is completely implemented, verified through automated test suites, "
        "and deployed live on Render."
    )


def build_slide_2_motivation_why(prs):
    """Slide 2: Project Motivation & Why We Built Whiteboard.io (WHY)"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Project Motivation (Why)",
        "Why Whiteboard.io? Core Technical Challenges in Collaborative Canvases",
        "Addressing real-time synchronization latency, browser rendering degradation, communication silos, and AI fragility"
    )

    card_w = Inches(2.75)
    card_h = Inches(4.7)
    left_start = Inches(0.8)
    spacing = Inches(2.99)

    challenges = [
        (
            "SYNCHRONIZATION LATENCY",
            "Multiplayer State Concurrency",
            ACCENT_PRIMARY,
            [
                ("The Engineering Problem:", "Synchronizing high-frequency freehand strokes across multiple concurrent browser clients over the internet without state drift or stutter."),
                ("HTTP Polling Limitations:", "Traditional request-response architectures introduce hundreds of milliseconds of lag, creating jarring visual conflicts."),
                ("Our Solution:", "Full-duplex WebSocket connection via Socket.io with optimistic client rendering (<5ms local) and compact delta streaming to remote peers.")
            ]
        ),
        (
            "CANVAS RENDERING BOTTLENECK",
            "O(N) Complexity Under High Load",
            ACCENT_AMBER,
            [
                ("The Engineering Problem:", "Naive HTML5 Canvas redraws all N elements per frame. As boards grow past 500+ items, browser redraws drop frame rates below 15 FPS."),
                ("Raw Pointer Flooding:", "120Hz mouse/touch events generate massive coordinate arrays, saturating client memory and network bandwidth."),
                ("Our Solution:", "Engineered 2D Uniform Grid spatial indexing for O(log N + K) viewport culling and the RDP algorithm to decimate redundant stroke points by 70%.")
            ]
        ),
        (
            "COMMUNICATION CONTEXT SWITCH",
            "Third-Party Voice Friction",
            ACCENT_CYAN,
            [
                ("The Engineering Problem:", "Remote design and architecture reviews force teams to switch between canvas tabs and separate voice apps (Zoom/Meet/Slack)."),
                ("Loss of Spatial Context:", "Screen-sharing converts interactive multiplayer whiteboards into passive single-user broadcasts."),
                ("Our Solution:", "Native in-browser WebRTC peer-to-peer audio mesh with real-time Web Audio API frequency analysis and dynamic speaking halos on cursors.")
            ]
        ),
        (
            "AI RESILIENCE & BOARD SAFETY",
            "429 Throttling & Rogue Wipes",
            ACCENT_RED,
            [
                ("The Engineering Problem:", "Commercial AI APIs fail under burst traffic (HTTP 429 Too Many Requests), while open rooms suffer from accidental or malicious board clears."),
                ("Fragile Cloud Chains:", "A single API failure halts brainstorming sessions completely."),
                ("Our Solution:", "A 5-layer rate-limit and failover shield (Gemini -> Ollama -> Procedural) coupled with a democratic 15-second Consensus Vote-to-Clear mechanism.")
            ]
        )
    ]

    for idx, (badge, title, accent, points) in enumerate(challenges):
        x = left_start + (idx * spacing)
        y = Inches(1.95)
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.18), y + Inches(0.15), card_w - Inches(0.36), card_h - Inches(0.25))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_b = tf.paragraphs[0]
        p_b.text = badge
        p_b.font.size = Pt(8.5)
        p_b.font.bold = True
        p_b.font.color.rgb = accent
        p_b.space_after = Pt(2)

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(11)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(8)

        for b_bold, b_text in points:
            add_bullet_point(tf, b_bold, b_text, font_size=8.8, dark_mode=False, space_after=6)

    add_footer(slide, 2, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 2 establishes the core motivation for this project. Developing a production-quality collaborative "
        "whiteboard requires solving four major distributed systems challenges: first, managing concurrent multi-user "
        "drawing deltas with sub-50ms latency; second, preventing canvas frame rate degradation as thousands of strokes "
        "accumulate; third, eliminating the need for external voice apps by embedding WebRTC audio directly into the canvas; "
        "and fourth, shielding AI diagram generation from cloud 429 rate limits while protecting multi-user boards from accidental wipes."
    )


def build_slide_3_what_we_built(prs):
    """Slide 3: Concrete Objectives & Deliverables (WHAT WE BUILT)"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Deliverables & Scope (What)",
        "What We Built: Core Subsystems of the Whiteboard.io Platform",
        "A complete, decoupled full-stack architecture delivering canvas mechanics, real-time sync, voice, and AI"
    )

    card_w = Inches(3.75)
    card_h = Inches(2.3)
    coords = [
        (Inches(0.8), Inches(1.95)),
        (Inches(4.79), Inches(1.95)),
        (Inches(8.78), Inches(1.95)),
        (Inches(0.8), Inches(4.45)),
        (Inches(4.79), Inches(4.45)),
        (Inches(8.78), Inches(4.45))
    ]

    modules = [
        (
            "1. Infinite Canvas Engine",
            "High-DPI Retina canvas supporting freehand pen, highlighters, geometric shapes (rectangles, ellipses, diamonds, arrows), smart wire snapping, text boxes, and draggable sticky notes.",
            ACCENT_PRIMARY
        ),
        (
            "2. Sub-50ms Multiplayer Sync",
            "Socket.io bi-directional transport streaming incremental coordinate packets and element deltas with optimistic local rendering and room-level broadcast isolation.",
            ACCENT_CYAN
        ),
        (
            "3. WebRTC Spatial Voice Mesh",
            "Native browser-to-browser audio mesh utilizing Google STUN for NAT traversal. Web Audio API frequency analysis renders real-time audio waveforms and speaking indicator halos.",
            ACCENT_PURPLE
        ),
        (
            "4. Multi-Engine AI Synthesis",
            "Natural language diagram synthesis generating mind maps, flowcharts, sticky boards, and system topologies with automated failover across Gemini 3.8, 3.6, Ollama, and offline procedural rules.",
            ACCENT_GREEN
        ),
        (
            "5. Democratic Board Governance",
            "Anti-troll consensus protection featuring a 15-second vote-to-clear countdown, room-wide View-Only lock, individual drawing permission toggling, user kicking, and automatic host migration.",
            ACCENT_AMBER
        ),
        (
            "6. Multi-Tier Persistence & Security",
            "MongoDB Atlas document storage with debounced atomic batching, PBKDF2-SHA512 password cryptography, Google OAuth 2.0 with URL hash redirect, and persistent guest profiles.",
            ACCENT_PRIMARY
        )
    ]

    for idx, (title, desc, accent) in enumerate(modules):
        x, y = coords[idx]
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.06))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.2), y + Inches(0.15), card_w - Inches(0.4), card_h - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_t = tf.paragraphs[0]
        p_t.text = title
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(6)

        p_d = tf.add_paragraph()
        p_d.text = desc
        p_d.font.size = Pt(9.5)
        p_d.font.color.rgb = TEXT_LIGHT_BODY

    add_footer(slide, 3, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 3 summarizes exactly what we designed and built. The system comprises 6 tightly integrated modules: "
        "an infinite canvas engine with rich shape primitives; a sub-50ms Socket.io multiplayer sync layer; an in-browser "
        "WebRTC audio mesh; a multi-engine generative AI diagramming pipeline; room governance with vote-to-clear consensus; "
        "and multi-tier persistence combining browser local storage with MongoDB Atlas."
    )


def build_slide_4_tech_stack_rationale(prs):
    """Slide 4: Technology Stack & Architectural Justification (TECH STACK & WHY)"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Technology Stack (Using What Tech)",
        "Technology Stack Selection & Engineering Trade-Off Analysis",
        "Justifying architectural choices across rendering, transport, media, AI inference, and persistence"
    )

    card_w = Inches(2.75)
    card_h = Inches(4.7)
    coords = [Inches(0.8) + (i * Inches(2.99)) for i in range(4)]

    stacks = [
        (
            "RENDERING & CLIENT",
            "HTML5 Canvas 2D + React 19",
            ACCENT_PRIMARY,
            [
                ("Selected Tech:", "HTML5 Canvas 2D API, React 19, TypeScript, Vite 6, Tailwind CSS."),
                ("Why Canvas over SVG/DOM?:", "Direct raster pixel/path rendering avoids DOM tree bloat. A canvas with 2,000 strokes maintains 60 FPS, whereas SVG DOM nodes cause severe garbage collection and repaint lag."),
                ("Why React 19 & TypeScript?:", "Component modularity for UI toolbars combined with strict compile-time type safety preventing runtime undefined coordinate errors.")
            ]
        ),
        (
            "REAL-TIME & MEDIA",
            "Socket.io + WebRTC Mesh",
            ACCENT_CYAN,
            [
                ("Selected Tech:", "Node.js, Express, Socket.io 4.8+, WebRTC, Google STUN, Web Audio API."),
                ("Why WebSockets?:", "Provides bi-directional, full-duplex communication over a single TCP connection, reducing protocol overhead to <50ms vs 500ms+ for HTTP polling."),
                ("Why WebRTC P2P Mesh?:", "Streams voice directly between browser peers without requiring costly SFU/MCU servers. Zero backend audio transcoding load.")
            ]
        ),
        (
            "GENERATIVE AI",
            "Gemini 3.8/3.6 + Ollama",
            ACCENT_PURPLE,
            [
                ("Selected Tech:", "Google Gemini 3.8 Flash & 3.6 Flash, Ollama (llama3.2), Custom Layout Engine."),
                ("Why Dual Cloud + Local?:", "Gemini provides high-speed structured JSON generation in the cloud; Ollama provides zero-latency offline inference on private developer machines."),
                ("Why Layout Modules?:", "AI generates semantic node relationships; our deterministic topological algorithms calculate precise x,y canvas coordinates.")
            ]
        ),
        (
            "DATABASE & SECURITY",
            "MongoDB Atlas + PBKDF2",
            ACCENT_GREEN,
            [
                ("Selected Tech:", "MongoDB Atlas, Mongoose ODM, PBKDF2-SHA512, Google OAuth 2.0."),
                ("Why MongoDB NoSQL?:", "Whiteboard elements have highly polymorphic structures (strokes vs sticky notes vs shapes). JSON document collections map 1:1 with canvas objects."),
                ("Why PBKDF2-SHA512?:", "100,000 iterations with 16-byte cryptographically secure salt resists modern GPU dictionary attacks.")
            ]
        )
    ]

    for idx, (badge, title, accent, bullets) in enumerate(stacks):
        x = coords[idx]
        y = Inches(1.95)
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.18), y + Inches(0.15), card_w - Inches(0.36), card_h - Inches(0.25))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_b = tf.paragraphs[0]
        p_b.text = badge
        p_b.font.size = Pt(8.5)
        p_b.font.bold = True
        p_b.font.color.rgb = accent
        p_b.space_after = Pt(2)

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(11)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(6)

        for b_bold, b_text in bullets:
            add_bullet_point(tf, b_bold, b_text, font_size=8.8, dark_mode=False, space_after=6)

    add_footer(slide, 4, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 4 addresses 'Using what tech and why'. We made deliberate engineering trade-offs: choosing the HTML5 Canvas 2D "
        "API over SVG to avoid DOM memory leaks; utilizing Socket.io over HTTP polling for sub-50ms latency; implementing a "
        "peer-to-peer WebRTC mesh to avoid expensive audio media servers; and pairing Google Gemini with local Ollama to ensure "
        "diagram synthesis works even when internet connectivity drops."
    )


def build_slide_5_system_architecture(prs):
    """Slide 5: Overall System Architecture (HOW IT WORKS - DIAGRAM)"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "System Architecture",
        "Layered Distributed Architecture & Subsystem Boundaries",
        "Decoupled client-server design ensuring fault isolation, responsive UI, and persistent storage"
    )

    card_l = add_card(slide, Inches(0.8), Inches(1.95), Inches(4.7), Inches(4.7), bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    tb_l = slide.shapes.add_textbox(Inches(1.0), Inches(2.1), Inches(4.3), Inches(4.4))
    tf_l = tb_l.text_frame
    tf_l.word_wrap = True
    tf_l.margin_top = Pt(0)
    tf_l.margin_left = Pt(0)

    p_t = tf_l.paragraphs[0]
    p_t.text = "Architectural Subsystem Breakdown"
    p_t.font.size = Pt(13)
    p_t.font.bold = True
    p_t.font.color.rgb = TEXT_LIGHT_TITLE
    p_t.space_after = Pt(6)

    tiers = [
        ("1. Presentation Tier (Client):", "React 19 single-page app hosting the dual-layer Canvas 2D renderer, tool state machines, and WebRTC audio hooks."),
        ("2. HTTP / REST Gateway:", "Express.js endpoints handling user registration, PBKDF2 authentication, Google OAuth federation, and IP-based rate limiting."),
        ("3. WebSocket Collaboration Hub:", "Socket.io cluster synchronizing drawing steps, cursor positions, canvas lock state, and vote-to-clear ballots."),
        ("4. WebRTC Signaling Coordinator:", "Negotiates SDP session descriptions and ICE candidate exchanges for direct peer-to-peer audio transmission."),
        ("5. Generative AI Subsystem:", "Modular pipeline managing inbound request queues, LRU response cache, multi-model failover, and layout coordinate solvers."),
        ("6. Persistence Tier:", "MongoDB Atlas storing user credentials, session tokens, room metadata, and serialized spatial canvas elements.")
    ]

    for b_bold, b_text in tiers:
        add_bullet_point(tf_l, b_bold, b_text, font_size=9.2, dark_mode=False, space_after=5)

    # Right Column: Embed diagram_architecture.png
    diagram_path = os.path.join(TOOLING_DIR, "diagram_architecture.png")
    if os.path.exists(diagram_path):
        card_img = add_card(slide, Inches(5.7), Inches(1.95), Inches(6.833), Inches(4.7), bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)
        slide.shapes.add_picture(diagram_path, Inches(5.8), Inches(2.05), width=Inches(6.633), height=Inches(4.5))

    add_footer(slide, 5, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Here is the high-level system architecture of Whiteboard.io. The diagram shows the clean decoupling between the "
        "Client Presentation Tier, Express API Gateway, Socket.io Real-Time Hub, WebRTC Signaling Coordinator, Generative AI "
        "Pipeline, and MongoDB Persistence Tier. This loose coupling ensures that even if the AI backend or database experiences "
        "temporary network latency, real-time drawing and peer voice chat continue without interruption."
    )


def build_slide_6_canvas_mechanics(prs):
    """Slide 6: Client-Side Canvas Engine & Rendering Mechanics"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Client Engineering",
        "Canvas 2D Engine Mechanics, Coordinate Transformations & Toolsets",
        "Implementation details of the dual-layer rendering pipeline, affine matrix transformations, and smart shapes"
    )

    card_w = Inches(3.75)
    card_h = Inches(4.7)
    coords = [Inches(0.8) + (i * Inches(3.99)) for i in range(3)]

    sections = [
        (
            "DUAL-LAYER CANVAS ARCHITECTURE",
            "Eliminating Repaint Thrashing",
            ACCENT_PRIMARY,
            [
                ("Background Buffer Layer:", "Renders all committed static elements (shapes, finished strokes, text, stickies) to an offscreen bitmap buffer."),
                ("Foreground Scratchpad Layer:", "Renders only the active, in-progress pointer stroke. Repaints at 60 FPS without redrawing the committed scene."),
                ("Composition on pointerup:", "When drawing finishes, the scratchpad stroke is finalized and committed onto the static buffer."),
                ("Zero Garbage Collection Stalls:", "Avoids recreating canvas path objects during drag operations, maintaining smooth frame delivery.")
            ]
        ),
        (
            "COORDINATE TRANSFORM ENGINE",
            "Screen-to-World Affine Matrices",
            ACCENT_CYAN,
            [
                ("Infinite Pan & Zoom (0.1x - 5.0x):", "Implements 2D affine transformation matrices [scale, 0, 0, scale, panX, panY]."),
                ("Pointer Event Normalization:", "World coordinates calculated via: worldX = (screenX - panX) / zoom, ensuring pixel-perfect accuracy regardless of viewport scale."),
                ("High-DPI Retina Scaling:", "Canvas buffer dimensions are multiplied by window.devicePixelRatio (2x / 3x) and scaled down via CSS for sub-pixel crispness."),
                ("Smooth Wheel & Touch Zoom:", "Pinch-to-zoom and mouse wheel zoom center dynamically on the user's cursor focal point.")
            ]
        ),
        (
            "EXTENSIBLE CREATIVE TOOLSET",
            "Vector Primitives & Interactive Elements",
            ACCENT_PURPLE,
            [
                ("Freehand & Highlighter:", "Custom bezier interpolation with configurable stroke color, width, and alpha blending."),
                ("Smart Geometric Shapes:", "Rectangles, circles, diamonds, triangles, stars, and directional arrows with magnetic anchor wire snapping."),
                ("Interactive Sticky Notes:", "Draggable cards with auto-wrapping multi-line text editing and real-time color palette selection."),
                ("Rich Text & Icon Library:", "Direct in-canvas typographic editing paired with a searchable library of Lucide vector icons.")
            ]
        )
    ]

    for idx, (badge, title, accent, bullets) in enumerate(sections):
        x = coords[idx]
        y = Inches(1.95)
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.2), y + Inches(0.18), card_w - Inches(0.4), card_h - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_b = tf.paragraphs[0]
        p_b.text = badge
        p_b.font.size = Pt(8.5)
        p_b.font.bold = True
        p_b.font.color.rgb = accent
        p_b.space_after = Pt(2)

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(11.5)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(6)

        for b_bold, b_text in bullets:
            add_bullet_point(tf, b_bold, b_text, font_size=9.2, dark_mode=False, space_after=6)

    add_footer(slide, 6, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 6 dives into the client-side canvas implementation. To achieve high rendering performance, we implemented "
        "a dual-layer canvas architecture: a background canvas holds committed shapes, while a lightweight transparent overlay "
        "captures active mouse drags without forcing full-board repaints. All mouse and touch events are transformed through "
        "an affine 2D matrix to support infinite panning, smooth zooming, and high-DPI Retina scaling."
    )


def build_slide_7_algorithms_optimization(prs):
    """Slide 7: Algorithms & Mathematical Optimizations"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Mathematical Optimization",
        "Algorithmic Acceleration: Spatial Indexing & Curve Decimation",
        "Sustaining 60 FPS through 2D Uniform Grid partitioning and Ramer-Douglas-Peucker stroke decimation"
    )

    card_w = Inches(3.75)
    card_h = Inches(4.7)
    coords = [Inches(0.8) + (i * Inches(3.99)) for i in range(3)]

    optimizations = [
        (
            "UNIFORM GRID SPATIAL INDEX",
            "O(log N + K) Viewport Culling",
            ACCENT_PRIMARY,
            [
                ("The Naive Bottleneck:", "Iterating over all N elements on every frame creates an O(N) complexity loop that overwhelms the JavaScript main thread when N > 500."),
                ("256x256 Spatial Bucketing:", "The 2D plane is divided into discrete grid cells. Elements register their bounding boxes in all intersecting cells."),
                ("Viewport Boundary Queries:", "During rendering, only cells overlapping the visible viewport bounds are queried, slashing redraw count to O(log N + K)."),
                ("Instant Hit-Testing:", "Mouse selection, bounding box checks, and lasso tools query only local buckets instead of checking every shape on the board.")
            ]
        ),
        (
            "RDP STROKE SIMPLIFICATION",
            "Ramer-Douglas-Peucker Decimation",
            ACCENT_CYAN,
            [
                ("High-Frequency Pointer Noise:", "High-DPI pointer input at 120Hz creates thousands of nearly collinear coordinate points per stroke."),
                ("Recursive Decimation Algorithm:", "RDP mathematically discards intermediate points whose perpendicular distance to the chord is less than threshold epsilon (ε = 1.0)."),
                ("70% Payload Reduction:", "Reduces JSON serialization size, network packet bandwidth, and client memory consumption by up to 70%."),
                ("Perceptually Lossless:", "The reconstructed curve renders identically to the human eye while consuming a fraction of the compute.")
            ]
        ),
        (
            "RAF BATCHING & DOUBLE BUFFERING",
            "Decoupling Input from Display Refresh",
            ACCENT_GREEN,
            [
                ("Event Frequency Decoupling:", "Pointer move events trigger at up to 120Hz-240Hz on gaming mice and touch screens. Redrawing on every event causes stutter."),
                ("requestAnimationFrame Loop:", "Coordinates are pushed into an in-memory queue; the canvas is redrawn only once per display frame synced to the monitor's refresh rate."),
                ("Double-Buffered Swapping:", "Draw calls execute on an offscreen buffer and are blitted to the active display in a single GPU operation."),
                ("Sustained 60 FPS:", "Guarantees jitter-free rendering even during simultaneous multi-user stroke streaming.")
            ]
        )
    ]

    for idx, (badge, title, accent, bullets) in enumerate(optimizations):
        x = coords[idx]
        y = Inches(1.95)
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.2), y + Inches(0.18), card_w - Inches(0.4), card_h - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_b = tf.paragraphs[0]
        p_b.text = badge
        p_b.font.size = Pt(8.5)
        p_b.font.bold = True
        p_b.font.color.rgb = accent
        p_b.space_after = Pt(2)

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(11.5)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(6)

        for b_bold, b_text in bullets:
            add_bullet_point(tf, b_bold, b_text, font_size=9.2, dark_mode=False, space_after=6)

    add_footer(slide, 7, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 7 highlights our mathematical optimizations. First, we implemented 2D Uniform Grid spatial indexing, "
        "segmenting the canvas into 256x256 pixel buckets so the render loop only processes elements currently in the visible "
        "viewport. Second, we implemented the Ramer-Douglas-Peucker algorithm to eliminate redundant collinear points in freehand "
        "strokes, reducing payload sizes by 70%. Third, we throttled draw operations using requestAnimationFrame to prevent "
        "input event flooding."
    )


def build_slide_8_dataflow_pipeline(prs):
    """Slide 8: Real-Time Multiplayer Sync & Data Flow (HOW IT WORKS - DIAGRAM)"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Real-Time Data Pipeline",
        "Sub-50ms Event Synchronization Pipeline & Debounced Persistence",
        "Tracing atomic pointer capture, optimistic rendering, socket broadcasting, and database flushing"
    )

    # Left Column: Embed diagram_dataflow.png (Width: 6.833 inches)
    # Right Column: Dataflow stages (Width: 4.7 inches)
    diagram_path = os.path.join(TOOLING_DIR, "diagram_dataflow.png")
    if os.path.exists(diagram_path):
        card_img = add_card(slide, Inches(0.8), Inches(1.95), Inches(6.833), Inches(4.7), bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)
        slide.shapes.add_picture(diagram_path, Inches(0.9), Inches(2.05), width=Inches(6.633), height=Inches(4.5))

    card_r = add_card(slide, Inches(7.833), Inches(1.95), Inches(4.7), Inches(4.7), bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    tb_r = slide.shapes.add_textbox(Inches(8.033), Inches(2.1), Inches(4.3), Inches(4.4))
    tf_r = tb_r.text_frame
    tf_r.word_wrap = True
    tf_r.margin_top = Pt(0)
    tf_r.margin_left = Pt(0)

    p_t = tf_r.paragraphs[0]
    p_t.text = "Step-by-Step Dataflow Sequence"
    p_t.font.size = Pt(13)
    p_t.font.bold = True
    p_t.font.color.rgb = TEXT_LIGHT_TITLE
    p_t.space_after = Pt(6)

    steps = [
        ("1. Optimistic Local Render:", "User pointer move draws immediately to local HTML5 canvas buffer (<5ms latency), guaranteeing zero local lag."),
        ("2. Delta Serialization:", "Active stroke or shape coordinates are packed into lightweight JSON payloads with unique UUID and timestamp."),
        ("3. Socket.io Event Emission:", "Client emits 'draw_step' or 'element_update' over WebSocket to the Node.js collaboration gateway."),
        ("4. Room-Scoped Broadcast:", "Server immediately broadcasts to all active room peers via socket.to(roomId).emit without redundant parsing."),
        ("5. Peer Spatial Ingestion:", "Receiving clients update their spatial uniform grid and trigger immediate redraw of affected canvas tiles."),
        ("6. Debounced Persistence:", "Server buffers element deltas in memory and flushes atomically to MongoDB every 300ms, minimizing I/O overhead.")
    ]

    for b_bold, b_text in steps:
        add_bullet_point(tf_r, b_bold, b_text, font_size=9.2, dark_mode=False, space_after=5)

    add_footer(slide, 8, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "This slide presents the live dataflow sequence from pointer event capture to database persistence. "
        "Notice the two-speed architecture: high-frequency stroke packets bypass the database entirely and are broadcast "
        "in-memory across Socket.io rooms with sub-50ms latency. The completed elements are collected in an in-memory buffer "
        "on the server and flushed in debounced 300ms batches to MongoDB Atlas."
    )


def build_slide_9_webrtc_voice(prs):
    """Slide 9: Native WebRTC Voice Mesh Implementation"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "WebRTC Voice Mesh",
        "In-Browser Decentralized Audio Mesh & Spatial Presence Visualizer",
        "Full mesh peer-to-peer audio transmission with Web Audio API frequency analysis and cursor speaking halos"
    )

    card_w = Inches(3.75)
    card_h = Inches(4.7)
    coords = [Inches(0.8) + (i * Inches(3.99)) for i in range(3)]

    sections = [
        (
            "P2P MESH SIGNALING PROTOCOL",
            "Socket.io as SDP / ICE Gateway",
            ACCENT_PRIMARY,
            [
                ("Zero External Signaling Servers:", "Leverages our existing WebSocket infrastructure to exchange WebRTC session parameters."),
                ("SDP Offer & Answer Handshake:", "When voice chat is toggled, 'voice_offer' and 'voice_answer' events negotiate Opus audio parameters (48kHz, mono)."),
                ("Trickle ICE Traversal:", "Google STUN servers (stun:stun.l.google.com:19302) resolve public NAT endpoints for residential and university networks."),
                ("Mesh Topology Trade-off:", "Direct P2P audio links between all room peers provide ultra-low latency (<20ms) with zero server bandwidth consumption for teams of 3–8.")
            ]
        ),
        (
            "WEB AUDIO API ANALYSIS",
            "Real-Time Waveform & RMS FFT",
            ACCENT_CYAN,
            [
                ("AudioContext & MediaStream:", "Microphone input is captured via navigator.mediaDevices.getUserMedia and connected into the Web Audio API graph."),
                ("AnalyserNode FFT Engine:", "Processes audio streams through a 256-point Fast Fourier Transform (FFT) node to calculate frequency distribution."),
                ("Root Mean Square (RMS) Decibels:", "Computes dynamic amplitude levels to reliably identify speech vs. background noise."),
                ("Canvas Waveform Dock:", "Animates live audio frequency bars inside the integrated whiteboard voice control bar.")
            ]
        ),
        (
            "SPATIAL COLLABORATION PRESENCE",
            "Audio-Reactive Cursor Halos",
            ACCENT_GREEN,
            [
                ("Multiplayer Speaking Indicator:", "When a peer speaks, dynamic green acoustic rings expand around their collaborative cursor on all screens in real time."),
                ("Eliminates Audio Ambiguity:", "Team members instantly see who is talking and where they are pointing without looking away from the canvas."),
                ("Hardware State Controls:", "One-click Mute Microphone, Deafen Output, and audio input/output device switching."),
                ("Interactive Audio Simulation:", "Includes an integrated fallback audio loop simulator for headless or restricted browser environments.")
            ]
        )
    ]

    for idx, (badge, title, accent, bullets) in enumerate(sections):
        x = coords[idx]
        y = Inches(1.95)
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.2), y + Inches(0.18), card_w - Inches(0.4), card_h - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_b = tf.paragraphs[0]
        p_b.text = badge
        p_b.font.size = Pt(8.5)
        p_b.font.bold = True
        p_b.font.color.rgb = accent
        p_b.space_after = Pt(2)

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(11.5)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(6)

        for b_bold, b_text in bullets:
            add_bullet_point(tf, b_bold, b_text, font_size=9.2, dark_mode=False, space_after=6)

    add_footer(slide, 9, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 9 demonstrates our native WebRTC voice mesh implementation. Rather than forcing users to open an external "
        "meeting tab, we negotiated WebRTC peer-to-peer audio streams using our existing Socket.io channel as the signaling layer. "
        "We route incoming and outgoing audio through Web Audio API AnalyserNodes to compute live RMS volume, creating animated "
        "green speaking rings around multiplayer cursors as team members speak."
    )


def build_slide_10_ai_resilience(prs):
    """Slide 10: Multi-Engine AI Diagram Synthesis & Failover (HOW IT WORKS - DIAGRAM)"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Generative AI Architecture",
        "Multi-Engine AI Diagram Synthesis & 5-Layer Resilience Shield",
        "Guaranteed 100% diagram generation uptime using Google Gemini, local Ollama, and offline procedural rules"
    )

    card_l = add_card(slide, Inches(0.8), Inches(1.95), Inches(4.7), Inches(4.7), bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    tb_l = slide.shapes.add_textbox(Inches(1.0), Inches(2.1), Inches(4.3), Inches(4.4))
    tf_l = tb_l.text_frame
    tf_l.word_wrap = True
    tf_l.margin_top = Pt(0)
    tf_l.margin_left = Pt(0)

    p_t = tf_l.paragraphs[0]
    p_t.text = "5-Layer Rate-Limit & Resilience Shield"
    p_t.font.size = Pt(12)
    p_t.font.bold = True
    p_t.font.color.rgb = TEXT_LIGHT_TITLE
    p_t.space_after = Pt(4)

    shield_layers = [
        ("Layer 1 (IP Rate Limiting):", "Inbound Express middleware throttles flood attacks, restricting users to 10 generation requests per minute."),
        ("Layer 2 (2-Hour LRU Cache):", "In-memory LRU cache stores generated diagram graphs by prompt hash; identical requests return in <5ms."),
        ("Layer 3 (Queue Pacer):", "FIFO outbound queue spaces external API requests by 3 seconds, preventing Gemini HTTP 429 burst errors."),
        ("Layer 4 (Multi-Model Failover):", "Attempts Gemini 3.8 Flash -> falls back to Gemini 3.6 Flash -> falls back to local Ollama (llama3.2)."),
        ("Layer 5 (Procedural Engine):", "Deterministic layout solver generates full mind maps & flowcharts offline if all external AI endpoints fail."),
        ("Conversational Refinement:", "In-canvas AI Chat panel supports iterative natural language diffs with full atomic undo/redo history.")
    ]

    for b_bold, b_text in shield_layers:
        add_bullet_point(tf_l, b_bold, b_text, font_size=8.8, dark_mode=False, space_after=4)

    # Right Column: Embed diagram_ai_pipeline.png
    diagram_path = os.path.join(TOOLING_DIR, "diagram_ai_pipeline.png")
    if os.path.exists(diagram_path):
        card_img = add_card(slide, Inches(5.7), Inches(1.95), Inches(6.833), Inches(4.7), bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)
        slide.shapes.add_picture(diagram_path, Inches(5.8), Inches(2.05), width=Inches(6.633), height=Inches(4.5))

    add_footer(slide, 10, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 10 details our AI diagramming architecture. Instead of relying on a fragile single cloud API, we engineered "
        "a 5-layer resilience shield. It combines IP rate limiting, a 2-hour LRU response cache, a 3-second queue pacer to avoid "
        "429 throttling, automated failover between Gemini 3.8, Gemini 3.6, and local Ollama, and an offline procedural fallback. "
        "This ensures the system never crashes or leaves the user with an empty canvas during brainstorming sessions."
    )


def build_slide_11_database_schemas(prs):
    """Slide 11: Database Architecture & Document Modeling (HOW IT WORKS - DIAGRAM)"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Database Architecture",
        "MongoDB Document Schemas & Spatial Indexing Strategy",
        "Optimized NoSQL document collections supporting atomic delta syncing and rapid canvas hydration"
    )

    # Left Column: Embed diagram_database_schema.png (Width: 6.833 inches)
    # Right Column: Collection details (Width: 4.7 inches)
    diagram_path = os.path.join(TOOLING_DIR, "diagram_database_schema.png")
    if os.path.exists(diagram_path):
        card_img = add_card(slide, Inches(0.8), Inches(1.95), Inches(6.833), Inches(4.7), bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)
        slide.shapes.add_picture(diagram_path, Inches(0.9), Inches(2.05), width=Inches(6.633), height=Inches(4.5))

    card_r = add_card(slide, Inches(7.833), Inches(1.95), Inches(4.7), Inches(4.7), bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    tb_r = slide.shapes.add_textbox(Inches(8.033), Inches(2.1), Inches(4.3), Inches(4.4))
    tf_r = tb_r.text_frame
    tf_r.word_wrap = True
    tf_r.margin_top = Pt(0)
    tf_r.margin_left = Pt(0)

    p_t = tf_r.paragraphs[0]
    p_t.text = "Core Collection Schemas"
    p_t.font.size = Pt(13)
    p_t.font.bold = True
    p_t.font.color.rgb = TEXT_LIGHT_TITLE
    p_t.space_after = Pt(6)

    schemas = [
        ("1. users Collection:", "Stores user email, display name, PBKDF2 salt/hash, Google OAuth sub ID, avatar color, and registration timestamps."),
        ("2. tokens Collection:", "Secure SHA-256 hashed session tokens with TTL auto-expiration index for stateless authentication verification."),
        ("3. rooms Collection:", "Room code, owner reference, lock status (isLocked), active participants count, and canvas background configuration."),
        ("4. room_elements Collection:", "Atomic spatial elements (rectangles, strokes, arrows, sticky notes, text). Stores x, y, width, height, z-index, and author ID."),
        ("Spatial Compound Index:", "Indexed by (roomId: 1, zIndex: 1) for rapid viewport hydration when a participant enters an active session."),
        ("In-Memory Write Debounce:", "Changes are held in Node.js server buffers and committed atomically via updateMany bulk operations.")
    ]

    for b_bold, b_text in schemas:
        add_bullet_point(tf_r, b_bold, b_text, font_size=9.2, dark_mode=False, space_after=5)

    add_footer(slide, 11, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 11 illustrates our database architecture in MongoDB. We model our domain into users, tokens, rooms, and "
        "room_elements collections. The room_elements collection stores polymorphic geometric items with their spatial bounds "
        "and z-index ordering. By placing a compound index on (roomId: 1, zIndex: 1), a new participant can hydrate a board containing "
        "thousands of elements in under 80 milliseconds upon connecting."
    )


def build_slide_12_security_governance(prs):
    """Slide 12: Security & Room Governance Implementation"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Security & Governance",
        "Cryptographic Hashing, OAuth Federation & Democratic Governance",
        "Protecting user data and preventing accidental board wipes through PBKDF2-SHA512 and Consensus Vote-to-Clear"
    )

    card_w = Inches(5.7)
    card_h = Inches(4.7)
    coords = [(Inches(0.8), Inches(1.95)), (Inches(6.833), Inches(1.95))]

    panels = [
        (
            "AUTHENTICATION & CRYPTOGRAPHY",
            "Multi-Tier Security Architecture",
            ACCENT_PRIMARY,
            [
                ("PBKDF2-SHA512 Key Derivation:", "Passphrases hashed with 100,000 iterations, a 16-byte cryptographically secure salt, and 64-byte key length. Defeats rainbow tables and GPU brute-force attacks."),
                ("Constant-Time Verification:", "Uses Node.js crypto.timingSafeEqual to eliminate side-channel timing attack vectors during authentication checks."),
                ("Google OAuth 2.0 Integration:", "Popup sign-in flow with direct URL hash fragment token handoff (#auth_token=), avoiding cross-site third-party cookie restrictions."),
                ("Stateless Token Expiry:", "Session tokens hashed with SHA-256 and stored in MongoDB with 7-day automated TTL expiration indices."),
                ("Persistent Guest Identities:", "Anonymous guests receive unique UUIDs and persistent colors stored in localStorage for seamless room re-entry.")
            ]
        ),
        (
            "ROOM GOVERNANCE & VOTE-TO-CLEAR",
            "Anti-Troll & Data Loss Protection",
            ACCENT_PURPLE,
            [
                ("The Malicious Wipe Vulnerability:", "In unmoderated multi-user boards, a single rogue click can delete hours of collaborative diagrams without recourse."),
                ("Democratic 15s Vote-to-Clear:", "Initiating 'Clear Canvas' starts a 15-second room-wide referendum with real-time synchronized vote counters across all connected peers."),
                ("Majority Quorum Execution:", "The canvas is cleared ONLY if approved by a majority of active room participants. If the timer expires without quorum, the clear action aborts."),
                ("Canvas Lock (View-Only Mode):", "Hosts can lock the canvas with one click, converting all participant viewports to read-only during lectures or presentations."),
                ("Dynamic Host Migration:", "If the room creator disconnects, the server automatically elects the oldest active connected peer as the new host, preventing room abandonment.")
            ]
        )
    ]

    for idx, (badge, title, accent, bullets) in enumerate(panels):
        x, y = coords[idx]
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.25), y + Inches(0.2), card_w - Inches(0.5), card_h - Inches(0.35))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_b = tf.paragraphs[0]
        p_b.text = badge
        p_b.font.size = Pt(9)
        p_b.font.bold = True
        p_b.font.color.rgb = accent
        p_b.space_after = Pt(2)

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(13)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(8)

        for b_bold, b_text in bullets:
            add_bullet_point(tf, b_bold, b_text, font_size=9.5, dark_mode=False, space_after=6)

    add_footer(slide, 12, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 12 covers security and room governance. For credentials, we implemented PBKDF2-SHA512 hashing with 100,000 iterations "
        "and timing-safe equality checks. To protect collaborative boards from accidental or troll wiping, we created the Consensus "
        "Vote-to-Clear protocol: clearing the canvas triggers a 15-second democratic countdown where a majority vote is required "
        "to execute the wipe. Hosts also have the ability to lock rooms into View-Only mode and kick disruptive participants."
    )


def build_slide_13_codebase_structure(prs):
    """Slide 13: Codebase Structure & Key Modules Walkthrough"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Implementation Walkthrough",
        "Repository Structure & Key Architectural Modules Walkthrough",
        "Clean separation of concerns across client rendering, hooks, server routes, socket handlers, and AI modules"
    )

    card_w = Inches(3.75)
    card_h = Inches(4.7)
    coords = [Inches(0.8) + (i * Inches(3.99)) for i in range(3)]

    modules = [
        (
            "CLIENT MODULES (client/src/)",
            "Rendering Engine & Custom Hooks",
            ACCENT_PRIMARY,
            [
                ("components/Canvas.tsx:", "Central canvas controller (1,200+ lines). Manages double-buffered rendering, pointer event listeners, zoom/pan transforms, and tool state machines."),
                ("hooks/useSocket.ts:", "Manages real-time WebSocket connection, delta broadcasting, cross-tab state syncing, and room membership lifecycle."),
                ("hooks/useVoiceChat.ts:", "Orchestrates WebRTC peer connections, SDP offer/answer handshakes, ICE gathering, and Web Audio API waveform visualizers."),
                ("components/Toolbars & Panels:", "Modular UI controls for drawing tools, shape palettes, sticky note styling, and room governance dialogs.")
            ]
        ),
        (
            "SERVER MODULES (server/)",
            "Gateway, Sockets & Persistence",
            ACCENT_CYAN,
            [
                ("server/index.ts:", "Main application entry point. Configures Express HTTP middleware, rate limiting, and attaches the Socket.io WebSocket server."),
                ("server/socket.ts:", "Socket event handlers for draw_step, element_update, cursor_move, vote_to_clear, and WebRTC audio signaling."),
                ("server/auth.ts:", "Cryptographic utilities: PBKDF2 password hashing, salt generation, session token signing, and Google OAuth validation."),
                ("server/db.ts:", "Mongoose schemas for users, tokens, rooms, and room_elements with connection pooling and compound indices.")
            ]
        ),
        (
            "AI MODULES (server/ai/)",
            "Multi-Engine Orchestration & Solvers",
            ACCENT_PURPLE,
            [
                ("ai/failover.ts:", "Multi-model failover manager routing prompts across Gemini 3.8, Gemini 3.6, Ollama, and procedural engines."),
                ("ai/requestQueue.ts:", "Outbound queue pacer enforcing 3-second spacing to prevent Gemini API 429 burst throttling."),
                ("ai/responseCache.ts:", "In-memory LRU cache storing generated diagram trees for 2 hours to eliminate redundant cloud calls."),
                ("ai/procedural.ts & topologies/:", "Mathematical layout solvers converting hierarchical and graph structures into exact x,y canvas coordinates.")
            ]
        )
    ]

    for idx, (badge, title, accent, bullets) in enumerate(modules):
        x = coords[idx]
        y = Inches(1.95)
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.2), y + Inches(0.18), card_w - Inches(0.4), card_h - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_b = tf.paragraphs[0]
        p_b.text = badge
        p_b.font.size = Pt(8.5)
        p_b.font.bold = True
        p_b.font.color.rgb = accent
        p_b.space_after = Pt(2)

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(11.5)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(6)

        for b_bold, b_text in bullets:
            add_bullet_point(tf, b_bold, b_text, font_size=9.2, dark_mode=False, space_after=6)

    add_footer(slide, 13, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 13 provides a codebase walkthrough showing our clean architectural separation. In client/src/, Canvas.tsx "
        "manages the core rendering loop and pointer inputs, while useSocket.ts and useVoiceChat.ts encapsulate real-time networking. "
        "On the backend, server/socket.ts routes real-time collaboration events, while server/ai/ modularizes the failover chain, "
        "pacing queue, and procedural layout coordinate solvers."
    )


def build_slide_14_testing_qa(prs):
    """Slide 14: Testing, Verification & Quality Assurance"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Testing & Verification",
        "Automated Test Suites, Type Safety & CI/CD Verification",
        "Rigorous automated testing matrix with 171 passing test suites, strict TypeScript validation, and GitHub Actions CI"
    )

    card_w = Inches(3.75)
    card_h = Inches(4.7)
    coords = [Inches(0.8) + (i * Inches(3.99)) for i in range(3)]

    sections = [
        (
            "AUTOMATED TEST MATRIX",
            "171 Automated Tests Passing (100%)",
            ACCENT_PRIMARY,
            [
                ("Test Runner:", "Built using Node.js native test runner (tsx --test); executes 171 comprehensive tests in ~1.6 seconds."),
                ("Authentication & Tokens:", "Validates PBKDF2 hashing, salt generation, session token signing, and 7-day TTL expiry verification."),
                ("Socket Event Validation:", "Verifies draw_step broadcasting, join rate limiting, element locks, and vote-to-clear quorum mechanics."),
                ("AI Failover Simulation:", "Simulates cloud 429 and 503 HTTP errors to verify automated failover to Ollama and procedural models.")
            ]
        ),
        (
            "STATIC TYPE SAFETY & LINTING",
            "Zero Compile Errors Across Monorepo",
            ACCENT_CYAN,
            [
                ("Strict TypeScript Compiler:", "Configured with strict: true across client and server packages (tsc --noEmit)."),
                ("Zero Type Errors:", "100% type-safe interfaces for canvas element schemas, socket payloads, and AI generation parameters."),
                ("ESLint Quality Standards:", "Enforces React hooks dependencies, import hygiene, and defensive null-checking."),
                ("Memory Leak Auditing:", "Verified cleanup of requestAnimationFrame handles, socket event listeners, and WebRTC peer connections.")
            ]
        ),
        (
            "CONTINUOUS INTEGRATION (CI/CD)",
            "GitHub Actions Matrix Verification",
            ACCENT_GREEN,
            [
                ("Automated PR Verification:", "Every git push and pull request runs automated dependency installation, linting, typechecks, and tests."),
                ("GitGuardian Secret Scanning:", "Automated security scanning verifies zero exposed API keys or database credentials."),
                ("Production Packaging:", "Client Vite asset bundling and Node.js server compilation validated before deployment merge."),
                ("Live Production Deployment:", "Hosted on Render Linux containerized infrastructure at https://whiteboard-io-1.onrender.com.")
            ]
        )
    ]

    for idx, (badge, title, accent, bullets) in enumerate(sections):
        x = coords[idx]
        y = Inches(1.95)
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.2), y + Inches(0.18), card_w - Inches(0.4), card_h - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_b = tf.paragraphs[0]
        p_b.text = badge
        p_b.font.size = Pt(8.5)
        p_b.font.bold = True
        p_b.font.color.rgb = accent
        p_b.space_after = Pt(2)

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(11.5)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(6)

        for b_bold, b_text in bullets:
            add_bullet_point(tf, b_bold, b_text, font_size=9.2, dark_mode=False, space_after=6)

    add_footer(slide, 14, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 14 details our quality assurance and verification results. We built an automated test suite containing 171 "
        "unit and integration tests that validate everything from PBKDF2 cryptography to WebRTC signaling and AI failover mechanics. "
        "The entire suite executes in just 1.6 seconds with 100% passing tests. Strict TypeScript validation guarantees zero compile "
        "errors across both client and server packages, verified continuously on GitHub Actions CI."
    )


def build_slide_15_results_benchmarks(prs):
    """Slide 15: Empirical Results & Performance Benchmarks"""
    slide = add_blank_slide(prs, BG_LIGHT)
    add_header(
        slide,
        "Results & Benchmarks",
        "Empirical Performance Metrics & Production Deployment Verification",
        "Quantitative measurements of synchronization latency, frame rates, audio transmission, and AI resilience"
    )

    card_w = Inches(3.75)
    card_h = Inches(4.7)
    coords = [Inches(0.8) + (i * Inches(3.99)) for i in range(3)]

    metrics = [
        (
            "LATENCY & FRAME RATE",
            "Real-Time Interaction Benchmarks",
            ACCENT_PRIMARY,
            [
                ("Sub-50ms Socket Broadcast:", "Median latency between client pointer commit and remote peer screen render measured at 38ms over public Wi-Fi."),
                ("Sustained 60 FPS Render:", "Double-buffered canvas rendering maintains a rock-solid 60 FPS under 1,000+ active geometric elements and strokes."),
                ("Sub-5ms Local Render:", "Optimistic client rendering commits stroke coordinates to local canvas buffer in under 5ms, eliminating user-perceived lag."),
                ("Sub-80ms Canvas Hydration:", "Rooms with 2,000+ serialized elements load and render completely in under 80ms thanks to spatial compound indexing.")
            ]
        ),
        (
            "AUDIO & MEMORY METRICS",
            "WebRTC Mesh & Payload Efficiency",
            ACCENT_CYAN,
            [
                ("Ultra-Low Voice Latency (<20ms):", "Direct P2P audio transmission between peers introduces less than 20ms of audio delay using the Opus 48kHz codec."),
                ("70% Stroke Data Compression:", "Ramer-Douglas-Peucker simplification decimatates raw pointer arrays from ~1,200 points down to ~350 points per stroke."),
                ("Zero Server Audio CPU:", "Full mesh P2P topology offloads 100% of audio mixing and encoding to client endpoints, minimizing server compute overhead."),
                ("Stable Client Memory Footprint:", "Dual-layer canvas architecture prevents browser garbage collection spikes, stabilizing client RAM usage under 120MB.")
            ]
        ),
        (
            "AI RESILIENCE & PRODUCTION",
            "Zero-Downtime High Availability",
            ACCENT_GREEN,
            [
                ("0% AI Generation Downtime:", "Stress-tested across 100+ consecutive diagram requests; failover shield successfully intercepted 429 burst errors without user failure."),
                ("2-Hour LRU Cache Hit Rate:", "Repeated diagram requests return in <5ms with 0 external API cost."),
                ("Live Production Deployment:", "Deployed and accessible globally on Render containerized cloud infrastructure at https://whiteboard-io-1.onrender.com/."),
                ("Cross-Browser Compatibility:", "Verified across Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Edge, and touch tablets.")
            ]
        )
    ]

    for idx, (badge, title, accent, bullets) in enumerate(metrics):
        x = coords[idx]
        y = Inches(1.95)
        add_card(slide, x, y, card_w, card_h, bg_color=CARD_LIGHT, border_color=BORDER_LIGHT)

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, card_w, Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        tb = slide.shapes.add_textbox(x + Inches(0.2), y + Inches(0.18), card_w - Inches(0.4), card_h - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_top = Pt(0)
        tf.margin_left = Pt(0)

        p_b = tf.paragraphs[0]
        p_b.text = badge
        p_b.font.size = Pt(8.5)
        p_b.font.bold = True
        p_b.font.color.rgb = accent
        p_b.space_after = Pt(2)

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(11.5)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_LIGHT_TITLE
        p_t.space_after = Pt(6)

        for b_bold, b_text in bullets:
            add_bullet_point(tf, b_bold, b_text, font_size=9.2, dark_mode=False, space_after=6)

    add_footer(slide, 15, 16, dark_mode=False)
    add_speaker_notes(
        slide,
        "Slide 15 provides empirical benchmark results from our live deployment. We measured a median multiplayer broadcast "
        "latency of under 50ms, sustained 60 FPS rendering under 1,000+ elements, less than 20ms WebRTC voice latency, and a "
        "70% reduction in stroke data payload sizes thanks to the Ramer-Douglas-Peucker algorithm. The AI failover shield successfully "
        "achieved a 0% failure rate under high-volume stress testing."
    )


def build_slide_16_conclusion(prs):
    """Slide 16: Project Conclusion, Key Learnings & Future Work (Dark Theme)"""
    slide = add_blank_slide(prs, BG_DARK)

    # Accent decorative glow box
    glow = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.8), Inches(11.733), Inches(5.9))
    glow.fill.solid()
    glow.fill.fore_color.rgb = CARD_DARK
    glow.line.color.rgb = BORDER_DARK
    glow.line.width = Pt(1.5)

    # Badge Pill
    badge = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.3), Inches(1.2), Inches(3.8), Inches(0.38))
    badge.fill.solid()
    badge.fill.fore_color.rgb = RGBColor(30, 58, 138)
    badge.line.color.rgb = ACCENT_PRIMARY
    tf_b = badge.text_frame
    tf_b.vertical_anchor = MSO_ANCHOR.MIDDLE
    p_b = tf_b.paragraphs[0]
    p_b.text = "CONCLUSION & PROJECT DEFENSE"
    p_b.font.name = FONT_HEADING
    p_b.font.size = Pt(9.5)
    p_b.font.bold = True
    p_b.font.color.rgb = ACCENT_CYAN
    p_b.alignment = PP_ALIGN.CENTER

    # Title
    tb_title = slide.shapes.add_textbox(Inches(1.3), Inches(1.75), Inches(10.7), Inches(1.5))
    tf_t = tb_title.text_frame
    tf_t.word_wrap = True
    tf_t.margin_left = Pt(0)

    p1 = tf_t.paragraphs[0]
    p1.text = "Project Conclusion & Technical Summary"
    p1.font.name = FONT_HEADING
    p1.font.size = Pt(30)
    p1.font.bold = True
    p1.font.color.rgb = RGBColor(255, 255, 255)
    p1.space_after = Pt(4)

    p2 = tf_t.add_paragraph()
    p2.text = "Whiteboard.io demonstrates that open web standards can deliver low-latency real-time collaboration, peer voice, and resilient AI without proprietary silos."
    p2.font.name = FONT_BODY
    p2.font.size = Pt(13)
    p2.font.color.rgb = RGBColor(186, 230, 253)

    # Divider
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.3), Inches(3.45), Inches(10.7), Inches(0.02))
    line.fill.solid()
    line.fill.fore_color.rgb = BORDER_DARK
    line.line.fill.background()

    # Two Summary Cards: Key Learnings & Future Scope
    # Left Card: Summary of Engineering Achievements & Learnings
    c_left = add_card(slide, Inches(1.3), Inches(3.7), Inches(5.8), Inches(2.55), bg_color=RGBColor(15, 23, 42), border_color=BORDER_DARK)
    tb_c1 = slide.shapes.add_textbox(Inches(1.5), Inches(3.8), Inches(5.4), Inches(2.35))
    tf_c1 = tb_c1.text_frame
    tf_c1.word_wrap = True

    p_h1 = tf_c1.paragraphs[0]
    p_h1.text = "KEY ENGINEERING ACHIEVEMENTS"
    p_h1.font.size = Pt(10)
    p_h1.font.bold = True
    p_h1.font.color.rgb = ACCENT_CYAN
    p_h1.space_after = Pt(6)

    deliverables = [
        ("Sub-50ms Multiplayer Synchronization:", "Built with Socket.io optimistic rendering and room-level broadcast isolation."),
        ("Embedded P2P WebRTC Voice Mesh:", "Zero third-party meeting dependencies; real-time audio visualizers."),
        ("5-Layer AI Diagramming Shield:", "Gemini + Ollama + Procedural layout delivering 0% generation failure rate."),
        ("Democratic Vote-to-Clear Quorum:", "15-second consensus voting mechanism eliminating accidental wipes."),
        ("Full-Stack Production Deployment:", "Live on Render with 171 automated tests passing at 100%.")
    ]

    for b_bold, b_text in deliverables:
        add_bullet_point(tf_c1, b_bold, b_text, font_size=9.2, dark_mode=True, space_after=3)

    # Right Card: Future Scope & Roadmap
    c_right = add_card(slide, Inches(7.4), Inches(3.7), Inches(4.6), Inches(2.55), bg_color=RGBColor(15, 23, 42), border_color=BORDER_DARK)
    tb_c2 = slide.shapes.add_textbox(Inches(7.6), Inches(3.8), Inches(4.2), Inches(2.35))
    tf_c2 = tb_c2.text_frame
    tf_c2.word_wrap = True

    p_h2 = tf_c2.paragraphs[0]
    p_h2.text = "FUTURE RESEARCH & ENGINEERING SCOPE"
    p_h2.font.size = Pt(10)
    p_h2.font.bold = True
    p_h2.font.color.rgb = ACCENT_GREEN
    p_h2.space_after = Pt(6)

    future_scope = [
        ("Selective Forwarding Unit (SFU):", "Integrating mediasoup/LiveKit to scale voice rooms to 50+ concurrent users."),
        ("Decentralized CRDT State:", "Adopting Yjs / Automerge for peer-to-peer conflict-free offline synchronization."),
        ("Multimodal Live Voice AI:", "Real-time voice-to-diagram generation using Gemini Multimodal Live API."),
        ("Vector SVG / PDF Export:", "Lossless high-resolution vector export embedding AI metadata tags."),
        ("Repository & Live Demo:", "https://whiteboard-io-1.onrender.com")
    ]

    for b_bold, b_text in future_scope:
        add_bullet_point(tf_c2, b_bold, b_text, font_size=9.2, dark_mode=True, space_after=3)

    add_footer(slide, 16, 16, dark_mode=True)
    add_speaker_notes(
        slide,
        "In conclusion, Whiteboard.io proves that high-performance real-time collaboration, peer-to-peer voice streaming, "
        "and resilient AI synthesis can be implemented completely using modern open web standards. The project was designed, "
        "built, tested, and deployed to production as part of my Master's Minor Project under the mentorship of Assistant Professor "
        "Amitesh Kumar Jha. Thank you for your time, and I am now ready for questions and technical discussion."
    )


# ==============================================================================
# MAIN GENERATION ENTRYPOINT
# ==============================================================================

def main():
    print("Initializing Whiteboard.io Technical Presentation Deck Generator...")
    prs = create_deck()

    print("Building Slide 1: Title Slide & Academic Credentials (Dark)...")
    build_slide_1_title(prs)

    print("Building Slide 2: Project Motivation & Why We Built Whiteboard.io...")
    build_slide_2_motivation_why(prs)

    print("Building Slide 3: Concrete Objectives & Deliverables (What We Built)...")
    build_slide_3_what_we_built(prs)

    print("Building Slide 4: Technology Stack & Architectural Justification...")
    build_slide_4_tech_stack_rationale(prs)

    print("Building Slide 5: System Architecture Design (with Diagram)...")
    build_slide_5_system_architecture(prs)

    print("Building Slide 6: Canvas Mechanics & Coordinate Transformations...")
    build_slide_6_canvas_mechanics(prs)

    print("Building Slide 7: Mathematical Optimizations (Spatial Index & RDP)...")
    build_slide_7_algorithms_optimization(prs)

    print("Building Slide 8: Real-Time Event Synchronization & Dataflow (with Diagram)...")
    build_slide_8_dataflow_pipeline(prs)

    print("Building Slide 9: Native WebRTC Voice Mesh Implementation...")
    build_slide_9_webrtc_voice(prs)

    print("Building Slide 10: Multi-Engine AI Synthesis & Failover (with Diagram)...")
    build_slide_10_ai_resilience(prs)

    print("Building Slide 11: Database Architecture & Document Modeling (with Diagram)...")
    build_slide_11_database_schemas(prs)

    print("Building Slide 12: Security & Room Governance Implementation...")
    build_slide_12_security_governance(prs)

    print("Building Slide 13: Codebase Structure & Key Modules Walkthrough...")
    build_slide_13_codebase_structure(prs)

    print("Building Slide 14: Automated Testing Suites & CI/CD Verification...")
    build_slide_14_testing_qa(prs)

    print("Building Slide 15: Empirical Results & Performance Benchmarks...")
    build_slide_15_results_benchmarks(prs)

    print("Building Slide 16: Project Conclusion & Defense Q&A (Dark)...")
    build_slide_16_conclusion(prs)

    prs.save(OUTPUT_PPTX)
    file_size = os.path.getsize(OUTPUT_PPTX) / 1024
    print(f"Successfully saved {OUTPUT_PPTX} (Total Slides: {len(prs.slides)}, File Size: {file_size:.2f} KB)")


if __name__ == "__main__":
    main()
