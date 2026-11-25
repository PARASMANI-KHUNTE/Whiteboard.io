"""
Whiteboard.io - Concise 10-Slide Visual Overview & Architecture Deck Generator
Generates `docs/Whiteboard_io_Presentation.pptx` using project docs (`docs/`) and
current repository capabilities with high-DPI flowcharts, diagrams, and minimal text.
"""

import os
import tempfile
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor

TOOLING_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.dirname(TOOLING_DIR)
OUTPUT_PPTX = os.path.join(DOCS_DIR, "Whiteboard_io_Presentation.pptx")

TOTAL_SLIDES = 10

# Color tokens
BG_DARK = RGBColor(11, 19, 43)           # #0B132B
CARD_DARK = RGBColor(19, 30, 58)         # #131E3A
CARD_DARK_ALT = RGBColor(26, 40, 74)     # #1A284A
BORDER_DARK = RGBColor(44, 66, 112)      # #2C4270

BG_LIGHT = RGBColor(248, 250, 252)       # #F8FAFC
CARD_LIGHT = RGBColor(255, 255, 255)     # #FFFFFF
CARD_TINT = RGBColor(241, 245, 249)      # #F1F5F9
BORDER_LIGHT = RGBColor(226, 232, 240)   # #E2E8F0

TEXT_LIGHT = RGBColor(248, 250, 252)     # #F8FAFC
TEXT_LIGHT_SUB = RGBColor(186, 230, 253) # #BAE6FD
TEXT_DARK_TITLE = RGBColor(15, 23, 42)   # #0F172A
TEXT_DARK_BODY = RGBColor(51, 65, 85)    # #334155
TEXT_MUTED = RGBColor(100, 116, 139)     # #64748B
TEXT_DARK_MUTED = RGBColor(148, 163, 184)

BLUE = RGBColor(37, 99, 235)             # #2563EB
BLUE_SOFT = RGBColor(239, 246, 255)      # #EFF6FF
CYAN = RGBColor(6, 182, 212)             # #06B6D4
CYAN_SOFT = RGBColor(236, 254, 255)      # #ECFEFF
EMERALD = RGBColor(16, 185, 129)         # #10B981
EMERALD_SOFT = RGBColor(236, 253, 245)   # #ECFDF5
PURPLE = RGBColor(124, 58, 237)          # #7C3AED
PURPLE_SOFT = RGBColor(245, 243, 255)    # #F5F3FF
AMBER = RGBColor(217, 119, 6)            # #D97706
AMBER_SOFT = RGBColor(255, 251, 235)     # #FFFBEB
ROSE = RGBColor(225, 29, 72)             # #E11D48
ROSE_SOFT = RGBColor(255, 241, 242)      # #FFF1F2

FONT_MAIN = "Segoe UI"


def init_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    return prs


def blank_slide(prs, bg_color):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg.fill.solid()
    bg.fill.fore_color.rgb = bg_color
    bg.line.fill.background()
    return slide


def add_pill(slide, left, top, width, height, text, fill_color, text_color, border_color=None, font_size=9.5, bold=True):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.adjustments[0] = 0.45
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_color
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.width = Pt(1)
    else:
        shape.line.fill.background()
    tf = shape.text_frame
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = False
    tf.margin_left = Pt(6)
    tf.margin_right = Pt(6)
    tf.margin_top = Pt(0)
    tf.margin_bottom = Pt(0)
    p = tf.paragraphs[0]
    p.text = text
    p.font.name = FONT_MAIN
    p.font.size = Pt(font_size)
    p.font.bold = bold
    p.font.color.rgb = text_color
    p.alignment = PP_ALIGN.CENTER
    return shape


def add_card(slide, left, top, width, height, fill_color=CARD_LIGHT, border_color=BORDER_LIGHT, radius=0.06, border_width=1):
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.adjustments[0] = radius
    card.fill.solid()
    card.fill.fore_color.rgb = fill_color
    if border_color:
        card.line.color.rgb = border_color
        card.line.width = Pt(border_width)
    else:
        card.line.fill.background()
    return card


def add_text_box(slide, left, top, width, height, text="", font_size=11, color=TEXT_DARK_BODY, bold=False, align=PP_ALIGN.LEFT):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = Pt(0)
    tf.margin_right = Pt(0)
    tf.margin_top = Pt(0)
    tf.margin_bottom = Pt(0)
    p = tf.paragraphs[0]
    p.text = text
    p.font.name = FONT_MAIN
    p.font.size = Pt(font_size)
    p.font.bold = bold
    p.font.color.rgb = color
    p.alignment = align
    return tf


def add_header(slide, badge, title, subtitle, dark=False):
    add_pill(
        slide,
        Inches(0.65),
        Inches(0.32),
        Inches(2.6),
        Inches(0.30),
        badge.upper(),
        RGBColor(26, 48, 96) if dark else BLUE_SOFT,
        CYAN if dark else BLUE,
        border_color=BORDER_DARK if dark else RGBColor(191, 219, 254),
        font_size=8.5,
    )
    add_text_box(
        slide,
        Inches(0.65),
        Inches(0.68),
        Inches(12.03),
        Inches(0.45),
        title,
        font_size=22,
        color=TEXT_LIGHT if dark else TEXT_DARK_TITLE,
        bold=True,
    )
    add_text_box(
        slide,
        Inches(0.65),
        Inches(1.13),
        Inches(12.03),
        Inches(0.28),
        subtitle,
        font_size=10.5,
        color=TEXT_DARK_MUTED if dark else TEXT_MUTED,
    )
    divider = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.65), Inches(1.46), Inches(12.03), Inches(0.015))
    divider.fill.solid()
    divider.fill.fore_color.rgb = BORDER_DARK if dark else BORDER_LIGHT
    divider.line.fill.background()


def add_footer(slide, page_num, dark=False):
    divider = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.65), Inches(6.95), Inches(12.03), Inches(0.012))
    divider.fill.solid()
    divider.fill.fore_color.rgb = BORDER_DARK if dark else BORDER_LIGHT
    divider.line.fill.background()

    muted = TEXT_DARK_MUTED if dark else TEXT_MUTED
    accent = CYAN if dark else BLUE
    add_text_box(slide, Inches(0.65), Inches(7.02), Inches(4.5), Inches(0.3), "Whiteboard.io  •  Project Overview", font_size=8.5, color=muted)
    add_text_box(slide, Inches(4.6), Inches(7.02), Inches(4.1), Inches(0.3), "whiteboard-io-1.onrender.com", font_size=8.5, color=accent, bold=True, align=PP_ALIGN.CENTER)
    add_text_box(slide, Inches(10.7), Inches(7.02), Inches(1.98), Inches(0.3), f"{page_num} / {TOTAL_SLIDES}", font_size=8.5, color=muted, bold=True, align=PP_ALIGN.RIGHT)


def add_arrow(slide, left, top, width, height, color=BLUE, direction="right"):
    shape_type = {
        "right": MSO_SHAPE.RIGHT_ARROW,
        "down": MSO_SHAPE.DOWN_ARROW,
        "left": MSO_SHAPE.LEFT_ARROW,
        "up": MSO_SHAPE.UP_ARROW,
    }[direction]
    arrow = slide.shapes.add_shape(shape_type, left, top, width, height)
    arrow.fill.solid()
    arrow.fill.fore_color.rgb = color
    arrow.line.fill.background()
    return arrow


# ==============================================================================
# CUSTOM CLEAN HIGH-DPI DIAGRAMS (rendered into temp dir, embedded directly)
# ==============================================================================

def render_architecture_diagram(path):
    plt.rcParams["font.sans-serif"] = "Segoe UI"
    fig, ax = plt.subplots(figsize=(11.8, 4.45), dpi=300)
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 5.4)
    ax.axis("off")
    fig.patch.set_facecolor("#FFFFFF")

    def box(x, y, w, h, fc, ec, title="", subtitle="", tc="#0F172A", lw=1.5, title_y=None):
        patch = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.06,rounding_size=0.12", facecolor=fc, edgecolor=ec, linewidth=lw)
        ax.add_patch(patch)
        if title and subtitle:
            ty = title_y if title_y is not None else y + h * 0.65
            ax.text(x + w / 2, ty, title, ha="center", va="center", fontsize=8.6, fontweight="bold", color=tc)
            ax.text(x + w / 2, y + h * 0.30, subtitle, ha="center", va="center", fontsize=7.3, color="#334155")
        elif title:
            ax.text(x + w / 2, y + h / 2, title, ha="center", va="center", fontsize=8.8, fontweight="bold", color=tc)

    # Tier 1: Client Browser
    box(0.2, 3.85, 11.6, 1.35, "#EFF6FF", "#2563EB", lw=1.8)
    ax.text(6.0, 4.98, "CLIENT TIER  •  React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4", ha="center", va="center", fontsize=9.5, fontweight="bold", color="#1D4ED8")
    box(0.45, 4.02, 2.55, 0.72, "#FFFFFF", "#60A5FA", "Canvas 2D Engine", "RDP Simplify + 2D Spatial Index")
    box(3.30, 4.02, 2.55, 0.72, "#FFFFFF", "#60A5FA", "Hooks & Continuity", "useSocket, useAuth, soloStorage")
    box(6.15, 4.02, 2.55, 0.72, "#FFFFFF", "#60A5FA", "WebRTC Voice Mesh", "AudioContext + Speaking Halos")
    box(9.00, 4.02, 2.55, 0.72, "#FFFFFF", "#60A5FA", "AI Chat & Exporter", "Diff Highlight + PNG/SVG/JSON")

    # Bridge Labels (REST + WebSockets)
    ax.annotate("", xy=(3.4, 3.12), xytext=(3.4, 3.82), arrowprops=dict(arrowstyle="<->", color="#2563EB", lw=2.0))
    ax.text(3.4, 3.47, "HTTP / REST JSON\n(Auth, Rooms, AI API)", ha="center", va="center", fontsize=7.4, fontweight="bold", color="#1E40AF",
            bbox=dict(boxstyle="round,pad=0.2", fc="#FFFFFF", ec="#93C5FD", lw=1.0))

    ax.annotate("", xy=(8.6, 3.12), xytext=(8.6, 3.82), arrowprops=dict(arrowstyle="<->", color="#059669", lw=2.0))
    ax.text(8.6, 3.47, "Socket.io WebSocket\n(Live Sync & Signaling)", ha="center", va="center", fontsize=7.4, fontweight="bold", color="#047857",
            bbox=dict(boxstyle="round,pad=0.2", fc="#FFFFFF", ec="#6EE7B7", lw=1.0))

    # Tier 2: Backend Server
    box(0.2, 1.70, 11.6, 1.40, "#ECFDF5", "#10B981", lw=1.8)
    ax.text(6.0, 2.90, "BACKEND TIER  •  Node.js 20+, Express 4, Socket.io 4.8", ha="center", va="center", fontsize=9.5, fontweight="bold", color="#047857")
    box(0.45, 1.88, 3.45, 0.76, "#FFFFFF", "#34D399", "Express REST & Security", "PBKDF2 Auth, OAuth 2.0, AI Shield")
    box(4.28, 1.88, 3.45, 0.76, "#D1FAE5", "#059669", "In-Memory Room Map", "Map<roomId, RoomData> + Votes", tc="#065F46")
    box(8.10, 1.88, 3.45, 0.76, "#FFFFFF", "#34D399", "Socket.io Gateway", "Room Isolation, Governance & Lock")

    # Bottom Connectors
    ax.annotate("", xy=(3.1, 1.08), xytext=(3.1, 1.68), arrowprops=dict(arrowstyle="<->", color="#D97706", lw=2.0))
    ax.text(3.1, 1.38, "Debounced Write (500ms)", ha="center", va="center", fontsize=7.3, fontweight="bold", color="#92400E",
            bbox=dict(boxstyle="round,pad=0.18", fc="#FFFFFF", ec="#FCD34D", lw=1.0))

    ax.annotate("", xy=(8.9, 1.08), xytext=(8.9, 1.68), arrowprops=dict(arrowstyle="<->", color="#7C3AED", lw=2.0))
    ax.text(8.9, 1.38, "Failover Chain & Context", ha="center", va="center", fontsize=7.3, fontweight="bold", color="#6B21A8",
            bbox=dict(boxstyle="round,pad=0.18", fc="#FFFFFF", ec="#D8B4FE", lw=1.0))

    # Tier 3: Database + AI
    box(0.2, 0.15, 5.5, 0.90, "#FFFBEB", "#D97706", "PERSISTENCE  •  MongoDB 7 Driver + IndexedDB",
        "users (7d Guest TTL)  |  tokens (30d TTL)  |  rooms  |  elements  |  soloStorage", tc="#B45309", lw=1.8, title_y=0.76)

    box(6.3, 0.15, 5.5, 0.90, "#F5F3FF", "#7C3AED", "AI ENGINES  •  Cloud Providers + Local Ollama",
        "Gemini 3.8  •  Groq  •  OpenRouter  •  DeepSeek  •  NVIDIA NIM  •  Ollama  •  Procedural", tc="#6D28D9", lw=1.8, title_y=0.76)

    plt.tight_layout(pad=0.2)
    plt.savefig(path, dpi=300, facecolor=fig.get_facecolor())
    plt.close()


def render_ai_pipeline_diagram(path):
    plt.rcParams["font.sans-serif"] = "Segoe UI"
    fig, ax = plt.subplots(figsize=(11.8, 4.35), dpi=300)
    ax.set_xlim(0, 12.2)
    ax.set_ylim(0, 5.5)
    ax.axis("off")
    fig.patch.set_facecolor("#FFFFFF")

    def node(x, y, w, h, fc, ec, title, sub, tc="#0F172A"):
        p = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.06,rounding_size=0.12", facecolor=fc, edgecolor=ec, linewidth=1.6)
        ax.add_patch(p)
        ax.text(x + w / 2, y + h * 0.66, title, ha="center", va="center", fontsize=8.4, fontweight="bold", color=tc)
        ax.text(x + w / 2, y + h * 0.28, sub, ha="center", va="center", fontsize=7.2, color="#334155")

    # Top row flow: Prompt -> Rate Limit -> Cache -> Pacing Queue -> Switcher
    steps = [
        (0.2, 3.55, 2.05, 1.35, "#EEF2FF", "#4F46E5", "1. Prompt + Context", "Chat instruction +\nglobal session ledger", "#3730A3"),
        (2.65, 3.55, 2.05, 1.35, "#FFFBEB", "#D97706", "2. IP Rate Limiter", "Token bucket shield\n10 gen / 20 rev / min", "#B45309"),
        (5.10, 3.55, 2.05, 1.35, "#ECFDF5", "#10B981", "3. LRU Cache (2h)", "<5ms cache hit on\nrepeated prompts", "#047857"),
        (7.55, 3.55, 2.05, 1.35, "#EFF6FF", "#2563EB", "4. Pacing Queue", "Serial FIFO spacing\nprevents burst 429s", "#1D4ED8"),
        (10.00, 3.55, 2.00, 1.35, "#F5F3FF", "#7C3AED", "5. AI Switcher", "User-selected model\nor Auto failover chain", "#6D28D9"),
    ]
    for s in steps:
        node(*s)

    for i in range(len(steps) - 1):
        x1 = steps[i][0] + steps[i][2] + 0.04
        x2 = steps[i + 1][0] - 0.04
        ax.annotate("", xy=(x2, 4.22), xytext=(x1, 4.22), arrowprops=dict(arrowstyle="->", color="#475569", lw=2.0))

    # Down arrow from Switcher to Providers Matrix / Quality Gate
    ax.annotate("", xy=(11.0, 2.85), xytext=(11.0, 3.50), arrowprops=dict(arrowstyle="->", color="#7C3AED", lw=2.2))

    # Lower band: Provider Failover Matrix -> Quality Gate & Layout -> Socket Batch + Highlight
    # Right side: Provider Failover Box
    node(7.55, 1.40, 4.45, 1.40, "#FAF5FF", "#7C3AED",
         "Cloud Providers -> Local Ollama Failover Chain",
         "Gemini 3.8  •  Groq  •  OpenRouter  •  DeepSeek  •  NVIDIA NIM\nCooldown circuit breaker (404/503) -> Local Ollama (llama3.2)", "#5B21B6")

    # Center-left: Quality Gate & Layout
    node(3.85, 1.40, 3.20, 1.40, "#ECFEFF", "#0891B2",
         "Quality Gate & Graph Layout",
         "Validates JSON nodes & edges\nSugiyama DAG  |  Radial  |  Swimlanes", "#0E7490")

    # Far left: Board Output
    node(0.20, 1.40, 3.15, 1.40, "#ECFDF5", "#059669",
         "Board Output & Highlight",
         "Batch Socket.io emit + Undo/Redo\nAuto-frame & pulse new elements", "#047857")

    ax.annotate("", xy=(7.10, 2.10), xytext=(7.50, 2.10), arrowprops=dict(arrowstyle="->", color="#0891B2", lw=2.2))
    ax.annotate("", xy=(3.40, 2.10), xytext=(3.80, 2.10), arrowprops=dict(arrowstyle="->", color="#059669", lw=2.2))

    # Bottom Layer 5: Offline Procedural Fallback Shield
    node(3.85, 0.15, 8.15, 0.88, "#FFF1F2", "#E11D48",
         "Layer 5 Failsafe: Offline Procedural Synthesis Engine (0% Hard Failure Rate)",
         "If all cloud keys quota-exhaust & Ollama is offline -> generates clean connected fallback diagram automatically", "#9F1239")

    # Arrows connecting Switcher/Providers to Procedural Fallback & Layout (cleanly routed in open gaps)
    ax.annotate("", xy=(9.75, 1.06), xytext=(9.75, 1.37), arrowprops=dict(arrowstyle="->", color="#E11D48", lw=1.8, ls="--"))
    ax.text(10.65, 1.21, "All fail", ha="center", va="center", fontsize=7.3, fontweight="bold", color="#BE123C")
    ax.annotate("", xy=(5.45, 1.37), xytext=(5.45, 1.06), arrowprops=dict(arrowstyle="->", color="#059669", lw=1.8, ls="--"))

    plt.tight_layout(pad=0.2)
    plt.savefig(path, dpi=300, facecolor=fig.get_facecolor())
    plt.close()


def render_db_schema_diagram(path):
    plt.rcParams["font.sans-serif"] = "Segoe UI"
    fig, ax = plt.subplots(figsize=(11.8, 4.35), dpi=300)
    ax.set_xlim(0, 12.2)
    ax.set_ylim(0, 5.4)
    ax.axis("off")
    fig.patch.set_facecolor("#FFFFFF")

    def card(x, y, w, h, fc, ec, title, lines, tc):
        p = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.06,rounding_size=0.12", facecolor=fc, edgecolor=ec, linewidth=1.6)
        ax.add_patch(p)
        ax.text(x + 0.16, y + h - 0.28, title, ha="left", va="center", fontsize=8.8, fontweight="bold", color=tc)
        ax.text(x + 0.16, y + (h - 0.48) / 2, lines, ha="left", va="center", fontsize=7.4, color="#1E293B", linespacing=1.35)

    # Left 4 MongoDB collections (generous 1.1 spacing in middle!)
    card(0.20, 2.95, 3.45, 2.20, "#F0F9FF", "#0284C7",
         "Collection: users",
         "• id: UUID (unique index)\n• username, email (indexed)\n• passwordHash + 16B salt (PBKDF2)\n• isGuest (TTL auto-expire: 7 days)\n• googleId, createdRooms[]", "#0369A1")

    card(4.85, 3.15, 3.25, 2.00, "#ECFDF5", "#059669",
         "Collection: tokens",
         "• token: 32B hex (unique)\n• userId -> users.id\n• createdAt (30-day TTL)\n• updatedAt (sliding expiry)", "#047857")

    card(0.20, 0.25, 3.45, 2.05, "#FFFBEB", "#D97706",
         "Collection: rooms",
         "• id: roomCode (unique)\n• name, creatorId, creatorName\n• createdAt timestamp\n• isLocked (host lock mode)", "#B45309")

    card(4.85, 0.25, 3.25, 2.05, "#F5F3FF", "#7C3AED",
         "Collection: elements & room_elements",
         "• roomId + elementId compound index\n• data: stroke | shape | sticky | wire\n• 500ms debounced cloud sync\n• Instant flush on clear / delete", "#6D28D9")

    # Right panel: Client Local Storage Continuity
    card(8.65, 0.25, 3.35, 4.90, "#FFFFFF", "#475569",
         "Client Persistence Layer",
         "1. soloStorage.ts\n   IndexedDB + localStorage fallback\n   450ms autosave + cross-tab\n   BroadcastChannel merge\n\n2. guestIdentity.ts\n   Stable UUID, name & color\n\n3. recentRooms.ts\n   1-click LRU room history\n\n4. aiSessionStorage.ts\n   AI chat history + global\n   diagram ledger per board", "#0F172A")

    # Arrows placed cleanly in open whitespace gaps
    ax.annotate("", xy=(4.80, 4.15), xytext=(3.70, 4.15), arrowprops=dict(arrowstyle="->", color="#0284C7", lw=1.8, ls="--"))
    ax.text(4.25, 4.42, "1 : N\nuserId", ha="center", va="center", fontsize=7.2, fontweight="bold", color="#0369A1")

    ax.annotate("", xy=(1.92, 2.34), xytext=(1.92, 2.91), arrowprops=dict(arrowstyle="->", color="#D97706", lw=1.8, ls="--"))
    ax.text(2.58, 2.63, "1 : N  creatorId", ha="center", va="center", fontsize=7.2, fontweight="bold", color="#B45309")

    ax.annotate("", xy=(4.80, 1.25), xytext=(3.70, 1.25), arrowprops=dict(arrowstyle="->", color="#7C3AED", lw=1.8, ls="--"))
    ax.text(4.25, 1.52, "1 : N\nroomId", ha="center", va="center", fontsize=7.2, fontweight="bold", color="#6D28D9")

    plt.tight_layout(pad=0.2)
    plt.savefig(path, dpi=300, facecolor=fig.get_facecolor())
    plt.close()


# ==============================================================================
# 10 SLIDE BUILDERS
# ==============================================================================

def build_slide_1_cover(prs):
    slide = blank_slide(prs, BG_DARK)

    # Outer glow card
    add_card(slide, Inches(0.65), Inches(0.55), Inches(12.03), Inches(6.20), fill_color=CARD_DARK, border_color=BORDER_DARK, radius=0.04, border_width=1.5)

    # Top project pill
    add_pill(slide, Inches(1.10), Inches(0.95), Inches(3.75), Inches(0.34), "REAL-TIME COLLABORATIVE PLATFORM", RGBColor(30, 58, 138), CYAN, border_color=BLUE, font_size=8.5)

    # Big Title + Concise Tagline
    add_text_box(slide, Inches(1.10), Inches(1.42), Inches(11.1), Inches(0.80), "Whiteboard.io", font_size=42, color=TEXT_LIGHT, bold=True)
    add_text_box(
        slide,
        Inches(1.10),
        Inches(2.22),
        Inches(10.8),
        Inches(0.65),
        "Infinite Collaborative Canvas  •  Peer-to-Peer WebRTC Voice  •  Multi-Provider Generative AI",
        font_size=15,
        color=TEXT_LIGHT_SUB,
    )

    # Native Mini Architecture Flowchart Strip on Hero Slide
    flow_y = Inches(3.15)
    flow_nodes = [
        ("HTML5 Canvas 2D", "Infinite World & Tools", BLUE, RGBColor(23, 37, 84)),
        ("Socket.io Gateway", "<50ms Live Sync", EMERALD, RGBColor(6, 78, 59)),
        ("WebRTC Audio Mesh", "P2P Opus + Halo", CYAN, RGBColor(22, 78, 99)),
        ("6 AI Providers + Ollama", "Flowcharts & Chat", PURPLE, RGBColor(59, 7, 100)),
        ("MongoDB + Multi Export", "PNG / SVG / JSON", AMBER, RGBColor(120, 53, 15)),
    ]
    node_w = Inches(2.02)
    node_h = Inches(0.92)
    gap = Inches(0.28)
    start_x = Inches(1.10)
    for idx, (t, sub, accent, bg_c) in enumerate(flow_nodes):
        x = start_x + idx * (node_w + gap)
        c = add_card(slide, x, flow_y, node_w, node_h, fill_color=bg_c, border_color=accent, radius=0.14, border_width=1.4)
        add_text_box(slide, x + Inches(0.1), flow_y + Inches(0.16), node_w - Inches(0.2), Inches(0.28), t, font_size=10.5, color=TEXT_LIGHT, bold=True, align=PP_ALIGN.CENTER)
        add_text_box(slide, x + Inches(0.1), flow_y + Inches(0.46), node_w - Inches(0.2), Inches(0.30), sub, font_size=9, color=TEXT_DARK_MUTED, align=PP_ALIGN.CENTER)
        if idx < len(flow_nodes) - 1:
            add_arrow(slide, x + node_w + Inches(0.05), flow_y + Inches(0.36), Inches(0.18), Inches(0.20), color=accent)

    # Bottom 4 Key Metric Cards
    kpis = [
        ("< 50 ms", "Multiplayer Sync Latency", BLUE),
        ("6 + Local", "AI Providers (Gemini, Groq, Ollama)", PURPLE),
        ("5 Formats", "Live Preview Export (PNG/SVG/JSON)", CYAN),
        ("204 Tests", "Verified on TypeScript & Node", EMERALD),
    ]
    kw = Inches(2.60)
    kh = Inches(1.45)
    for idx, (val, label, accent) in enumerate(kpis):
        x = Inches(1.10) + idx * Inches(2.84)
        y = Inches(4.55)
        add_card(slide, x, y, kw, kh, fill_color=CARD_DARK_ALT, border_color=BORDER_DARK, radius=0.10)
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x + Inches(0.22), y + Inches(0.18), Inches(0.55), Inches(0.06))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()
        add_text_box(slide, x + Inches(0.22), y + Inches(0.32), kw - Inches(0.44), Inches(0.48), val, font_size=22, color=TEXT_LIGHT, bold=True)
        add_text_box(slide, x + Inches(0.22), y + Inches(0.84), kw - Inches(0.44), Inches(0.45), label, font_size=10, color=TEXT_DARK_MUTED)

    # Metadata bar inside cover bottom
    add_text_box(
        slide,
        Inches(1.10),
        Inches(6.22),
        Inches(11.1),
        Inches(0.35),
        "By Parasmani Khunte  •  Live Demo: https://whiteboard-io-1.onrender.com  •  Open Source (MIT)",
        font_size=10,
        color=TEXT_DARK_MUTED,
        align=PP_ALIGN.CENTER,
    )
    add_footer(slide, 1, dark=True)


def build_slide_2_tech_stack(prs):
    slide = blank_slide(prs, BG_LIGHT)
    add_header(slide, "Technology Stack", "Technologies Powering Whiteboard.io", "Open web standards + modern TypeScript monorepo across client, server, voice, DB, and AI")

    # 4 clean horizontal stacked tier rows (left) + visual stack-flow bridge (right)
    tiers = [
        ("FRONTEND UI", BLUE, BLUE_SOFT, [
            ("React 19", "^19.0.1"), ("TypeScript", "~5.8.2"), ("Vite", "^6.4.6"),
            ("Tailwind CSS", "^4.1.14"), ("Motion", "^12.23"), ("Lucide Icons", "^0.546"),
        ]),
        ("CANVAS & VOICE MEDIA", CYAN, CYAN_SOFT, [
            ("HTML5 Canvas 2D", "Retina DPI"), ("2D Spatial Index", "O(log N+K)"),
            ("RDP Simplify", "~70% Comp"), ("WebRTC 1.0", "P2P Mesh"), ("Web Audio API", "AnalyserNode"),
        ]),
        ("BACKEND & REAL-TIME", EMERALD, EMERALD_SOFT, [
            ("Node.js", ">=20.19"), ("Express", "^4.22.3"), ("Socket.io", "^4.8.3"),
            ("PBKDF2-SHA512", "100k Iter"), ("Google OAuth 2.0", "Nonce CSRF"),
        ]),
        ("DATABASE & AI ENGINES", PURPLE, PURPLE_SOFT, [
            ("MongoDB", "^7.6.0"), ("IndexedDB", "Solo Cache"),
            ("Gemini", "3.8 / 3.6"), ("Groq / OR", "Cloud API"),
            ("DeepSeek / NIM", "Cloud AI"), ("Ollama", "Local LLM"),
        ]),
    ]

    for idx, (name, accent, tint, pills) in enumerate(tiers):
        y = Inches(1.65) + idx * Inches(1.30)
        add_card(slide, Inches(0.65), y, Inches(8.55), Inches(1.14), fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
        strip = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.65), y, Inches(0.10), Inches(1.14))
        strip.fill.solid()
        strip.fill.fore_color.rgb = accent
        strip.line.fill.background()

        add_text_box(slide, Inches(0.92), y + Inches(0.12), Inches(6.0), Inches(0.24), name, font_size=10, color=accent, bold=True)

        px = Inches(0.92)
        py = y + Inches(0.45)
        for label, ver in pills:
            w = Inches(max(1.06, max(len(label), len(ver)) * 0.082 + 0.28))
            if px + w > Inches(9.08):
                continue
            add_pill(slide, px, py, w, Inches(0.50), f"{label}\n{ver}", tint, TEXT_DARK_TITLE, border_color=BORDER_LIGHT, font_size=8.0, bold=False)
            px += w + Inches(0.08)

    # Right column: Build, Test & Runtime Stack Bridge Diagram
    add_card(slide, Inches(9.45), Inches(1.65), Inches(3.23), Inches(5.05), fill_color=CARD_TINT, border_color=BORDER_LIGHT)
    add_text_box(slide, Inches(9.65), Inches(1.80), Inches(2.83), Inches(0.30), "DEV & CI PIPELINE", font_size=10.5, color=BLUE, bold=True, align=PP_ALIGN.CENTER)

    pipeline = [
        ("Shared Types + Hooks", "Strict TS (strict: true)", BLUE),
        ("esbuild + Vite Bundles", "253KB Server | Chunked UI", CYAN),
        ("204 Automated Tests", "node:test + tsx runner", EMERALD),
        ("GitHub Actions + Python", "CI Verify + Secret Scan", PURPLE),
        ("Render Cloud Monolith", "Static UI + Socket Server", AMBER),
    ]
    for idx, (t, sub, acc) in enumerate(pipeline):
        cy = Inches(2.22) + idx * Inches(0.88)
        add_card(slide, Inches(9.72), cy, Inches(2.69), Inches(0.62), fill_color=CARD_LIGHT, border_color=acc, border_width=1.2)
        add_text_box(slide, Inches(9.84), cy + Inches(0.08), Inches(2.45), Inches(0.24), t, font_size=9.5, color=TEXT_DARK_TITLE, bold=True, align=PP_ALIGN.CENTER)
        add_text_box(slide, Inches(9.84), cy + Inches(0.33), Inches(2.45), Inches(0.22), sub, font_size=8.2, color=TEXT_MUTED, align=PP_ALIGN.CENTER)
        if idx < len(pipeline) - 1:
            add_arrow(slide, Inches(10.97), cy + Inches(0.64), Inches(0.20), Inches(0.21), color=acc, direction="down")

    add_footer(slide, 2)


def build_slide_3_features(prs):
    slide = blank_slide(prs, BG_LIGHT)
    add_header(slide, "Core Features", "Platform Capabilities at a Glance", "Six unified subsystems engineered for visual collaboration without switching apps")

    features = [
        ("Canvas 2D Toolset", BLUE, BLUE_SOFT, [
            "Pen, highlighter, shapes, stickies, text, icons",
            "Elastic cubic wires with smart anchor snapping",
            "Multi-select, group move, rotation, lock & z-order",
        ]),
        ("Real-Time Collaboration", EMERALD, EMERALD_SOFT, [
            "Optimistic draw (<5ms local) + Socket.io sync",
            "Live remote cursors, user tool & color tags",
            "Sidebar controls & auto-hiding onboarding hint",
        ]),
        ("Multi-Engine AI & Chat", PURPLE, PURPLE_SOFT, [
            "Switch providers live: Gemini, Groq, DeepSeek, Ollama",
            "4 topologies: Mind Map, Flowchart, Kanban, Arch",
            "AI Chat follow-up diffs + auto-highlight on canvas",
        ]),
        ("P2P WebRTC Voice Chat", CYAN, CYAN_SOFT, [
            "Direct browser-to-browser Opus audio mesh",
            "Speaking volume rings pulsing on live cursors",
            "Mute, deafen, visualizer bar & simulation fallback",
        ]),
        ("Security & Governance", AMBER, AMBER_SOFT, [
            "PBKDF2 auth, Google OAuth 2.0, 7d TTL guests",
            "Host controls: view lock, permissions, kick, auto-host",
            "15s Vote-to-Clear prevents accidental board wipes",
        ]),
        ("Export Preview & Offline", ROSE, ROSE_SOFT, [
            "Live preview dialog with bounds & scale (1x–3x)",
            "5 formats: PNG, SVG vector, JPEG, WebP & JSON",
            "Solo IndexedDB autosave + cross-tab merge",
        ]),
    ]

    cw = Inches(3.82)
    ch = Inches(2.42)
    for idx, (title, accent, tint, points) in enumerate(features):
        col = idx % 3
        row = idx // 3
        x = Inches(0.65) + col * Inches(4.10)
        y = Inches(1.66) + row * Inches(2.60)

        add_card(slide, x, y, cw, ch, fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
        # Top colored accent bar
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, cw, Inches(0.08))
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        # Badge chip
        add_pill(slide, x + Inches(0.20), y + Inches(0.22), Inches(0.42), Inches(0.42), f"0{idx+1}", tint, accent, border_color=accent, font_size=11)
        add_text_box(slide, x + Inches(0.72), y + Inches(0.26), cw - Inches(0.92), Inches(0.35), title, font_size=13, color=TEXT_DARK_TITLE, bold=True)

        tf = add_text_box(slide, x + Inches(0.22), y + Inches(0.78), cw - Inches(0.44), Inches(1.50), "", font_size=9.8, color=TEXT_DARK_BODY)
        tf.paragraphs[0].text = "•  " + points[0]
        tf.paragraphs[0].space_after = Pt(7)
        for pt_text in points[1:]:
            p = tf.add_paragraph()
            p.text = "•  " + pt_text
            p.font.name = FONT_MAIN
            p.font.size = Pt(9.8)
            p.font.color.rgb = TEXT_DARK_BODY
            p.space_after = Pt(7)

    add_footer(slide, 3)


def build_slide_4_architecture(prs, arch_img_path):
    slide = blank_slide(prs, BG_LIGHT)
    add_header(slide, "System Architecture", "Three-Tier Real-Time & Persistence Architecture", "Decoupled React Canvas frontend, event-driven Node/Socket gateway, MongoDB storage & AI tier")

    # Main high-DPI diagram
    add_card(slide, Inches(0.65), Inches(1.58), Inches(12.03), Inches(4.42), fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    slide.shapes.add_picture(arch_img_path, Inches(0.85), Inches(1.66), height=Inches(4.26))

    # Bottom 3 compact callout pills
    callouts = [
        ("REST Gateway", "Express routes handle auth, OAuth nonce state, rooms & AI config", BLUE, BLUE_SOFT),
        ("In-Memory Room Isolation", "Map<roomId, RoomData> delivers instant fan-out across rooms", EMERALD, EMERALD_SOFT),
        ("Async DB & AI Decoupling", "500ms debounced persistence + non-blocking multi-engine AI shield", PURPLE, PURPLE_SOFT),
    ]
    for idx, (t, d, accent, tint) in enumerate(callouts):
        x = Inches(0.65) + idx * Inches(4.10)
        y = Inches(6.10)
        add_card(slide, x, y, Inches(3.82), Inches(0.74), fill_color=tint, border_color=accent, radius=0.12)
        add_text_box(slide, x + Inches(0.16), y + Inches(0.08), Inches(3.50), Inches(0.24), t, font_size=10, color=accent, bold=True)
        add_text_box(slide, x + Inches(0.16), y + Inches(0.32), Inches(3.50), Inches(0.34), d, font_size=8.6, color=TEXT_DARK_BODY)

    add_footer(slide, 4)


def build_slide_5_realtime_flow(prs):
    slide = blank_slide(prs, BG_LIGHT)
    add_header(slide, "Data Flow & Optimization", "Real-Time Drawing Pipeline & Spatial Performance", "Optimistic local rendering, RDP point compression, and O(log N + K) viewport culling")

    # Top Horizontal 6-Step Flowchart (native crisp vector boxes + arrows)
    stages = [
        ("1. Pointer Input", "120Hz mouse / touch\nPointerDown & Move", BLUE, BLUE_SOFT),
        ("2. Local Canvas", "Optimistic draw\n< 5ms latency", BLUE, BLUE_SOFT),
        ("3. Socket Stream", "stroke-live-point\nincremental packets", EMERALD, EMERALD_SOFT),
        ("4. Remote Peers", "Instant stroke playback\n& live cursor halo", EMERALD, EMERALD_SOFT),
        ("5. RDP Simplify", "PointerUp decimates\ncollinear pts (-70%)", AMBER, AMBER_SOFT),
        ("6. Persist & Index", "500ms DB debounce +\n2D grid re-index", ROSE, ROSE_SOFT),
    ]
    bw = Inches(1.78)
    bh = Inches(2.10)
    gap = Inches(0.27)
    top_y = Inches(1.75)

    for idx, (title, sub, accent, tint) in enumerate(stages):
        x = Inches(0.65) + idx * (bw + gap)
        add_card(slide, x, top_y, bw, bh, fill_color=tint, border_color=accent, radius=0.10, border_width=1.5)
        add_pill(slide, x + Inches(0.22), top_y + Inches(0.22), bw - Inches(0.44), Inches(0.34), title, accent, TEXT_LIGHT, font_size=9.2)
        add_text_box(slide, x + Inches(0.14), top_y + Inches(0.78), bw - Inches(0.28), Inches(1.10), sub, font_size=9.5, color=TEXT_DARK_TITLE, align=PP_ALIGN.CENTER)
        if idx < len(stages) - 1:
            add_arrow(slide, x + bw + Inches(0.04), top_y + Inches(0.92), Inches(0.19), Inches(0.24), color=TEXT_MUTED)

    # Bottom Dual Algorithm Flow Cards
    # Left: 2D Spatial Indexing Flow
    add_card(slide, Inches(0.65), Inches(4.15), Inches(5.85), Inches(2.58), fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    add_text_box(slide, Inches(0.90), Inches(4.32), Inches(5.35), Inches(0.30), "2D SPATIAL GRID INDEX  (O(log N + K) vs O(N))", font_size=11, color=BLUE, bold=True)
    sp_steps = [
        ("Camera Frustum", "Viewport bounds"),
        ("Uniform Grid Query", "Intersecting cells"),
        ("60 FPS Cull & Hit", "Only visible items"),
    ]
    for i, (st, sb) in enumerate(sp_steps):
        sx = Inches(0.90) + i * Inches(1.85)
        add_card(slide, sx, Inches(4.80), Inches(1.55), Inches(0.95), fill_color=BLUE_SOFT, border_color=BLUE, radius=0.12)
        add_text_box(slide, sx + Inches(0.08), Inches(4.94), Inches(1.39), Inches(0.30), st, font_size=9.5, color=BLUE, bold=True, align=PP_ALIGN.CENTER)
        add_text_box(slide, sx + Inches(0.08), Inches(5.26), Inches(1.39), Inches(0.36), sb, font_size=8.6, color=TEXT_DARK_BODY, align=PP_ALIGN.CENTER)
        if i < 2:
            add_arrow(slide, sx + Inches(1.59), Inches(5.16), Inches(0.22), Inches(0.22), color=BLUE)
    add_text_box(slide, Inches(0.90), Inches(6.02), Inches(5.35), Inches(0.50), "Scales smoothly past 2,000+ elements for lasso select, hit-testing, and point/object erasers.", font_size=9.2, color=TEXT_MUTED)

    # Right: Cross-Tab Solo Sync Flow
    add_card(slide, Inches(6.83), Inches(4.15), Inches(5.85), Inches(2.58), fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    add_text_box(slide, Inches(7.08), Inches(4.32), Inches(5.35), Inches(0.30), "OFFLINE SOLO AUTOSAVE & MULTI-TAB MERGE", font_size=11, color=EMERALD, bold=True)
    tab_steps = [
        ("450ms Debounce", "IndexedDB save"),
        ("BroadcastChannel", "Notify open tabs"),
        ("updatedAt Merge", "Zero silent loss"),
    ]
    for i, (st, sb) in enumerate(tab_steps):
        sx = Inches(7.08) + i * Inches(1.85)
        add_card(slide, sx, Inches(4.80), Inches(1.55), Inches(0.95), fill_color=EMERALD_SOFT, border_color=EMERALD, radius=0.12)
        add_text_box(slide, sx + Inches(0.08), Inches(4.94), Inches(1.39), Inches(0.30), st, font_size=9.5, color=EMERALD, bold=True, align=PP_ALIGN.CENTER)
        add_text_box(slide, sx + Inches(0.08), Inches(5.26), Inches(1.39), Inches(0.36), sb, font_size=8.6, color=TEXT_DARK_BODY, align=PP_ALIGN.CENTER)
        if i < 2:
            add_arrow(slide, sx + Inches(1.59), Inches(5.16), Inches(0.22), Inches(0.22), color=EMERALD)
    add_text_box(slide, Inches(7.08), Inches(6.02), Inches(5.35), Inches(0.50), "Solo boards survive browser refreshes offline and upgrade seamlessly to live rooms via Share & Go Live.", font_size=9.2, color=TEXT_MUTED)

    add_footer(slide, 5)


def build_slide_6_ai_pipeline(prs, ai_img_path):
    slide = blank_slide(prs, BG_LIGHT)
    add_header(slide, "Generative AI Engine", "Multi-Provider AI Pipeline & 5-Layer Shield", "Switch cloud/local providers on demand with global session memory, failover, and visual diffs")

    add_card(slide, Inches(0.65), Inches(1.58), Inches(12.03), Inches(4.52), fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    slide.shapes.add_picture(ai_img_path, Inches(0.85), Inches(1.66), height=Inches(4.36))

    highlights = [
        ("6 Selectable Engines", "Gemini • Groq • OpenRouter • DeepSeek • NVIDIA NIM • Local Ollama", PURPLE),
        ("Global Board Context", "Cross-provider turn ledger preserves intent across model switches", BLUE),
        ("Chat Diff Highlight", "AI revisions pan camera to changes and pulse updated elements", EMERALD),
    ]
    for idx, (t, d, accent) in enumerate(highlights):
        x = Inches(0.65) + idx * Inches(4.10)
        y = Inches(6.22)
        add_card(slide, x, y, Inches(3.82), Inches(0.64), fill_color=CARD_TINT, border_color=accent, radius=0.12)
        add_text_box(slide, x + Inches(0.15), y + Inches(0.07), Inches(3.52), Inches(0.22), t, font_size=9.5, color=accent, bold=True)
        add_text_box(slide, x + Inches(0.15), y + Inches(0.30), Inches(3.52), Inches(0.28), d, font_size=8.3, color=TEXT_DARK_BODY)

    add_footer(slide, 6)


def build_slide_7_voice_auth_export(prs):
    slide = blank_slide(prs, BG_LIGHT)
    add_header(slide, "Key Workflows", "WebRTC Audio Mesh, Identity Auth & Export Flows", "Zero external call apps, three-tier cryptographic auth, and live preview multi-format export")

    # Left half: WebRTC Mesh Voice Flowchart (vertical 5 steps)
    add_card(slide, Inches(0.65), Inches(1.65), Inches(5.75), Inches(5.10), fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    add_text_box(slide, Inches(0.90), Inches(1.82), Inches(5.25), Inches(0.32), "P2P WEBRTC VOICE MESH FLOW", font_size=11.5, color=CYAN, bold=True)

    voice_steps = [
        ("1. Mic Capture & Epoch Guard", "getUserMedia + invalidation guard on room leave", CYAN, CYAN_SOFT),
        ("2. Socket.io Signaling Relay", "Exchange SDP offer/answer & ICE candidates", BLUE, BLUE_SOFT),
        ("3. Deterministic Glare Prevention", "Canonical rule (myId > otherId) picks initiator", PURPLE, PURPLE_SOFT),
        ("4. Direct Opus Audio + Recovery", "Sub-20ms P2P stream over STUN/TURN + reconnect grace", EMERALD, EMERALD_SOFT),
        ("5. Web Audio Cursor Halo", "AnalyserNode RMS rings pulse green on remote cursors", AMBER, AMBER_SOFT),
    ]
    for i, (vt, vd, va, vs) in enumerate(voice_steps):
        vy = Inches(2.26) + i * Inches(0.88)
        add_card(slide, Inches(0.92), vy, Inches(5.20), Inches(0.64), fill_color=vs, border_color=va, radius=0.12)
        add_text_box(slide, Inches(1.10), vy + Inches(0.08), Inches(4.85), Inches(0.24), vt, font_size=9.8, color=va, bold=True)
        add_text_box(slide, Inches(1.10), vy + Inches(0.33), Inches(4.85), Inches(0.24), vd, font_size=8.6, color=TEXT_DARK_BODY)
        if i < len(voice_steps) - 1:
            add_arrow(slide, Inches(3.42), vy + Inches(0.66), Inches(0.20), Inches(0.19), color=va, direction="down")

    # Right Top: 3-Tier Auth Security Flow
    add_card(slide, Inches(6.65), Inches(1.65), Inches(6.03), Inches(2.42), fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    add_text_box(slide, Inches(6.90), Inches(1.80), Inches(5.53), Inches(0.30), "MULTI-TIER SECURITY & AUTH WORKFLOW", font_size=11, color=BLUE, bold=True)

    auth_sources = [
        ("Password", "PBKDF2 100k"),
        ("Google OAuth", "HttpOnly Nonce"),
        ("Instant Guest", "7-day TTL"),
    ]
    for i, (at, ab) in enumerate(auth_sources):
        ax_y = Inches(2.22) + i * Inches(0.58)
        add_card(slide, Inches(6.90), ax_y, Inches(1.75), Inches(0.46), fill_color=BLUE_SOFT, border_color=BLUE, radius=0.15)
        add_text_box(slide, Inches(6.98), ax_y + Inches(0.05), Inches(1.59), Inches(0.20), at, font_size=8.8, color=BLUE, bold=True, align=PP_ALIGN.CENTER)
        add_text_box(slide, Inches(6.98), ax_y + Inches(0.24), Inches(1.59), Inches(0.18), ab, font_size=7.6, color=TEXT_DARK_BODY, align=PP_ALIGN.CENTER)

    add_arrow(slide, Inches(8.78), Inches(2.90), Inches(0.42), Inches(0.26), color=BLUE)
    add_card(slide, Inches(9.30), Inches(2.38), Inches(3.12), Inches(1.36), fill_color=CARD_TINT, border_color=EMERALD, radius=0.10, border_width=1.4)
    add_text_box(slide, Inches(9.45), Inches(2.50), Inches(2.82), Inches(0.26), "32-Byte Bearer Session + RBAC", font_size=9.8, color=EMERALD, bold=True, align=PP_ALIGN.CENTER)
    add_text_box(slide, Inches(9.45), Inches(2.82), Inches(2.82), Inches(0.82), "• Sliding 30d token TTL\n• Host / Editor / Viewer roles\n• 15s democratic Vote-to-Clear", font_size=8.6, color=TEXT_DARK_BODY)

    # Right Bottom: Export Preview & Multi-Format Workflow
    add_card(slide, Inches(6.65), Inches(4.25), Inches(6.03), Inches(2.50), fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    add_text_box(slide, Inches(6.90), Inches(4.40), Inches(5.53), Inches(0.30), "LIVE EXPORT PREVIEW & FORMAT ENGINE", font_size=11, color=ROSE, bold=True)

    ex_steps = [
        ("Trigger", "Sidebar /\nCtrl+Shift+E", ROSE),
        ("Scene Engine", "Bounds +\nZ-Order", PURPLE),
        ("Live Preview", "Light / Dark /\nTransparent", BLUE),
        ("Download", "PNG • SVG • JPG\nWebP • JSON", EMERALD),
    ]
    for i, (et, eb, ec) in enumerate(ex_steps):
        ex = Inches(6.88) + i * Inches(1.42)
        add_card(slide, ex, Inches(4.86), Inches(1.22), Inches(1.12), fill_color=CARD_TINT, border_color=ec, radius=0.12)
        add_text_box(slide, ex + Inches(0.06), Inches(5.02), Inches(1.10), Inches(0.26), et, font_size=8.8, color=ec, bold=True, align=PP_ALIGN.CENTER)
        add_text_box(slide, ex + Inches(0.06), Inches(5.36), Inches(1.10), Inches(0.50), eb, font_size=7.9, color=TEXT_DARK_BODY, align=PP_ALIGN.CENTER)
        if i < 3:
            add_arrow(slide, ex + Inches(1.24), Inches(5.30), Inches(0.15), Inches(0.20), color=ec)

    add_text_box(slide, Inches(6.90), Inches(6.18), Inches(5.53), Inches(0.42), "Includes 1x–3x scale selector, checkerboard alpha preview, 4096px raster guard & clipboard copy.", font_size=8.8, color=TEXT_MUTED)

    add_footer(slide, 7)


def build_slide_8_database(prs, db_img_path):
    slide = blank_slide(prs, BG_LIGHT)
    add_header(slide, "Database & Continuity", "MongoDB Document Schema & Offline Persistence", "Strict startup persistence guarantees with TTL index auto-cleanup and offline client resilience")

    add_card(slide, Inches(0.65), Inches(1.58), Inches(12.03), Inches(4.52), fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
    slide.shapes.add_picture(db_img_path, Inches(0.85), Inches(1.66), height=Inches(4.36))

    badges = [
        ("MONGODB_URI Required", "Awaits verified Mongo connection cleanly on server startup", AMBER),
        ("Granular Element Writes", "Debounced 500ms batch saves prevent socket write storms", PURPLE),
        ("Automated TTL Indexes", "Self-cleaning 7d guests & 30d tokens keep storage lean", EMERALD),
    ]
    for idx, (t, d, accent) in enumerate(badges):
        x = Inches(0.65) + idx * Inches(4.10)
        y = Inches(6.22)
        add_card(slide, x, y, Inches(3.82), Inches(0.64), fill_color=CARD_TINT, border_color=accent, radius=0.12)
        add_text_box(slide, x + Inches(0.15), y + Inches(0.07), Inches(3.52), Inches(0.22), t, font_size=9.5, color=accent, bold=True)
        add_text_box(slide, x + Inches(0.15), y + Inches(0.30), Inches(3.52), Inches(0.28), d, font_size=8.3, color=TEXT_DARK_BODY)

    add_footer(slide, 8)


def build_slide_9_use_cases(prs):
    slide = blank_slide(prs, BG_LIGHT)
    add_header(slide, "Use Cases", "Practical Applications Across Teams & Workflows", "Designed for engineers, agile product teams, educators, and solo technical creators")

    cases = [
        ("Software Architecture & Design Reviews", "Teams co-design APIs & cloud systems", BLUE, BLUE_SOFT,
         [("1. AI Prompt", "Generate base tiers"), ("2. AI Chat Revise", "Add cache / queue"), ("3. Export SVG", "Embed crisp docs")]),
        ("Agile Sprints & Brainstorming", "Remote retrospectives & Kanban planning", EMERALD, EMERALD_SOFT,
         [("1. Sticky Grid", "Collect team ideas"), ("2. Live Cursors", "Cluster via wires"), ("3. Safe Clear", "15s Vote-to-Clear")]),
        ("Live Teaching & Tech Interviews", "Guided coding & system design sessions", PURPLE, PURPLE_SOFT,
         [("1. Host Lock", "Control edit access"), ("2. P2P Voice", "Zero Zoom switch"), ("3. Grant Write", "Pair-draw live")]),
        ("Offline Solo Sketching & Docs", "Instant zero-signup personal diagramming", AMBER, AMBER_SOFT,
         [("1. Solo Canvas", "IndexedDB autosave"), ("2. Share Go Live", "Promote to room"), ("3. Multi Export", "PNG / WebP / JSON")]),
    ]

    cw = Inches(5.85)
    ch = Inches(2.44)
    for idx, (title, sub, accent, tint, steps) in enumerate(cases):
        col = idx % 2
        row = idx // 2
        x = Inches(0.65) + col * Inches(6.18)
        y = Inches(1.66) + row * Inches(2.60)

        add_card(slide, x, y, cw, ch, fill_color=CARD_LIGHT, border_color=BORDER_LIGHT)
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, Inches(0.10), ch)
        bar.fill.solid()
        bar.fill.fore_color.rgb = accent
        bar.line.fill.background()

        add_text_box(slide, x + Inches(0.28), y + Inches(0.20), cw - Inches(0.50), Inches(0.32), title, font_size=13, color=TEXT_DARK_TITLE, bold=True)
        add_text_box(slide, x + Inches(0.28), y + Inches(0.54), cw - Inches(0.50), Inches(0.28), sub, font_size=9.5, color=TEXT_MUTED)

        # Mini 3-step visual workflow inside each card
        for s_i, (st, sd) in enumerate(steps):
            sx = x + Inches(0.28) + s_i * Inches(1.83)
            sy = y + Inches(1.02)
            add_card(slide, sx, sy, Inches(1.56), Inches(1.12), fill_color=tint, border_color=accent, radius=0.14)
            add_text_box(slide, sx + Inches(0.08), sy + Inches(0.18), Inches(1.40), Inches(0.26), st, font_size=9.5, color=accent, bold=True, align=PP_ALIGN.CENTER)
            add_text_box(slide, sx + Inches(0.08), sy + Inches(0.52), Inches(1.40), Inches(0.42), sd, font_size=8.6, color=TEXT_DARK_BODY, align=PP_ALIGN.CENTER)
            if s_i < 2:
                add_arrow(slide, sx + Inches(1.59), sy + Inches(0.45), Inches(0.21), Inches(0.20), color=accent)

    add_footer(slide, 9)


def build_slide_10_limitations_roadmap(prs):
    slide = blank_slide(prs, BG_DARK)
    add_header(slide, "Limitations & Future Roadmap", "Current Boundaries & Engineering Roadmap", "Honest architectural constraints today paired with clear next-phase upgrades", dark=True)

    pairs = [
        ("Single-Node Room Memory", "Room Map lives in 1 server process", "Redis Pub/Sub Adapter", "Horizontal cluster scaling", ROSE, EMERALD),
        ("P2P Mesh Scaling (N^2)", "Voice mesh grows quadratically per peer", "WebRTC SFU Media", "mediasoup / LiveKit 50+ rooms", AMBER, CYAN),
        ("Public STUN NAT Limits", "Symmetric enterprise NATs can block audio", "Managed TURN Relays", "Dedicated Coturn relay cluster", ROSE, EMERALD),
        ("Timestamp LWW Merges", "Offline conflict warns on concurrent edits", "CRDT State Engine", "Yjs / Automerge offline merge", AMBER, BLUE),
        ("Transport Encryption Only", "TLS/DTLS encrypts in-flight traffic", "Client E2EE Vault", "WebCrypto AES-GCM 256 boards", PURPLE, CYAN),
    ]

    for idx, (lim_t, lim_d, road_t, road_d, lc, rc) in enumerate(pairs):
        y = Inches(1.62) + idx * Inches(0.92)
        # Limitation card (Left)
        add_card(slide, Inches(0.65), y, Inches(5.30), Inches(0.76), fill_color=CARD_DARK, border_color=lc, radius=0.12)
        add_text_box(slide, Inches(0.85), y + Inches(0.10), Inches(4.90), Inches(0.26), f"LIMITATION:  {lim_t}", font_size=10, color=lc, bold=True)
        add_text_box(slide, Inches(0.85), y + Inches(0.38), Inches(4.90), Inches(0.28), lim_d, font_size=9.0, color=TEXT_DARK_MUTED)

        # Arrow bridging gap
        add_arrow(slide, Inches(6.22), y + Inches(0.24), Inches(0.88), Inches(0.28), color=rc)

        # Roadmap upgrade card (Right)
        add_card(slide, Inches(7.38), y, Inches(5.30), Inches(0.76), fill_color=CARD_DARK_ALT, border_color=rc, radius=0.12)
        add_text_box(slide, Inches(7.58), y + Inches(0.10), Inches(4.90), Inches(0.26), f"ROADMAP:  {road_t}", font_size=10, color=rc, bold=True)
        add_text_box(slide, Inches(7.58), y + Inches(0.38), Inches(4.90), Inches(0.28), road_d, font_size=9.0, color=TEXT_LIGHT_SUB)

    # Closing wrap-up pill bar
    add_card(slide, Inches(0.65), Inches(6.26), Inches(12.03), Inches(0.54), fill_color=RGBColor(23, 37, 84), border_color=BLUE, radius=0.20)
    add_text_box(
        slide,
        Inches(0.85),
        Inches(6.39),
        Inches(11.63),
        Inches(0.30),
        "Verified Live Stack  •  github.com/PARASMANI-KHUNTE/Whiteboard.io  •  https://whiteboard-io-1.onrender.com  •  Thank You!",
        font_size=10,
        color=TEXT_LIGHT,
        bold=True,
        align=PP_ALIGN.CENTER,
    )

    add_footer(slide, 10, dark=True)


def main():
    print("Generating Whiteboard.io 10-page presentation...")
    prs = init_deck()

    with tempfile.TemporaryDirectory() as tmpdir:
        arch_png = os.path.join(tmpdir, "arch.png")
        ai_png = os.path.join(tmpdir, "ai.png")
        db_png = os.path.join(tmpdir, "db.png")

        render_architecture_diagram(arch_png)
        render_ai_pipeline_diagram(ai_png)
        render_db_schema_diagram(db_png)

        build_slide_1_cover(prs)
        build_slide_2_tech_stack(prs)
        build_slide_3_features(prs)
        build_slide_4_architecture(prs, arch_png)
        build_slide_5_realtime_flow(prs)
        build_slide_6_ai_pipeline(prs, ai_png)
        build_slide_7_voice_auth_export(prs)
        build_slide_8_database(prs, db_png)
        build_slide_9_use_cases(prs)
        build_slide_10_limitations_roadmap(prs)

        prs.save(OUTPUT_PPTX)

    size_kb = os.path.getsize(OUTPUT_PPTX) / 1024
    print(f"Saved {OUTPUT_PPTX} ({len(prs.slides)} slides, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
