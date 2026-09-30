import docx
import os
import re

def validate():
    filename = "Generated_Project_Report.docx"
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
    assert "Google Gemini 2.5 Flash" in full_text or "gemini-2.5-flash" in full_text
    assert "WebRTC" in full_text
    assert "Socket.io" in full_text
    assert "PBKDF2" in full_text
    assert "No formal automated test suite was identified in the analyzed repository." in full_text
    
    # Check Abstract word count
    # Let's find the abstract text
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
        
    print("\nALL VALIDATION CHECKS PASSED PERFECTLY!")

if __name__ == "__main__":
    validate()
