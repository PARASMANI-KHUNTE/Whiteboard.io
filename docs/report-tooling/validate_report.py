import docx
import os
import re
import sys
import tempfile
import build_project_report

TOOLING_DIR = os.path.dirname(os.path.abspath(__file__))

def validate(check_freshness=False):
    filename = os.path.join(TOOLING_DIR, "Generated_Project_Report.docx")
    assert os.path.exists(filename), f"File {filename} does not exist!"
    doc = docx.Document(filename)
    
    print(f"File: {filename}")
    print(f"File size: {os.path.getsize(filename)} bytes")
    print(f"Total paragraphs: {len(doc.paragraphs)}")
    print(f"Total tables: {len(doc.tables)}")
    print(f"Total sections: {len(doc.sections)}")
    
    # Check text content
    full_text = "\n".join([p.text for p in doc.paragraphs])
    
    # Check for forbidden placeholder patterns
    forbidden = ["[PLACEHOLDER]", "TODO", "TBD", "Lorem Ipsum", "dummy text"]
    for word in forbidden:
        count = full_text.count(word)
        print(f"Count of '{word}': {count}")
        assert count == 0, f"Found forbidden placeholder: {word}"
        
    # Check critical strings
    assert "Whiteboard.io" in full_text
    assert "Parasmani Khunte" in full_text
    assert "MCA Semester 3" in full_text
    assert any(m in full_text for m in ["Google Gemini 3.8 Flash", "gemini-3.8", "gemini-2.5", "gemini-1.5", "Gemini"])
    assert "Ollama" in full_text
    assert "https://whiteboard-io-1.onrender.com/" in full_text
    assert "WebRTC" in full_text
    assert "Socket.io" in full_text
    assert "PBKDF2" in full_text
    assert "The server includes an automated test suite using Node.js's built-in test runner" in full_text
    assert "No formal automated test suite was identified in the analyzed repository." not in full_text
    assert "v20.19.0" in full_text, "Node.js v20.19.0 must be cited in software prerequisites"
    assert "v18.0.0" not in full_text, "Found stale reference to Node.js v18.0.0"
    
    # Check diagrams exist and have non-trivial size
    diagrams = [
        "diagram_architecture.png",
        "diagram_dataflow.png",
        "diagram_ai_pipeline.png",
        "diagram_database_schema.png",
    ]
    for name in diagrams:
        path = os.path.join(TOOLING_DIR, name)
        assert os.path.exists(path), f"Diagram {path} is missing!"
        assert os.path.getsize(path) > 10_000, f"Diagram {path} is empty or corrupted!"

    # Check Abstract word count
    abstract_match = re.search(r"ABSTRACT\s+―+\s+(.*?)\s+Keywords:", full_text, re.DOTALL)
    if abstract_match:
        abstract_body = abstract_match.group(1).strip()
        words = abstract_body.split()
        print(f"Abstract word count: {len(words)} words")
        assert 240 <= len(words) <= 320, f"Abstract word count {len(words)} is not in target range!"
    else:
        print("Could not isolate abstract text with regex; checking manual count.")

    # Check headings
    headings = [p.text for p in doc.paragraphs if p.text.startswith(("1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "CERTIFICATE", "CANDIDATE", "ACKNOWLEDGEMENT", "ABSTRACT", "TABLE"))]
    print("\nDetected Major Headings:")
    for h in headings:
        print(" -", h)
        
    # Check tables
    print(f"\nTables Summary ({len(doc.tables)} tables):")
    for i, t in enumerate(doc.tables):
        print(f" Table {i+1}: {len(t.rows)} rows x {len(t.columns)} cols")

    # Verify freshness against generator
    if check_freshness:
        print("\nVerifying report freshness against generator...")
        with tempfile.TemporaryDirectory() as tmpdir:
            temp_docx = os.path.join(tmpdir, "fresh_report.docx")
            build_project_report.build_report(output_filename=temp_docx)
            fresh_doc = docx.Document(temp_docx)
            fresh_text = "\n".join([p.text for p in fresh_doc.paragraphs])
            assert fresh_text == full_text, (
                "Committed Generated_Project_Report.docx is stale relative to build_project_report.py! "
                "Run 'python docs/report-tooling/build_project_report.py' to regenerate."
            )
        print("Freshness check passed: committed report matches generator output.")
        
    print("\nALL VALIDATION CHECKS PASSED PERFECTLY!")

if __name__ == "__main__":
    check_fresh = "--check-freshness" in sys.argv or os.environ.get("CHECK_DOCS_FRESHNESS") == "1"
    validate(check_freshness=check_fresh)
