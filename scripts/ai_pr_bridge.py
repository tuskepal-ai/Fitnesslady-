#!/usr/bin/env python3
"""
AI PR Bridge (MVP)

Triggered by GitHub Actions on issue_comment created.
Commands:
  /ai plan <request>
  /ai pr   <request>

Behavior:
- Reads the issue comment body from env (COMMENT_BODY).
- Posts a plan back to the issue for /ai plan.
- For /ai pr: asks the model for a JSON change-set (allowed paths only),
  writes changes on a new branch, and opens a PR.
- Strict allowlist: only paths under ".github/" and "docs/" are permitted.
- PR-only: never pushes to main; always creates a branch + PR.

Required env:
  OPENAI_API_KEY
  GH_TOKEN (GITHUB_TOKEN is passed in workflow as GH_TOKEN)
  REPO_FULL (e.g. tuskepal-ai/Fitnesslady)
  ISSUE_NUMBER
  COMMENT_BODY
Optional env:
  AI_MODEL (default: gpt-4.1-mini)
  BASE_BRANCH (default: main)
"""

import json
import os
import random
import re
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
AI_MODEL = (os.getenv("AI_MODEL") or "gpt-4.1-mini").strip()
GH_TOKEN = (os.getenv("GH_TOKEN") or "").strip()

REPO_FULL = (os.getenv("REPO_FULL") or "").strip()
ISSUE_NUMBER = (os.getenv("ISSUE_NUMBER") or "").strip()
COMMENT_BODY = (os.getenv("COMMENT_BODY") or "").strip()
BASE_BRANCH = (os.getenv("BASE_BRANCH") or "main").strip()

API = "https://api.github.com"
OPENAI_URL = "https://api.openai.com/v1/responses"

# Allowlist: only docs/ and .github/
ALLOWED_PREFIXES = ("docs/", ".github/")

GH_HEADERS = {
    "Authorization": f"Bearer {GH_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "fitnesslady-ai-pr-bridge",
}

# ----------------------------
# Utility / logging
# ----------------------------

def die(msg: str, code: int = 1) -> None:
    print(f"[AI-BRIDGE][FATAL] {msg}", file=sys.stderr)
    raise SystemExit(code)

def require_env() -> None:
    missing = []
    for k, v in [
        ("OPENAI_API_KEY", OPENAI_API_KEY),
        ("GH_TOKEN", GH_TOKEN),
        ("REPO_FULL", REPO_FULL),
        ("ISSUE_NUMBER", ISSUE_NUMBER),
        ("COMMENT_BODY", COMMENT_BODY),
    ]:
        if not v:
            missing.append(k)
    if missing:
        die(f"Missing required env vars: {', '.join(missing)}")

def jitter_sleep(attempt: int) -> None:
    # 1,2,4,8,16,32 (+ jitter)
    base = min(2 ** (attempt - 1), 32)
    time.sleep(base + random.uniform(0, 0.5))

# ----------------------------
# GitHub API helpers
# ----------------------------

def gh(method: str, url: str, **kwargs) -> Any:
    """GitHub request with debug + raises on error."""
    r = requests.request(method, url, headers=GH_HEADERS, timeout=60, **kwargs)
    print(f"[GH] {method} {url} -> {r.status_code}")
    if not r.ok:
        print("[GH] error body:", r.text[:2000])
        r.raise_for_status()
    if not r.text:
        return {}
    try:
        return r.json()
    except Exception:
        return {"raw": r.text}

def post_issue_comment(text: str) -> None:
    url = f"{API}/repos/{REPO_FULL}/issues/{ISSUE_NUMBER}/comments"
    print("[AI-BRIDGE] Posting issue comment...")
    gh("POST", url, json={"body": text})
    print("[AI-BRIDGE] Comment posted OK.")

def get_default_branch_sha(branch: str) -> str:
    url = f"{API}/repos/{REPO_FULL}/git/ref/heads/{branch}"
    data = gh("GET", url)
    sha = data.get("object", {}).get("sha")
    if not sha:
        die(f"Could not resolve branch SHA for {branch}")
    return sha

def create_branch(branch_name: str, from_sha: str) -> None:
    url = f"{API}/repos/{REPO_FULL}/git/refs"
    gh("POST", url, json={"ref": f"refs/heads/{branch_name}", "sha": from_sha})

def get_file_sha(path: str, ref: str) -> Optional[str]:
    # contents API returns 404 if not exists
    url = f"{API}/repos/{REPO_FULL}/contents/{path}"
    r = requests.get(url, headers=GH_HEADERS, params={"ref": ref}, timeout=60)
    print(f"[GH] GET {url}?ref={ref} -> {r.status_code}")
    if r.status_code == 404:
        return None
    if not r.ok:
        print("[GH] error body:", r.text[:2000])
        r.raise_for_status()
    data = r.json()
    return data.get("sha")

def put_file(path: str, content_text: str, message: str, branch: str) -> None:
    url = f"{API}/repos/{REPO_FULL}/contents/{path}"
    existing_sha = get_file_sha(path, branch)
    payload: Dict[str, Any] = {
        "message": message,
        "content": content_text.encode("utf-8").decode("utf-8").encode("utf-8").hex(),  # temp
        "branch": branch,
    }

    # GitHub expects base64, so do it properly:
    import base64
    payload["content"] = base64.b64encode(content_text.encode("utf-8")).decode("ascii")

    if existing_sha:
        payload["sha"] = existing_sha

    gh("PUT", url, json=payload)

def delete_file(path: str, message: str, branch: str) -> None:
    url = f"{API}/repos/{REPO_FULL}/contents/{path}"
    sha = get_file_sha(path, branch)
    if not sha:
        print(f"[AI-BRIDGE] delete_file skipped (not found): {path}")
        return
    payload = {"message": message, "sha": sha, "branch": branch}
    gh("DELETE", url, json=payload)

def open_pull_request(title: str, body: str, head: str, base: str) -> str:
    url = f"{API}/repos/{REPO_FULL}/pulls"
    data = gh("POST", url, json={"title": title, "body": body, "head": head, "base": base})
    pr_url = data.get("html_url", "")
    if not pr_url:
        die("PR creation failed: missing html_url")
    return pr_url

# ----------------------------
# OpenAI helper (retry on 429/5xx)
# ----------------------------

def call_openai(prompt: str) -> str:
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": AI_MODEL, "input": prompt}

    for attempt in range(1, 7):
        r = requests.post(OPENAI_URL, headers=headers, json=payload, timeout=120)

        if r.status_code in (429, 500, 502, 503, 504):
            print(f"[OPENAI] transient {r.status_code}. retry {attempt}/6")
            jitter_sleep(attempt)
            continue

        if not r.ok:
            print("[OPENAI] error body:", r.text[:2000])
            r.raise_for_status()

        data = r.json()
        out = ""
        for item in data.get("output", []):
            for c in item.get("content", []):
                if c.get("type") == "output_text":
                    out += c.get("text", "")
        return out.strip()

    die("OpenAI API: too many transient errors (429/5xx) after retries")

def extract_json(text: str) -> Dict[str, Any]:
    """
    Robust JSON extractor:
    - If text is pure JSON, parse it.
    - Else extract the first {...} block and parse.
    """
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass

    m = re.search(r"\{.*\}", text, flags=re.S)
    if not m:
        raise ValueError("No JSON object found in model output.")
    return json.loads(m.group(0))

# ----------------------------
# Command logic
# ----------------------------

def validate_path(path: str) -> None:
    if not any(path.startswith(pfx) for pfx in ALLOWED_PREFIXES):
        raise ValueError(f"Path not allowed: {path} (allowed: {ALLOWED_PREFIXES})")
    if ".." in path or path.startswith("/"):
        raise ValueError(f"Invalid path: {path}")

def build_plan_prompt(user_request: str) -> str:
    return f"""You are an assistant helping with a GitHub repository workflow.
Return a concise, actionable plan in Markdown bullet points.

Repo: {REPO_FULL}
Constraints:
- Only docs/ and .github/ paths are allowed for code changes.
- PR-only workflow (never push to main).

User request:
{user_request}
"""

def build_pr_prompt(user_request: str) -> str:
    return f"""You are an assistant preparing a safe GitHub PR change-set.

Repo: {REPO_FULL}
Base branch: {BASE_BRANCH}

STRICT constraints:
- You may ONLY modify or create files under these prefixes: {list(ALLOWED_PREFIXES)}
- Do NOT include any other paths.
- Output MUST be valid JSON (no prose).

JSON schema:
{{
  "title": "PR title",
  "body": "PR body markdown",
  "commit_message": "Commit message",
  "changes": [
    {{
      "path": "docs/.. or .github/..",
      "action": "upsert" | "delete",
      "content": "file content (required for upsert)"
    }}
  ]
}}

User request:
{user_request}
"""

def cmd_plan(user_request: str) -> None:
    prompt = build_plan_prompt(user_request)
    plan_md = call_openai(prompt)
    if not plan_md:
        plan_md = "_(No plan returned.)_"
    post_issue_comment("🧠 **AI PLAN**\n\n" + plan_md)

def cmd_pr(user_request: str) -> None:
    # Ask model for JSON change-set
    prompt = build_pr_prompt(user_request)
    raw = call_openai(prompt)

    try:
        spec = extract_json(raw)
    except Exception as e:
        post_issue_comment(
            "❌ **AI PR generation failed**: could not parse JSON from model output.\n\n"
            f"Error: `{e}`\n\n"
            "Tip: Try again, or simplify the request."
        )
        return

    title = (spec.get("title") or "AI PR").strip()
    body = (spec.get("body") or "").strip()
    commit_message = (spec.get("commit_message") or "chore: AI changes").strip()
    changes = spec.get("changes") or []

    # Validate changes
    if not isinstance(changes, list) or not changes:
        post_issue_comment("❌ **AI PR generation failed**: `changes` must be a non-empty list.")
        return

    for ch in changes:
        if not isinstance(ch, dict):
            post_issue_comment("❌ **AI PR generation failed**: each change must be an object.")
            return
        path = (ch.get("path") or "").strip()
        action = (ch.get("action") or "").strip()
        if not path or action not in ("upsert", "delete"):
            post_issue_comment("❌ **AI PR generation failed**: invalid change entry.")
            return
        try:
            validate_path(path)
        except Exception as e:
            post_issue_comment(f"❌ **Blocked**: {e}")
            return
        if action == "upsert" and "content" not in ch:
            post_issue_comment(f"❌ **AI PR generation failed**: missing `content` for {path}")
            return

    # Create branch from base
    base_sha = get_default_branch_sha(BASE_BRANCH)
    branch_name = f"ai/pr-{ISSUE_NUMBER}-{int(time.time())}"

    try:
        create_branch(branch_name, base_sha)
    except Exception as e:
        post_issue_comment(f"❌ Failed to create branch `{branch_name}`: `{e}`")
        return

    # Apply file changes (contents API)
    try:
        for ch in changes:
            path = ch["path"].strip()
            action = ch["action"].strip()
            if action == "delete":
                delete_file(path, commit_message, branch_name)
            else:
                content = ch["content"]
                put_file(path, content, commit_message, branch_name)
    except Exception as e:
        post_issue_comment(f"❌ Failed applying changes on `{branch_name}`: `{e}`")
        return

    # Open PR
    try:
        pr_url = open_pull_request(
            title=title,
            body=(body + f"\n\n---\nTriggered from Issue #{ISSUE_NUMBER}.").strip(),
            head=branch_name,
            base=BASE_BRANCH,
        )
    except Exception as e:
        post_issue_comment(f"❌ Failed to open PR: `{e}`")
        return

    post_issue_comment(
        "✅ **AI PR created**\n\n"
        f"- Branch: `{branch_name}`\n"
        f"- PR: {pr_url}\n\n"
        "Next: review the PR, run checks, then merge."
    )

# ----------------------------
# Main
# ----------------------------

def parse_command(body: str) -> Tuple[str, str]:
    # Expected: /ai plan ... OR /ai pr ...
    m = re.match(r"^\s*/ai\s+(plan|pr)\s*(.*)\s*$", body, flags=re.I | re.S)
    if not m:
        return "", ""
    cmd = m.group(1).lower().strip()
    rest = (m.group(2) or "").strip()
    return cmd, rest

def main() -> None:
    require_env()

    cmd, rest = parse_command(COMMENT_BODY)
    if not cmd:
        print("[AI-BRIDGE] Not an /ai command. Exiting.")
        return

    # Optional quick acknowledgement (commenting is now allowed if workflow has issues: write)
    # Commenting on every trigger is noisy, so we keep it off by default.
    # post_issue_comment("✅ AI Bridge triggered. Processing command…")

    if cmd == "plan":
        if not rest:
            post_issue_comment("ℹ️ Usage: `/ai plan <what you want>`")
            return
        cmd_plan(rest)
        return

    if cmd == "pr":
        if not rest:
            post_issue_comment("ℹ️ Usage: `/ai pr <what you want>`")
            return
        cmd_pr(rest)
        return

    print(f"[AI-BRIDGE] Unknown command: {cmd}")

if __name__ == "__main__":
    main()
