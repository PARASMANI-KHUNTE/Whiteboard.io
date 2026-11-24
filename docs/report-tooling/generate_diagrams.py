import matplotlib.pyplot as plt
import matplotlib.patches as patches

# Set global styles
plt.rcParams['font.sans-serif'] = 'DejaVu Sans'
plt.rcParams['font.family'] = 'sans-serif'

def create_system_architecture_diagram(output_path="diagram_architecture.png"):
    fig, ax = plt.subplots(figsize=(10, 7.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8.8)
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
    rect_client = patches.FancyBboxPatch((0.6, 6.3), 8.8, 2.2, boxstyle="round,pad=0.1,rounding_size=0.15",
                                         linewidth=1.8, edgecolor=c_client_border, facecolor=c_client)
    ax.add_patch(rect_client)
    ax.text(5.0, 8.25, "CLIENT TIER (React 19, TypeScript, Vite, Tailwind CSS)", ha='center', va='center', fontsize=11, fontweight='bold', color="#0369a1")

    # Client Subcomponents
    sub_c1 = patches.FancyBboxPatch((0.8, 6.5), 2.0, 1.4, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.2, edgecolor="#0284c7", facecolor="#ffffff")
    ax.add_patch(sub_c1)
    ax.text(1.8, 7.2, "Canvas 2D Engine\n(Strokes, Shapes, Wires,\nRDP Simplification)", ha='center', va='center', fontsize=7.8, fontweight='bold', color="#0f172a")

    sub_c2 = patches.FancyBboxPatch((3.0, 6.5), 2.0, 1.4, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.2, edgecolor="#0284c7", facecolor="#ffffff")
    ax.add_patch(sub_c2)
    ax.text(4.0, 7.2, "State & Persistence\n(useSocket, useAuth,\nsoloStorage, guestId)", ha='center', va='center', fontsize=7.8, fontweight='bold', color="#0f172a")

    sub_c3 = patches.FancyBboxPatch((5.2, 6.5), 2.0, 1.4, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.2, edgecolor="#0284c7", facecolor="#ffffff")
    ax.add_patch(sub_c3)
    ax.text(6.2, 7.2, "Web Audio & Mesh\n(useVoiceChat, STUN,\nSpeaking Visualizer)", ha='center', va='center', fontsize=7.8, fontweight='bold', color="#0f172a")

    sub_c4 = patches.FancyBboxPatch((7.4, 6.5), 1.8, 1.4, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.2, edgecolor="#0284c7", facecolor="#ffffff")
    ax.add_patch(sub_c4)
    ax.text(8.3, 7.2, "AI Chat Panel\n(AiChatPanel.tsx,\nSpatial Index 2D)", ha='center', va='center', fontsize=7.8, fontweight='bold', color="#0f172a")

    # Dual Protocol Communication Lines
    # HTTP REST (Left)
    ax.annotate('', xy=(3.0, 5.1), xytext=(3.0, 6.3),
                arrowprops=dict(arrowstyle="<->", color="#2563eb", lw=1.8))
    ax.text(2.0, 5.7, "HTTP / REST\nJSON APIs\n(Auth, Rooms, AI)", ha='center', va='center', fontsize=8, fontweight='bold', color="#1e40af",
            bbox=dict(boxstyle="square,pad=0.2", facecolor="#ffffff", edgecolor="#93c5fd", lw=0.8))

    # WebSocket (Right)
    ax.annotate('', xy=(7.0, 5.1), xytext=(7.0, 6.3),
                arrowprops=dict(arrowstyle="<->", color="#059669", lw=1.8))
    ax.text(8.0, 5.7, "WebSocket\nSocket.io Protocol\n(Live Sync, Signaling)", ha='center', va='center', fontsize=8, fontweight='bold', color="#047857",
            bbox=dict(boxstyle="square,pad=0.2", facecolor="#ffffff", edgecolor="#6ee7b7", lw=0.8))

    # Backend Tier
    rect_server = patches.FancyBboxPatch((0.6, 2.7), 8.8, 2.4, boxstyle="round,pad=0.1,rounding_size=0.15",
                                         linewidth=1.8, edgecolor=c_server_border, facecolor=c_server)
    ax.add_patch(rect_server)
    ax.text(5.0, 4.85, "BACKEND TIER (Node.js, Express, Socket.io, TypeScript)", ha='center', va='center', fontsize=11, fontweight='bold', color="#15803d")

    # Express Router
    sub_s1 = patches.FancyBboxPatch((0.9, 3.8), 3.8, 0.8, boxstyle="round,pad=0.08,rounding_size=0.08",
                                    linewidth=1.2, edgecolor="#16a34a", facecolor="#ffffff")
    ax.add_patch(sub_s1)
    ax.text(2.8, 4.2, "Express Router (PBKDF2 Auth, Google OAuth,\nAI Config, Generate & Revise Endpoints)", ha='center', va='center', fontsize=7.5, fontweight='bold', color="#0f172a")

    # Socket.io Gateway
    sub_s2 = patches.FancyBboxPatch((5.3, 3.8), 3.8, 0.8, boxstyle="round,pad=0.08,rounding_size=0.08",
                                    linewidth=1.2, edgecolor="#16a34a", facecolor="#ffffff")
    ax.add_patch(sub_s2)
    ax.text(7.2, 4.2, "Socket Gateway (Room Isolation, Batch Sync,\nAdmin Governance & Vote-to-Clear)", ha='center', va='center', fontsize=7.5, fontweight='bold', color="#0f172a")

    # In-Memory State Map
    sub_s3 = patches.FancyBboxPatch((0.9, 2.9), 8.2, 0.7, boxstyle="round,pad=0.08,rounding_size=0.08",
                                    linewidth=1.2, edgecolor="#059669", facecolor="#dcfce7")
    ax.add_patch(sub_s3)
    ax.text(5.0, 3.25, "In-Memory State: Map<string, RoomData> (Elements, Users, Permissions, AI Cache, Vote State)", ha='center', va='center', fontsize=8, fontweight='bold', color="#065f46")

    # Persistence Connector
    ax.annotate('', xy=(3.0, 1.8), xytext=(3.0, 2.7),
                arrowprops=dict(arrowstyle="<->", color="#b45309", lw=1.8))
    ax.text(3.0, 2.25, "Debounced Write (500ms) & Reads", ha='center', va='center', fontsize=7.5, fontweight='bold', color="#92400e",
            bbox=dict(boxstyle="square,pad=0.2", facecolor="#ffffff", edgecolor="#fcd34d", lw=0.8))

    # AI External Call Connector
    ax.annotate('', xy=(7.2, 1.8), xytext=(7.2, 2.7),
                arrowprops=dict(arrowstyle="<->", color="#7e22ce", lw=1.8))
    ax.text(7.2, 2.25, "Failover Chain: Gemini 3.8/3.6 / Ollama", ha='center', va='center', fontsize=7.5, fontweight='bold', color="#6b21a8",
            bbox=dict(boxstyle="square,pad=0.2", facecolor="#ffffff", edgecolor="#d8b4fe", lw=0.8))

    # Database Tier
    rect_db = patches.FancyBboxPatch((0.6, 0.3), 4.8, 1.5, boxstyle="round,pad=0.1,rounding_size=0.15",
                                     linewidth=1.8, edgecolor=c_db_border, facecolor=c_db)
    ax.add_patch(rect_db)
    ax.text(3.0, 1.55, "PERSISTENCE TIER (MongoDB Native Driver 7)", ha='center', va='center', fontsize=9.5, fontweight='bold', color="#b45309")
    ax.text(3.0, 0.9, "• users (UUID, PBKDF2 hash, TTL guest index)\n• tokens (Session auth tokens with 30-day TTL)\n• rooms (Metadata, creator ownership, lock state)\n• elements & room_elements (Granular atomic items)\n• MONGODB_URI required (no in-memory database)", ha='center', va='center', fontsize=7.2, color="#78350f")

    # External AI Service
    rect_ai = patches.FancyBboxPatch((5.8, 0.3), 3.6, 1.5, boxstyle="round,pad=0.1,rounding_size=0.15",
                                     linewidth=1.8, edgecolor=c_ai_border, facecolor=c_ai)
    ax.add_patch(rect_ai)
    ax.text(7.6, 1.55, "AI ENGINE TIER (Cloud & Local)", ha='center', va='center', fontsize=9.5, fontweight='bold', color="#7e22ce")
    ax.text(7.6, 0.9, "• Google Gemini 3.8 Flash (Primary cloud)\n• Google Gemini 3.6 Flash (Failover)\n• Local Ollama (llama3.2 offline option)\n• Procedural Fallback Engine (Zero downtime)\n• JSON Schema Graph Constraints", ha='center', va='center', fontsize=7.2, color="#581c87")

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
        ("5. Finalize & RDP", "PointerUp: RDP stroke\nsimplification (70% size)", 6.9, "#fef3c7", "#b45309"),
        ("6. Persistence", "Debounced write (500ms)\n& 2D Spatial Index", 8.4, "#fee2e2", "#b91c1c")
    ]

    for title, desc, x, bg, border in steps:
        box = patches.FancyBboxPatch((x - 0.65, 2.2), 1.3, 2.2, boxstyle="round,pad=0.08,rounding_size=0.12",
                                     linewidth=1.5, edgecolor=border, facecolor=bg)
        ax.add_patch(box)
        ax.text(x, 4.0, title, ha='center', va='center', fontsize=7.8, fontweight='bold', color=border)
        ax.text(x, 3.1, desc, ha='center', va='center', fontsize=7.2, color="#0f172a")

    for i in range(len(steps) - 1):
        x_start = steps[i][2] + 0.65
        x_end = steps[i+1][2] - 0.65
        ax.annotate('', xy=(x_end, 3.3), xytext=(x_start, 3.3),
                    arrowprops=dict(arrowstyle="->", color="#475569", lw=2.0))

    # Summary box
    note = patches.FancyBboxPatch((0.8, 0.5), 8.4, 1.2, boxstyle="round,pad=0.1,rounding_size=0.1",
                                  linewidth=1.0, edgecolor="#94a3b8", facecolor="#f8fafc")
    ax.add_patch(note)
    ax.text(5.0, 1.15, "HYBRID REAL-TIME DRAWING & SPATIAL PERFORMANCE PIPELINE", ha='center', va='center', fontsize=9, fontweight='bold', color="#1e293b")
    ax.text(5.0, 0.75, "Zero-latency local feedback via HTML5 Canvas 2D context, continuous point streaming to collaborators,\nRamer-Douglas-Peucker (RDP) point reduction, 2D uniform grid spatial culling, and aggregated debounced writes to MongoDB.", ha='center', va='center', fontsize=7.5, color="#475569")

    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    plt.close()
    print(f"Generated {output_path}")

def create_ai_pipeline_diagram(output_path="diagram_ai_pipeline.png"):
    fig, ax = plt.subplots(figsize=(10, 6.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8.8)
    ax.axis('off')

    # Title
    ax.text(5.0, 8.4, "Multi-Engine AI Diagram Generation Pipeline & Failover Shield", ha='center', va='center', fontsize=11, fontweight='bold', color="#4338ca")

    stages = [
        ("Client Request", "User prompt or revision instruction\n(POST /api/ai/generate-diagram or /revise-diagram)", 7.3, "#e0e7ff", "#4338ca"),
        ("Layer 1: IP Rate Limiter", "Express In-Memory Token Bucket Guard\n(Max 10 generate / 20 revise requests/min/IP)", 6.1, "#fef3c7", "#d97706"),
        ("Layer 2: Response Cache", "In-Memory Cache (2hr TTL, normalized key)\nInstant <1ms response for repeated prompts", 4.9, "#dcfce7", "#15803d"),
        ("Layer 3: Request Pacing", "Serial FIFO Promise Queue (3000ms Gemini,\n250ms Ollama spacing to prevent burst 429s)", 3.7, "#dbeafe", "#1d4ed8"),
        ("Layer 4: AI Model Failover", "Primary: Gemini 3.8 Flash -> Fallback: Gemini 3.6 Flash\n-> Local Ollama (llama3.2) -> Quality Gate & Retry", 2.5, "#f3e8ff", "#7e22ce"),
        ("Output: Graph Layout & Wires", "JSON Schema Graph -> Sugiyama DAG/Radial/Lanes\nEmits Shapes & Magnetic Connectors via Socket.io", 1.3, "#e0f2fe", "#0284c7")
    ]

    for title, desc, y, bg, border in stages:
        box = patches.FancyBboxPatch((1.0, y - 0.45), 5.6, 0.9, boxstyle="round,pad=0.08,rounding_size=0.1",
                                     linewidth=1.4, edgecolor=border, facecolor=bg)
        ax.add_patch(box)
        ax.text(1.2, y + 0.15, title, ha='left', va='center', fontsize=8.5, fontweight='bold', color=border)
        ax.text(1.2, y - 0.2, desc, ha='left', va='center', fontsize=7.2, color="#1e293b")

    for i in range(len(stages) - 1):
        y_start = stages[i][2] - 0.45
        y_end = stages[i+1][2] + 0.45
        ax.annotate('', xy=(3.8, y_end), xytext=(3.8, y_start),
                    arrowprops=dict(arrowstyle="->", color="#4338ca", lw=1.8))

    # Layer 5: Procedural Fallback Box (Right side)
    box_fallback = patches.FancyBboxPatch((7.0, 1.9), 2.6, 3.2, boxstyle="round,pad=0.1,rounding_size=0.12",
                                         linewidth=1.6, edgecolor="#b91c1c", facecolor="#fee2e2")
    ax.add_patch(box_fallback)
    ax.text(8.3, 4.6, "Layer 5: Fallback", ha='center', va='center', fontsize=9, fontweight='bold', color="#b91c1c")
    ax.text(8.3, 3.3, "Procedural Fallback\nSynthesis Engine\n\nTriggered if:\n• No API key & Ollama offline\n• Rate limits exhausted\n• Network/API 503 outage\n• Empty diagram response\n\nGenerates deterministic\nconnected graphs with\n100% guaranteed uptime.", ha='center', va='center', fontsize=7.2, color="#7f1d1d")

    # Connector from Failover to Fallback
    ax.annotate('', xy=(7.0, 2.7), xytext=(6.6, 2.5),
                arrowprops=dict(arrowstyle="->", color="#b91c1c", lw=1.8, ls="--"))
    ax.text(6.8, 2.9, "If all fail", ha='center', va='bottom', fontsize=7.5, fontweight='bold', color="#b91c1c")

    # Connector from Fallback to Output
    ax.annotate('', xy=(6.6, 1.3), xytext=(7.5, 1.9),
                arrowprops=dict(arrowstyle="->", color="#15803d", lw=1.8, ls="--"))

    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    plt.close()
    print(f"Generated {output_path}")

def create_database_schema_diagram(output_path="diagram_database_schema.png"):
    fig, ax = plt.subplots(figsize=(10, 7.2), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8.6)
    ax.axis('off')

    ax.text(5.0, 8.2, "MongoDB Document Database Architecture & Storage Layers", ha='center', va='center', fontsize=11, fontweight='bold', color="#1e293b")

    # Collections
    # 1. users
    b_users = patches.FancyBboxPatch((0.5, 4.8), 4.2, 3.0, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.4, edgecolor="#0284c7", facecolor="#f0f9ff")
    ax.add_patch(b_users)
    ax.text(0.7, 7.55, "Collection: users", ha='left', va='center', fontsize=9.5, fontweight='bold', color="#0369a1")
    ax.text(0.7, 6.2, "• id: String (UUID, unique index)\n• username: String (index)\n• email: String (index)\n• passwordHash: String (PBKDF2-SHA512)\n• salt: String (16-byte hex)\n• name: String, color: String\n• isGuest: Boolean (TTL: 7 days)\n• createdRooms: String[] (owned room codes)\n• googleId?: String, picture?: String", ha='left', va='center', fontsize=7.5, color="#0f172a")

    # 2. tokens
    b_tokens = patches.FancyBboxPatch((5.3, 5.2), 4.2, 2.6, boxstyle="round,pad=0.08,rounding_size=0.1",
                                     linewidth=1.4, edgecolor="#059669", facecolor="#f0fdf4")
    ax.add_patch(b_tokens)
    ax.text(5.5, 7.55, "Collection: tokens", ha='left', va='center', fontsize=9.5, fontweight='bold', color="#047857")
    ax.text(5.5, 6.3, "• token: String (32-byte hex, unique index)\n• userId: String (references users.id, index)\n• createdAt: Number (TTL: 30 days)\n• updatedAt: Number", ha='left', va='center', fontsize=7.5, color="#0f172a")

    # 3. rooms
    b_rooms = patches.FancyBboxPatch((0.5, 1.4), 4.2, 2.9, boxstyle="round,pad=0.08,rounding_size=0.1",
                                    linewidth=1.4, edgecolor="#d97706", facecolor="#fffbeb")
    ax.add_patch(b_rooms)
    ax.text(0.7, 4.05, "Collection: rooms", ha='left', va='center', fontsize=9.5, fontweight='bold', color="#b45309")
    ax.text(0.7, 2.8, "• id: String (Room code XXX-XXX, unique index)\n• name: String (Custom display name)\n• creatorId: String (references users.id, index)\n• creatorName: String\n• createdAt: Number\n• isLocked: Boolean (Host lock toggle)", ha='left', va='center', fontsize=7.5, color="#0f172a")

    # 4. room_elements & elements
    b_elements = patches.FancyBboxPatch((5.3, 1.4), 4.2, 2.9, boxstyle="round,pad=0.08,rounding_size=0.1",
                                       linewidth=1.4, edgecolor="#7c3aed", facecolor="#faf5ff")
    ax.add_patch(b_elements)
    ax.text(5.5, 4.05, "Collection: room_elements & Local Storage", ha='left', va='center', fontsize=9.5, fontweight='bold', color="#6d28d9")
    ax.text(5.5, 2.75, "• roomId: String (index)\n• elementId: String (unique compound {roomId, elementId})\n• data: Object (stroke, shape, sticky, text, wire)\n• updatedAt: Number\n\nClient-Side Persistence Layers:\n• soloStorage (Offline whiteboard autosave)\n• guestIdentity (UUID, name, avatar continuity)\n• recentRooms (LRU room history tracker)\n• aiSessionStorage (Diagram chat history)", ha='left', va='center', fontsize=7.2, color="#0f172a")

    # Inter-collection relationships
    ax.annotate('', xy=(5.3, 6.5), xytext=(4.7, 6.5),
                arrowprops=dict(arrowstyle="->", color="#0284c7", lw=1.5, ls="--"))
    ax.text(5.0, 6.7, "1 : N (userId)", ha='center', va='bottom', fontsize=7.5, fontweight='bold', color="#0369a1")

    ax.annotate('', xy=(2.6, 4.3), xytext=(2.6, 4.8),
                arrowprops=dict(arrowstyle="->", color="#b45309", lw=1.5, ls="--"))
    ax.text(2.9, 4.55, "1 : N (creatorId)", ha='left', va='center', fontsize=7.5, fontweight='bold', color="#b45309")

    ax.annotate('', xy=(5.3, 2.9), xytext=(4.7, 2.9),
                arrowprops=dict(arrowstyle="->", color="#6d28d9", lw=1.5, ls="--"))
    ax.text(5.0, 3.1, "1 : N (roomId)", ha='center', va='bottom', fontsize=7.5, fontweight='bold', color="#6d28d9")

    # Architectural note
    ax.text(5.0, 0.55, "Note: MongoDB collections feature automatic compound indexes and TTL cleanup. Client storage\n(soloStorage, guestIdentity, recentRooms, aiSessionStorage) guarantees zero work loss even when offline.", ha='center', va='center', fontsize=7.6, style='italic', color="#475569")

    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    plt.close()
    print(f"Generated {output_path}")

if __name__ == "__main__":
    create_system_architecture_diagram()
    create_drawing_dataflow_diagram()
    create_ai_pipeline_diagram()
    create_database_schema_diagram()
