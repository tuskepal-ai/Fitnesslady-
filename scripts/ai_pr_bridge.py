import os, re, json, subprocess
from datetime import datetime
import requests

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
AI_MODEL = os.environ.get("AI_MODEL") or "gpt-4.1"
GH_TOKEN = os.environ["GH_TOKEN"]

REPO_FULL = os.environ["REPO_FULL"]
ISSUE_NUMBER = int(os.environ["ISSUE_NUMBER"])
COMMENT_BODY = os.environ["COMMENT_BODY"].strip()

API = "https://api.github.com"
GH_HEADERS = {
    "Authorization": f"Bearer {GH_TOKEN}",
    "Accept": "application/vnd.github+json",
}

# Safety: only allow these paths for MVP
ALLOWED_PREFIXES = (".github/", "docs/")

def sh(cmd: str):
    subprocess.check_call(cmd, shell=True)

def gh(method: str, url: str, **kwargs):
    r = requests.request(method, url, headers=GH_HEADERS, timeout=60, **kwargs)
    r.raise_for_status()
    return r.json() if r.text else {}

def post_issue_comment(text: str):
    url = f"{API}/repos/{REPO_FULL}/issues/{ISSUE_NUMBER}/comments"
    gh("POST", url, json={"body": text})

def get_default_branch() -> str:
    data = gh("GET", f"{API}/repos/{REPO_FULL}")
    return data["default_branch"]

def get_issue() -> dict:
    return gh("GET", f"{API}/repos/{REPO_FULL}/issues/{ISSUE_NUMBER}")

def call_openai(prompt: str) -> str:
    url = "https://api.openai.com/v1/responses"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": AI_MODEL, "input": prompt}
    r = requests.post(url, headers=headers, json=payload, timeout=120)
    r.raise_for_status()
    data = r.json()

    out = ""
    for item in data.get("output", []):
        for c in item.get("content", []):
            if c.get("type") == "output_text":
                out += c.get("text", "")
    return out.strip()

def ensure_allowed_path(path: str) -> bool:
    path = path.lstrip("/")
    return any(path.startswith(p) for p in ALLOWED_PREFIXES)

def main():
    m = re.match(r"^/ai\s+(plan|pr)\s*(.*)$", COMMENT_BODY, re.IGNORECASE | re.DOTALL)
    if not m:
        return

    mode = m.group(1).lower()
    request_text = (m.group(2) or "").strip()

    issue = get_issue()
    title = issue.get("title", "")
    body = issue.get("body") or ""

    default_branch = get_default_branch()

    prompt = f"""
You are an AI assistant creating a PR for repo {REPO_FULL}.
STRICT RULES:
- Output MUST be valid JSON only. No markdown. No extra text.
- Only propose changes to paths starting with: {list(ALLOWED_PREFIXES)}.
- Prefer minimal diffs.
- If unsure, return an empty changes list.

Return JSON in this schema:
{{
  "plan": ["..."],
  "changes": [
    {{
      "path": "relative/path",
      "action": "create|update",
      "content": "FULL FILE CONTENT"
    }}
  ],
  "pr_title": "string",
  "pr_body": "string"
}}

Issue title: {title}
Issue body: {body}

User request: {request_text if request_text else "(no extra details)"}
"""

    raw = call_openai(prompt)

    try:
        spec = json.loads(raw)
    except Exception:
        post_issue_comment("❌ AI output was not valid JSON. No changes applied.")
        return

    plan = spec.get("plan", [])
    changes = spec.get("changes", [])

    if mode == "plan":
        txt = "🧠 AI PLAN:\n" + "\n".join([f"- {p}" for p in plan]) if plan else "🧠 AI PLAN: (empty)"
        post_issue_comment(txt)
        return

    if not changes:
        txt = "ℹ️ No safe changes proposed.\n\nPlan:\n" + "\n".join([f"- {p}" for p in plan]) if plan else "ℹ️ No safe changes proposed."
        post_issue_comment(txt)
        return

    for ch in changes:
        p = (ch.get("path") or "").lstrip("/")
        if not p or not ensure_allowed_path(p):
            post_issue_comment(f"❌ Blocked change outside allowlist: `{p}`. No changes applied.")
            return

    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    branch = f"ai/{ISSUE_NUMBER}-{ts}"

    base_ref = gh("GET", f"{API}/repos/{REPO_FULL}/git/ref/heads/{default_branch}")
    base_sha = base_ref["object"]["sha"]

    gh("POST", f"{API}/repos/{REPO_FULL}/git/refs", json={
        "ref": f"refs/heads/{branch}",
        "sha": base_sha
    })

    sh(f"git fetch origin {branch}")
    sh(f"git checkout {branch}")

    touched = []
    for ch in changes:
        path = ch["path"].lstrip("/")
        content = ch.get("content", "")
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        touched.append(path)

    sh("git add " + " ".join([f"'{p}'" for p in touched]))
    sh(f"git commit -m \"ai: apply changes for issue #{ISSUE_NUMBER}\"")
    sh(f"git push origin {branch}")

    pr_title = spec.get("pr_title") or f"AI: changes for issue #{ISSUE_NUMBER}"
    pr_body = (spec.get("pr_body") or "").strip()
    pr_body += "\n\n---\n**AI Bridge**: Generated from `/ai pr`.\n"
    pr_body += "\n**Touched files:**\n" + "\n".join([f"- {p}" for p in touched])

    pr = gh("POST", f"{API}/repos/{REPO_FULL}/pulls", json={
        "title": pr_title,
        "head": branch,
        "base": default_branch,
        "body": pr_body
    })

    post_issue_comment(f"✅ PR created: {pr.get('html_url')}")

if __name__ == "__main__":
    main()
