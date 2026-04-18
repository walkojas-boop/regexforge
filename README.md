# regexforge

**An MCP (Model Context Protocol) server that synthesizes production-grade regexes from labeled examples.** Zero LLM at serve time — pure symbolic synthesis over a template bank with a character-class inference fallback. Every response includes a proof matrix and a backtracking-risk audit.

- **MCP transport:** HTTP (streamable) · **Protocol version:** `2024-11-05`
- **MCP endpoint:** `https://regexforge.jason-12c.workers.dev/mcp`
- **MCP manifest:** https://regexforge.jason-12c.workers.dev/.well-known/mcp.json

---

## The MCP Tool

regexforge exposes a single MCP tool. An AI client (Claude Desktop, Cline, Continue, Cursor, or any MCP-aware agent) calls it the same way it would call any other MCP tool — `tools/call` over JSON-RPC 2.0.

### `regexforge_synth`

Synthesize a battle-tested regex from labeled examples.

**Input schema** (what the model supplies):

```json
{
  "type": "object",
  "required": ["examples"],
  "properties": {
    "description": {
      "type": "string",
      "description": "Optional natural-language description of the target pattern. Used only for tie-breaking when multiple templates fit."
    },
    "examples": {
      "type": "array",
      "minItems": 2,
      "maxItems": 100,
      "items": {
        "type": "object",
        "required": ["text", "match"],
        "properties": {
          "text":  { "type": "string", "maxLength": 2048 },
          "match": { "type": "boolean", "description": "true if the regex should match this string; false if it should NOT match." }
        }
      }
    }
  }
}
```

**Output schema:**

```json
{
  "regex": "string",
  "flags": "string",
  "source": "template | char_class",
  "template_name": "string (if source=template)",
  "test_matrix": [
    { "text": "string", "expected": "boolean", "actual": "boolean", "pass": "boolean" }
  ],
  "all_pass": "boolean",
  "backtrack_risk": "none | low | high",
  "backtrack_reasons": [ "string" ],
  "candidates_considered": "integer",
  "candidates_passing": "integer",
  "notes": [ "string" ]
}
```

Errors return JSON-RPC error objects with structured remediation:

- `not_expressible` (HTTP 422) — examples imply a non-regular language (balanced-parens, counting, etc.).
- `no_credits` (HTTP 402) — wallet empty, purchase via `/v1/credits`.
- `missing_input` (HTTP 400) — `fix` field tells you exactly what's missing.

---

## Connecting from MCP Clients

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "regexforge": {
      "transport": {
        "type": "http",
        "url": "https://regexforge.jason-12c.workers.dev/mcp"
      },
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Get an API key with: `curl -X POST https://regexforge.jason-12c.workers.dev/v1/keys` (free, 50 credits on signup).

### Python (official `mcp` SDK)

```python
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def main():
    url = "https://regexforge.jason-12c.workers.dev/mcp"
    headers = {"Authorization": "Bearer YOUR_API_KEY"}
    async with streamablehttp_client(url, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            result = await session.call_tool(
                "regexforge_synth",
                arguments={
                    "description": "ISO 8601 date like 2024-12-30",
                    "examples": [
                        {"text": "2024-12-30", "match": True},
                        {"text": "2023-01-01", "match": True},
                        {"text": "12/30/2024", "match": False},
                        {"text": "abc",        "match": False},
                    ],
                },
            )
            print(result.content[0].text)
```

### TypeScript (official `@modelcontextprotocol/sdk`)

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("https://regexforge.jason-12c.workers.dev/mcp"),
  { requestInit: { headers: { Authorization: "Bearer YOUR_API_KEY" } } }
);
const client = new Client({ name: "demo", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const res = await client.callTool({
  name: "regexforge_synth",
  arguments: {
    description: "ethereum wallet address",
    examples: [
      { text: "0x8ABCE477e22B76121f04c6c6a69eE2e6a12De53e", match: true },
      { text: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", match: true },
      { text: "0x123", match: false },
      { text: "xyz",   match: false },
    ],
  },
});
console.log(res.content[0].text);
```

### Raw JSON-RPC over HTTP

If you'd rather speak the protocol directly:

```bash
# 1. initialize
curl -X POST https://regexforge.jason-12c.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# 2. list tools
curl -X POST https://regexforge.jason-12c.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. call the tool
curl -X POST https://regexforge.jason-12c.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"regexforge_synth","arguments":{"examples":[{"text":"2024-12-30","match":true},{"text":"abc","match":false}]}}}'
```

---

## What happens under the hood

1. **Template bank match** — tests ~65 pre-compiled battle-tested regex templates (email, UUID v4, ISO date, semver, ETH address, US phone, SHA-256, base64, US zip, MAC address, etc.) against every example. Any template that classifies all examples correctly is a candidate.
2. **Tie-break** — if multiple templates pass, picks the one whose keywords best match the caller's `description`, breaking further ties by pattern length.
3. **Character-class inference fallback** — if no template fits, extracts the longest common prefix and suffix from the positive examples, infers the middle as a union of character classes `[a-z0-9-]{n,m}` with length bounds, then verifies the synthesized pattern rejects every negative example.
4. **Return with proof** — the response includes the full `test_matrix` so the caller (model) can verify every example classifies correctly before using the regex in code.
5. **Backtracking audit** — a static pass over the returned regex flags nested quantifiers, backreferences, and lookaround that might cause catastrophic backtracking.

All deterministic. No LLM call at serve time. Typical latency <100 ms.

---

## Example agent workflow

An AI agent writing code that needs to parse user-supplied strings calls `regexforge_synth` instead of generating the regex itself (which weaker models get wrong constantly):

> **Model thinks:** "I need to parse this SKU-1234-AB pattern. Let me not hallucinate a regex."
>
> Calls: `regexforge_synth({ description: "SKU like SKU-1234-AB", examples: [<3 positives, 5 negatives>] })`
>
> Gets back: `{ regex: "^SKU-[-0-9A-Z]{7}$", all_pass: true, backtrack_risk: "none", source: "char_class" }`
>
> Pastes `"^SKU-[-0-9A-Z]{7}$"` into its code with confidence that every known example classifies correctly.

This is a single tool call instead of: (a) LLM writes a regex, (b) LLM writes test cases, (c) LLM simulates regex execution, (d) LLM second-guesses and rewrites, … which burns 10x the tokens and still gets it wrong.

---

## Auth & pricing

- Programmatic key issuance: `POST /v1/keys` → `{ key, credits: 50 }`. No email. No captcha. Agents mint their own.
- Per-call cost: **$0.002**. Packs: starter ($5 / 2,500), scale ($50 / 30k), bulk ($500 / 350k).
- Payment (agent-autonomous): `POST /v1/credits { "pack": "starter" }` returns a real Stripe Checkout URL + x402 USDC-on-Base headers. Complete payment, then `POST /v1/credits/verify { "session_id": "cs_..." }` credits the key.
- Every error response includes a structured `fix` field telling the agent exactly what to change.

---

## Other discovery surfaces (agent-only, machine-readable)

| Endpoint | Format |
|---|---|
| `GET /.well-known/ai-plugin.json` | OpenAI plugin manifest |
| `GET /.well-known/mcp.json` | MCP server manifest (tools + transport) |
| `GET /llms.txt` | `llms.txt` standard |
| `GET /openapi.json` | OpenAPI 3.1 |
| `GET /v1/pricing` | Machine-readable pricing |
| `GET /v1/errors` | Full error code catalog |
| `GET /` | Root index of all of the above |

---

## Implementation

- **Transport:** HTTP streamable (MCP spec `2024-11-05`), JSON-RPC 2.0
- **Deployment:** Cloudflare Workers (cold start <10 ms)
- **Built on:** [`@walko/agent-microsaas`](https://github.com/walkojas-boop/agent-microsaas) — a skeleton that handles the MCP transport, discovery manifests, bearer-key auth, and credit ledger. regexforge itself is ~300 LOC of pure synthesis logic.

## License

Apache-2.0.
