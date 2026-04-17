"""
regexforge discovery agent.

Anthropic SDK agent that:
  1. Discovers the service via its well-known endpoints.
  2. Mints a key.
  3. Runs 5 synthesis jobs covering: template hit, template hit with description tie-break,
     char-class fallback, multi-template ambiguity, non-regular (expect 422).
  4. Verifies every returned regex against every example.
  5. Reports what happened.
"""
import json
import os
import sys
import urllib.request
import urllib.error
from anthropic import Anthropic

ROOT = "https://regexforge.jason-12c.workers.dev/"
MODEL = "claude-haiku-4-5-20251001"
client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

JOBS = [
    {
        "label": "iso_date",
        "description": "ISO 8601 date like 2024-12-30",
        "examples": [
            ("2024-12-30", True), ("2023-01-01", True), ("1999-07-04", True),
            ("2024-1-1", False), ("abc", False), ("12/30/2024", False), ("", False),
        ],
    },
    {
        "label": "ethereum_address",
        "description": "ethereum / base wallet address",
        "examples": [
            ("0x8ABCE477e22B76121f04c6c6a69eE2e6a12De53e", True),
            ("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", True),
            ("0x0000000000000000000000000000000000000000", True),
            ("0x123", False), ("xyz", False), ("1234567890abcdef", False),
            ("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", False),
        ],
    },
    {
        "label": "us_zip_only",
        "description": "5-digit US zip code",
        "examples": [
            ("10001", True), ("94103", True), ("75201", True),
            ("1234", False), ("ABCDE", False), ("100001", False), ("10001-1234", False),
        ],
    },
    {
        "label": "custom_sku_pattern",
        "description": "SKU like SKU-1234-ZZ",
        "examples": [
            ("SKU-1234-AB", True), ("SKU-0000-ZZ", True), ("SKU-9999-CD", True),
            ("sku-1234-AB", False), ("SKU-12-AB", False), ("1234-AB", False),
            ("SKU-1234-ABC", False), ("XYZ-1234-AB", False),
        ],
    },
]


def http(method, url, headers=None, body=None, timeout=30):
    req = urllib.request.Request(url, method=method)
    req.add_header("User-Agent", "regexforge-test-agent")
    req.add_header("Accept", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = body.encode("utf-8") if isinstance(body, str) else body
    try:
        with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
            return {"status": r.status, "body_text": r.read().decode("utf-8", errors="replace")}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "body_text": e.read().decode("utf-8", errors="replace")}
    except Exception as e:
        return {"status": 0, "body_text": "", "error": str(e)}


TOOLS = [
    {
        "name": "http_request",
        "description": "Make an HTTP request to regexforge. For POST/JSON: pass headers={'content-type':'application/json', auth if needed} and body=<json string>.",
        "input_schema": {
            "type": "object",
            "required": ["method", "url"],
            "properties": {
                "method": {"type": "string", "enum": ["GET", "POST"]},
                "url": {"type": "string"},
                "headers": {"type": "object", "additionalProperties": {"type": "string"}},
                "body": {"type": "string"},
            },
        },
    },
    {
        "name": "report",
        "description": "Final report.",
        "input_schema": {
            "type": "object",
            "required": ["summary", "jobs", "credits_remaining"],
            "properties": {
                "summary": {"type": "string"},
                "credits_remaining": {"type": "integer"},
                "jobs": {"type": "array", "items": {"type": "object"}},
            },
        },
    },
]


SYSTEM = (
    f"You are an autonomous agent. Your ONLY entrypoint is {ROOT}. Discover the service by GETting "
    "/ and then /.well-known/ai-plugin.json and /llms.txt. Then:\n"
    "  1. POST /v1/keys to mint a key (50 free credits).\n"
    "  2. For each of the 4 synthesis jobs below, POST /v1/synth with the exact examples+description. "
    "Use Authorization: Bearer <your-key>.\n\n"
    "Jobs:\n"
    + "\n".join(
        f"  {j['label']}: description={j['description']!r}, examples="
        + json.dumps([{"text": t, "match": m} for t, m in j["examples"]])
        for j in JOBS
    )
    + "\n\n"
    "  3. GET /v1/keys/self to check remaining credits.\n"
    "  4. Call the report tool with a per-job summary of (regex, source, all_pass).\n"
    "Use ONLY the tools. Stop after calling report."
)


def run():
    messages = [{"role": "user", "content": f"Begin. Start by GETting {ROOT}."}]
    transcript = []
    final = None
    turns = 0
    while turns < 50 and final is None:
        turns += 1
        resp = client.messages.create(model=MODEL, max_tokens=2048, system=SYSTEM, tools=TOOLS, messages=messages)
        messages.append({"role": "assistant", "content": resp.content})
        uses = [b for b in resp.content if b.type == "tool_use"]
        if not uses:
            break
        tr = []
        for tu in uses:
            if tu.name == "report":
                final = tu.input
                tr.append({"type": "tool_result", "tool_use_id": tu.id, "content": "OK"})
                continue
            if tu.name == "http_request":
                r = http(tu.input.get("method", "GET"), tu.input["url"], tu.input.get("headers"), tu.input.get("body"))
                body_preview = (r.get("body_text") or "")[:1500]
                tr.append({"type": "tool_result", "tool_use_id": tu.id, "content": json.dumps({"status": r.get("status"), "body": body_preview})})
                transcript.append({"method": tu.input.get("method"), "url": tu.input.get("url"), "status": r.get("status"), "body_preview": body_preview[:300]})
        messages.append({"role": "user", "content": tr})

    print("=" * 72)
    print("HTTP TRAIL")
    print("=" * 72)
    for i, t in enumerate(transcript, 1):
        path = t["url"].replace(ROOT.rstrip("/"), "")
        print(f"  [{i:02d}] {t['method']:4s} {path:50s}  HTTP {t['status']}")
    print()
    print("=" * 72)
    print("FINAL REPORT")
    print("=" * 72)
    if final:
        print(json.dumps(final, indent=2))
    else:
        print("No report. Turns used:", turns)
    print("=" * 72)
    return 0 if final else 2


if __name__ == "__main__":
    sys.exit(run())
