#!/usr/bin/env python3
"""
Secret scanning utility for Whiteboard.io repository.
Scans all tracked files (and optionally staged files) for high-entropy secrets,
Google API keys, OAuth secrets, private keys, and credentials.
"""

import os
import re
import subprocess
import sys

SECRET_PATTERNS = [
    (re.compile(r"AIza[0-9A-Za-z\-_]{35}"), "Google API Key (AIza...)"),
    (re.compile(r"GOCSPX-[a-zA-Z0-9_\-]{28}"), "Google OAuth Client Secret (GOCSPX-...)"),
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"), "Private Key Block"),
    (re.compile(r"mongodb(?:\+srv)?:\/\/[a-zA-Z0-9_\-\.]+:(?!(?:<password>|\$\{?[A-Z0-9_]+\}?))[^\s@]+@"), "MongoDB URI with embedded password"),
    (re.compile(r"(?:api_key|secret|password|bearer_token)\s*=\s*['\"][A-Za-z0-9_\-]{32,}['\"]", re.IGNORECASE), "Generic Hardcoded Secret Token"),
]

# Allowlisted sample/mock files or test tokens
ALLOWLIST_SUBSTRINGS = [
    "secret-gemini-test-key-12345",
    "your_gemini_api_key_here",
    "your_key_here",
    "your-google-client-id",
    "your-google-client-secret",
    "cluster0.mongodb.net",
    "cluster0.abcde.mongodb.net",
    "<user>:<password>",
    "<username>:<password>",
]

def is_allowlisted(line):
    return any(sub in line for sub in ALLOWLIST_SUBSTRINGS)

def get_tracked_files():
    try:
        output = subprocess.check_output(["git", "ls-files"], text=True, stderr=subprocess.DEVNULL)
        return [f.strip() for f in output.splitlines() if f.strip() and os.path.exists(f.strip())]
    except Exception as e:
        print(f"Warning: Could not list git files ({e}), scanning local workspace files.")
        files = []
        for root, _, filenames in os.walk("."):
            if ".git" in root or "node_modules" in root or "dist" in root:
                continue
            for f in filenames:
                files.append(os.path.normpath(os.path.join(root, f)))
        return files

def scan_files():
    tracked_files = get_tracked_files()
    violations = []

    # Check for tracked .env files
    for path in tracked_files:
        norm_path = os.path.normpath(path)
        base = os.path.basename(norm_path)
        if base == ".env" or (base.startswith(".env.") and not base.endswith(".example")):
            violations.append((path, 1, "Environment file must not be tracked in git repository"))

    for path in tracked_files:
        norm_path = os.path.normpath(path)
        # Skip binary files, lockfiles, or generator docx/pngs
        if any(norm_path.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".ico", ".docx", ".pdf", ".lock", "package-lock.json"]):
            continue

        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                for line_no, line in enumerate(f, start=1):
                    if is_allowlisted(line):
                        continue
                    for pattern, desc in SECRET_PATTERNS:
                        if pattern.search(line):
                            violations.append((path, line_no, f"Potential {desc} detected: {line.strip()[:60]}..."))
        except Exception as e:
            print(f"Warning: could not read {path}: {e}")

    return violations

def main():
    print("Running Whiteboard.io repository secret scan...")
    violations = scan_files()
    if violations:
        print(f"\n[FAIL] Found {len(violations)} secret violation(s):")
        for path, line_no, msg in violations:
            print(f"  - {path}:{line_no}: {msg}")
        sys.exit(1)
    else:
        print("[PASS] Secret scan passed: no credentials or sensitive .env files detected.")

if __name__ == "__main__":
    main()
