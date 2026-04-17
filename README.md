# regexforge

> Deterministic regex synthesis for AI agents. Send a description + labeled examples, get back a battle-tested regex plus a full test-matrix proof. Zero LLM at serve time.

**Live:** <https://regexforge.jason-12c.workers.dev/>

`curl https://regexforge.jason-12c.workers.dev/` returns a full JSON manifest. Zero HTML.

## What it does

POST `/v1/synth` with 2–100 labeled examples (`{text, match: true|false}`) and an optional natural-language description. The engine:

1. Tests ~65 pre-compiled battle-tested templates (UUID, email, ISO date, ETH address, US phone, semver, base64, SHA-256, semver, etc.) against every example. Any template that passes all of them is a candidate.
2. If multiple candidates, breaks ties by NL-description keyword overlap and pattern length.
3. If no template passes, runs **character-class inference**: longest common prefix + suffix, union of character classes for the middle segment, length bounds. Verifies the result rejects all negative examples before returning.
4. If nothing deterministic works, returns **422 not_expressible** with a detailed explanation — the pattern may be non-regular (balanced parens, semantic checks, etc.).

Every response includes:
- the regex + flags
- a **test_matrix** with `{expected, actual, pass}` for every input
- **backtrack_risk** (`none` / `low` / `high`) from static analysis of the returned pattern
- the source (`template` | `char_class`), template name if any, notes

## Pricing

$0.002 per synth call. Free tier: 50 credits on signup. Packs: starter ($5 / 2,500), scale ($50 / 30k), bulk ($500 / 350k). Pay via real Stripe Checkout or USDC on Base (x402 to `0x8ABCE477e22B76121f04c6c6a69eE2e6a12De53e`).

## Discovery

- `GET /.well-known/ai-plugin.json`
- `GET /.well-known/mcp.json`
- `GET /llms.txt`
- `GET /openapi.json`
- `GET /v1/pricing`
- `GET /v1/errors`

## Architecture note

Built on [`@walko/agent-microsaas`](../agent-microsaas) — a shared skeleton that mounts discovery manifests, bearer-key auth, prepaid credits with Stripe Checkout, x402 USDC verification on Base, and MCP transport onto a Hono app. regexforge itself is ~200 LOC of synthesis + template bank.

## License

Apache 2.0.
