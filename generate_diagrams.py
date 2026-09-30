import matplotlib.pyplot as plt
import matplotlib.patches as patches

# Set global styles
plt.rcParams['font.sans-serif'] = 'DejaVu Sans'
plt.rcParams['font.family'] = 'sans-serif'

def create_system_architecture_diagram(output_path="diagram_architecture.png"):
    fig, ax = plt.subplots(figsize=(10, 7), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8.5)
    ax.axis('off')

    # Color palette
    c_client = "#e0f2fe"
    c_client_border = "#0284c7"
    c_server = "#f0fdf4"
    c_server_border = "#16a34a"
    c_db = "#fef3c7"
    c_db_border = "#d97706"
    c_ai = "#f3e8ff"
    c_ai_border = "#9333ea"

    # Client Tier
    rect_client = patches.FancyBboxPatch((0.8, 6.2), 8.4, 1.8, boxstyle="round,pad=0.1,rounding_size=0.15",
                                         linewidth=1.8, edgecolor=c_client_border, facecolor=c_client)
    ax.add_patch(rect_client)
    ax.text(5.0, 7.75, "CLIENT TIER (React 19, TypeScript, Vite, Tailwind CSS)", ha='center', va='center', fontsize=11, fontweight='bold', color="#0369a1")

    # Client Subcomponents
    sub_c1 = patches.FancyBboxPatch((1.1, 6.4), 2.4, 1.0, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.2, edgecolor="#0284c7", facecolor="#ffffff")
    ax.add_patch(sub_c1)
    ax.text(2.3, 7.0, "Canvas 2D Engine\n(Strokes, Shapes, Wires)", ha='center', va='center', fontsize=8.5, fontweight='bold', color="#0f172a")

    sub_c2 = patches.FancyBboxPatch((3.8, 6.4), 2.4, 1.0, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.2, edgecolor="#0284c7", facecolor="#ffffff")
    ax.add_patch(sub_c2)
    ax.text(5.0, 7.0, "React Hooks State\n(useSocket, useAuth)", ha='center', va='center', fontsize=8.5, fontweight='bold', color="#0f172a")

    sub_c3 = patches.FancyBboxPatch((6.5, 6.4), 2.4, 1.0, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.2, edgecolor="#0284c7", facecolor="#ffffff")
    ax.add_patch(sub_c3)
    ax.text(7.7, 7.0, "Web Audio & WebRTC\n(useVoiceChat, Mesh)", ha='center', va='center', fontsize=8.5, fontweight='bold', color="#0f172a")

    # Dual Protocol Communication Lines
    # HTTP REST (Left)
    ax.annotate('', xy=(3.0, 5.0), xytext=(3.0, 6.2),
                arrowprops=dict(arrowstyle="<->", color="#2563eb", lw=1.8))
    ax.text(2.1, 5.6, "HTTP / REST\nJSON APIs\n(Auth, Rooms, AI)", ha='center', va='center', fontsize=8, fontweight='bold', color="#1e40af",
            bbox=dict(boxstyle="square,pad=0.2", facecolor="#ffffff", edgecolor="#93c5fd", lw=0.8))

    # WebSocket (Right)
    ax.annotate('', xy=(7.0, 5.0), xytext=(7.0, 6.2),
                arrowprops=dict(arrowstyle="<->", color="#059669", lw=1.8))
    ax.text(7.9, 5.6, "WebSocket\nSocket.io Protocol\n(Live Sync, Signaling)", ha='center', va='center', fontsize=8, fontweight='bold', color="#047857",
            bbox=dict(boxstyle="square,pad=0.2", facecolor="#ffffff", edgecolor="#6ee7b7", lw=0.8))

    # Backend Tier
    rect_server = patches.FancyBboxPatch((0.8, 2.7), 8.4, 2.3, boxstyle="round,pad=0.1,rounding_size=0.15",
                                         linewidth=1.8, edgecolor=c_server_border, facecolor=c_server)
    ax.add_patch(rect_server)
    ax.text(5.0, 4.75, "BACKEND TIER (Node.js, Express, Socket.io, TypeScript)", ha='center', va='center', fontsize=11, fontweight='bold', color="#15803d")

    # Express Router
    sub_s1 = patches.FancyBboxPatch((1.1, 3.8), 3.6, 0.75, boxstyle="round,pad=0.08,rounding_size=0.08",
                                    linewidth=1.2, edgecolor="#16a34a", facecolor="#ffffff")
    ax.add_patch(sub_s1)
    ax.text(2.9, 4.17, "Express Router (Rate Limiter, CORS, PBKDF2 Auth)", ha='center', va='center', fontsize=8, fontweight='bold', color="#0f172a")

    # Socket.io Gateway
    sub_s2 = patches.FancyBboxPatch((5.3, 3.8), 3.6, 0.75, boxstyle="round,pad=0.08,rounding_size=0.08",
                                    linewidth=1.2, edgecolor="#16a34a", facecolor="#ffffff")
    ax.add_patch(sub_s2)
    ax.text(7.1, 4.17, "Socket Gateway (Room Isolation, Live Streams)", ha='center', va='center', fontsize=8, fontweight='bold', color="#0f172a")

    # In-Memory State Map
    sub_s3 = patches.FancyBboxPatch((1.1, 2.9), 7.8, 0.7, boxstyle="round,pad=0.08,rounding_size=0.08",
                                    linewidth=1.2, edgecolor="#059669", facecolor="#dcfce7")
    ax.add_patch(sub_s3)
    ax.text(5.0, 3.25, "In-Memory Room State Map: Map<string, RoomData> (Elements, Users, Permissions, Vote State)", ha='center', va='center', fontsize=8, fontweight='bold', color="#065f46")

    # Persistence Connector
    ax.annotate('', xy=(3.5, 1.8), xytext=(3.5, 2.7),
                arrowprops=dict(arrowstyle="<->", color="#b45309", lw=1.8))
    ax.text(3.5, 2.25, "Debounced Write (400-1000ms) & Reads", ha='center', va='center', fontsize=7.5, fontweight='bold', color="#92400e",
            bbox=dict(boxstyle="square,pad=0.2", facecolor="#ffffff", edgecolor="#fcd34d", lw=0.8))

    # AI External Call Connector
    ax.annotate('', xy=(7.5, 1.8), xytext=(7.5, 2.7),
                arrowprops=dict(arrowstyle="<->", color="#7e22ce", lw=1.8))
    ax.text(7.5, 2.25, "REST API (JSON Schema)", ha='center', va='center', fontsize=7.5, fontweight='bold', color="#6b21a8",
            bbox=dict(boxstyle="square,pad=0.2", facecolor="#ffffff", edgecolor="#d8b4fe", lw=0.8))

    # Database Tier
    rect_db = patches.FancyBboxPatch((0.8, 0.3), 5.0, 1.5, boxstyle="round,pad=0.1,rounding_size=0.15",
                                     linewidth=1.8, edgecolor=c_db_border, facecolor=c_db)
    ax.add_patch(rect_db)
    ax.text(3.3, 1.55, "PERSISTENCE TIER (MongoDB Native Driver 7.6)", ha='center', va='center', fontsize=9.5, fontweight='bold', color="#b45309")
    ax.text(3.3, 0.9, "• users (UUID, PBKDF2 hash, TTL guest index)\n• tokens (Session auth tokens with 30-day TTL)\n• rooms (Metadata, creator ownership, lock state)\n• elements & room_elements (Granular atomic items)", ha='center', va='center', fontsize=7.5, color="#78350f")

    # External AI Service
    rect_ai = patches.FancyBboxPatch((6.2, 0.3), 3.0, 1.5, boxstyle="round,pad=0.1,rounding_size=0.15",
                                     linewidth=1.8, edgecolor=c_ai_border, facecolor=c_ai)
    ax.add_patch(rect_ai)
    ax.text(7.7, 1.55, "EXTERNAL AI SERVICE", ha='center', va='center', fontsize=9.5, fontweight='bold', color="#7e22ce")
    ax.text(7.7, 0.9, "Google Gemini 2.5 Flash\nStructured Diagram Generation\n(Mind Map, Flowchart,\nBrainstorm, Architecture)", ha='center', va='center', fontsize=7.5, color="#581c87")

    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    plt.close()
    print(f"Generated {output_path}")

def create_drawing_dataflow_diagram(output_path="diagram_dataflow.png"):
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')

    steps = [
        ("1. Pointer Input", "User draws stroke\n(PointerDown/Move)", 0.9, "#dbeafe", "#1d4ed8"),
        ("2. Local Canvas", "Optimistic rendering\n(0ms latency)", 2.4, "#dbeafe", "#1d4ed8"),
        ("3. Live Streaming", "stroke-live-point\nemitted via Socket.io", 3.9, "#dcfce7", "#15803d"),
        ("4. Remote Peers", "Live points rendered\non remote canvases", 5.4, "#dcfce7", "#15803d"),
        ("5. Final Element", "PointerUp generates\nauthoritative element", 6.9, "#fef3c7", "#b45309"),
        ("6. Persistence", "Debounced write\n(400ms) to MongoDB", 8.4, "#fee2e2", "#b91c1c")
    ]

    for title, desc, x, bg, border in steps:
        box = patches.FancyBboxPatch((x - 0.65, 2.2), 1.3, 2.2, boxstyle="round,pad=0.08,rounding_size=0.12",
                                     linewidth=1.5, edgecolor=border, facecolor=bg)
        ax.add_patch(box)
        ax.text(x, 4.0, title, ha='center', va='center', fontsize=8, fontweight='bold', color=border)
        ax.text(x, 3.1, desc, ha='center', va='center', fontsize=7.5, color="#0f172a")

    for i in range(len(steps) - 1):
        x_start = steps[i][2] + 0.65
        x_end = steps[i+1][2] - 0.65
        ax.annotate('', xy=(x_end, 3.3), xytext=(x_start, 3.3),
                    arrowprops=dict(arrowstyle="->", color="#475569", lw=2.0))

    # Summary box
    note = patches.FancyBboxPatch((1.0, 0.5), 8.0, 1.2, boxstyle="round,pad=0.1,rounding_size=0.1",
                                  linewidth=1.0, edgecolor="#94a3b8", facecolor="#f8fafc")
    ax.add_patch(note)
    ax.text(5.0, 1.1, "HYBRID DUAL-CHANNEL REAL-TIME DRAWING PIPELINE", ha='center', va='center', fontsize=9, fontweight='bold', color="#1e293b")
    ax.text(5.0, 0.75, "Ensures instant zero-latency feedback for the local artist via HTML5 Canvas 2D context,\ncontinuous point streaming to collaborators, and aggregated debounced writes to eliminate database write bottlenecks.", ha='center', va='center', fontsize=8, color="#475569")

    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    plt.close()
    print(f"Generated {output_path}")

def create_ai_pipeline_diagram(output_path="diagram_ai_pipeline.png"):
    fig, ax = plt.subplots(figsize=(10, 6.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8.5)
    ax.axis('off')

    # Title
    ax.text(5.0, 8.1, "Google Gemini 2.5 Flash Diagram Generation & 5-Layer Rate-Limit Shield", ha='center', va='center', fontsize=11, fontweight='bold', color="#4338ca")

    stages = [
        ("Client Request", "User prompt & style\n(POST /api/ai/generate-diagram)", 7.1, "#e0e7ff", "#4338ca"),
        ("Layer 1: IP Rate Limiter", "Express In-Memory Guard\n(Max 10 requests / min / IP)", 5.9, "#fef3c7", "#d97706"),
        ("Layer 2: Response Cache", "In-Memory Cache (2hr TTL)\nMatches style:prompt (<1ms response)", 4.7, "#dcfce7", "#15803d"),
        ("Layer 3: Request Pacing", "Serial FIFO Promise Queue\n(Enforces 3,000ms inter-call spacing)", 3.5, "#dbeafe", "#1d4ed8"),
        ("Layer 4: Gemini Call & Retry", "Gemini 2.5 Flash + Jittered Exponential Backoff\n(Retries on 429 / 503 up to 3 times)", 2.3, "#f3e8ff", "#7e22ce"),
        ("Output: Canvas Elements", "Structured JSON -> Shape/Sticky/Text Elements\nBroadcast via Socket.io to all room peers", 1.1, "#e0f2fe", "#0284c7")
    ]

    for title, desc, y, bg, border in stages:
        box = patches.FancyBboxPatch((1.2, y - 0.45), 5.4, 0.9, boxstyle="round,pad=0.08,rounding_size=0.1",
                                     linewidth=1.4, edgecolor=border, facecolor=bg)
        ax.add_patch(box)
        ax.text(1.4, y + 0.15, title, ha='left', va='center', fontsize=8.5, fontweight='bold', color=border)
        ax.text(1.4, y - 0.2, desc, ha='left', va='center', fontsize=7.5, color="#1e293b")

    for i in range(len(stages) - 1):
        y_start = stages[i][2] - 0.45
        y_end = stages[i+1][2] + 0.45
        ax.annotate('', xy=(3.9, y_end), xytext=(3.9, y_start),
                    arrowprops=dict(arrowstyle="->", color="#4338ca", lw=1.8))

    # Layer 5: Procedural Fallback Box (Right side)
    box_fallback = patches.FancyBboxPatch((7.0, 1.8), 2.6, 2.8, boxstyle="round,pad=0.1,rounding_size=0.12",
                                         linewidth=1.6, edgecolor="#b91c1c", facecolor="#fee2e2")
    ax.add_patch(box_fallback)
    ax.text(8.3, 4.2, "Layer 5: Fallback", ha='center', va='center', fontsize=9, fontweight='bold', color="#b91c1c")
    ax.text(8.3, 3.1, "Procedural Fallback\nSynthesis Engine\n\nTriggered if:\n• API key not configured\n• Rate limit exhausted\n• Network/API 503 error\n\nGenerates clean deterministic\ninteractive layout with 0 downtime.", ha='center', va='center', fontsize=7.2, color="#7f1d1d")

    # Connector from Gemini to Fallback
    ax.annotate('', xy=(7.0, 2.5), xytext=(6.6, 2.3),
                arrowprops=dict(arrowstyle="->", color="#b91c1c", lw=1.8, ls="--"))
    ax.text(6.8, 2.7, "On Failure", ha='center', va='bottom', fontsize=7.5, fontweight='bold', color="#b91c1c")

    # Connector from Fallback to Output
    ax.annotate('', xy=(6.6, 1.1), xytext=(7.5, 1.8),
                arrowprops=dict(arrowstyle="->", color="#15803d", lw=1.8, ls="--"))

    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    plt.close()
    print(f"Generated {output_path}")

def create_database_schema_diagram(output_path="diagram_database_schema.png"):
    fig, ax = plt.subplots(figsize=(10, 7), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8.5)
    ax.axis('off')

    ax.text(5.0, 8.1, "MongoDB Document Database Architecture & Collection Schemas", ha='center', va='center', fontsize=11, fontweight='bold', color="#1e293b")

    # Collections
    # 1. users
    b_users = patches.FancyBboxPatch((0.5, 4.8), 4.2, 2.9, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.4, edgecolor="#0284c7", facecolor="#f0f9ff")
    ax.add_patch(b_users)
    ax.text(0.7, 7.45, "Collection: users", ha='left', va='center', fontsize=9.5, fontweight='bold', color="#0369a1")
    ax.text(0.7, 6.1, "• id: String (UUID, unique index)\n• username: String (index)\n• email: String (index)\n• passwordHash: String (PBKDF2-SHA512)\n• salt: String (16-byte hex)\n• name: String, color: String\n• isGuest: Boolean (TTL: 7 days)\n• createdRooms: String[] (owned room codes)\n• googleId?: String, picture?: String", ha='left', va='center', fontsize=7.5, color="#0f172a")

    # 2. tokens
    b_tokens = patches.FancyBboxPatch((5.3, 5.2), 4.2, 2.5, boxstyle="round,pad=0.08,rounding_size=0.1",
                                     linewidth=1.4, edgecolor="#059669", facecolor="#f0fdf4")
    ax.add_patch(b_tokens)
    ax.text(5.5, 7.45, "Collection: tokens", ha='left', va='center', fontsize=9.5, fontweight='bold', color="#047857")
    ax.text(5.5, 6.2, "• token: String (32-byte hex, unique index)\n• userId: String (references users.id, index)\n• createdAt: Number (TTL: 30 days)\n• updatedAt: Number", ha='left', va='center', fontsize=7.5, color="#0f172a")

    # 3. rooms
    b_rooms = patches.FancyBboxPatch((0.5, 1.4), 4.2, 2.8, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.4, edgecolor="#d97706", facecolor="#fffbeb")
    ax.add_patch(b_rooms)
    ax.text(0.7, 3.95, "Collection: rooms", ha='left', va='center', fontsize=9.5, fontweight='bold', color="#b45309")
    ax.text(0.7, 2.7, "• id: String (Room code XXX-XXX, unique index)\n• name: String (Custom display name)\n• creatorId: String (references users.id, index)\n• creatorName: String\n• createdAt: Number\n• isLocked: Boolean (Host lock toggle)", ha='left', va='center', fontsize=7.5, color="#0f172a")

    # 4. room_elements & elements
    b_elements = patches.FancyBboxPatch((5.3, 1.4), 4.2, 2.8, boxstyle="round,pad=0.08,rounding_size=0.1",
                                       linewidth=1.4, edgecolor="#7c3aed", facecolor="#faf5ff")
    ax.add_patch(b_elements)
    ax.text(5.5, 3.95, "Collection: room_elements", ha='left', va='center', fontsize=9.5, fontweight='bold', color="#6d28d9")
    ax.text(5.5, 2.7, "• roomId: String (index)\n• elementId: String (unique compound {roomId, elementId})\n• data: Object (stroke, shape, sticky, text, wire)\n• updatedAt: Number\n\nLegacy elements Collection:\n• roomId: String (unique)\n• elements: Record<string, CanvasElement>", ha='left', va='center', fontsize=7.5, color="#0f172a")

    # Inter-collection relationships
    ax.annotate('', xy=(5.3, 6.4), xytext=(4.7, 6.4),
                arrowprops=dict(arrowstyle="->", color="#0284c7", lw=1.5, ls="--"))
    ax.text(5.0, 6.6, "1 : N (userId)", ha='center', va='bottom', fontsize=7.5, fontweight='bold', color="#0369a1")

    ax.annotate('', xy=(2.6, 4.2), xytext=(2.6, 4.8),
                arrowprops=dict(arrowstyle="->", color="#b45309", lw=1.5, ls="--"))
    ax.text(2.9, 4.5, "1 : N (creatorId)", ha='left', va='center', fontsize=7.5, fontweight='bold', color="#b45309")

    ax.annotate('', xy=(5.3, 2.8), xytext=(4.7, 2.8),
                arrowprops=dict(arrowstyle="->", color="#6d28d9", lw=1.5, ls="--"))
    ax.text(5.0, 3.0, "1 : N (roomId)", ha='center', va='bottom', fontsize=7.5, fontweight='bold', color="#6d28d9")

    # Architectural note
    ax.text(5.0, 0.6, "Note: MongoDB document collections are modeled with application-enforced referential integrity,\ncompound indexing, and TTL (Time-To-Live) background indexes for automatic guest and session token cleanup.", ha='center', va='center', fontsize=7.8, style='italic', color="#475569")

    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    plt.close()
    print(f"Generated {output_path}")

if __name__ == "__main__":
    create_system_architecture_diagram()
    create_drawing_dataflow_diagram()
    create_ai_pipeline_diagram()
    create_database_schema_diagram()
