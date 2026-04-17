/**
 * regexforge — deterministic regex synthesis from labeled examples.
 *
 * Built on top of @walko/agent-microsaas skeleton — all the plumbing
 * (discovery manifests, keys, credits, Stripe, x402, MCP transport) is
 * supplied by the library. This file registers the one tool endpoint.
 */
import { createAgentService, createKVStorage, type ToolDef } from '@walko/agent-microsaas';
import { synthesize, type SynthInput } from './synth.js';

export interface Env {
  STATE: KVNamespace;
  PLATFORM_WALLET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

// ToolDef for the one endpoint
const SYNTH_TOOL: ToolDef = {
  name: 'regexforge_synth',
  description:
    'Synthesize a battle-tested regex from labeled examples. Input: optional natural-language description + 20 examples (10 positive, 10 negative, or any mix of ≥4). Output: regex + flags + test matrix proving every example is handled correctly + backtracking-risk analysis. Deterministic; no LLM at serve time.',
  path: '/v1/synth',
  inputSchema: {
    type: 'object',
    required: ['examples'],
    properties: {
      description: { type: 'string', description: 'Optional natural-language description, used only for tie-breaking.' },
      examples: {
        type: 'array',
        minItems: 2,
        maxItems: 100,
        items: {
          type: 'object',
          required: ['text', 'match'],
          properties: {
            text: { type: 'string', maxLength: 2048 },
            match: { type: 'boolean', description: 'true if the regex should match this string; false if it should NOT match.' },
          },
        },
      },
    },
  },
};

const PACKS = [
  { id: 'starter', credits: 2_500, price_usd: 5 },
  { id: 'scale', credits: 30_000, price_usd: 50 },
  { id: 'bulk', credits: 350_000, price_usd: 500 },
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Storage is per-worker-instance; the binding object is the same for every request
    const storage = createKVStorage({
      get: (k) => env.STATE.get(k),
      put: (k, v, opts) => env.STATE.put(k, v, opts),
    });

    const { app, charge, err } = createAgentService({
      name: 'regexforge',
      version: '1.0.0',
      tagline: 'Deterministic regex synthesis for AI agents. Send 20 labeled examples, get back a battle-tested regex + test matrix. No LLM at serve time.',
      description_for_model:
        'Use regexforge to get a regex that correctly classifies a batch of labeled strings. POST /v1/synth with {"examples":[{"text":"...","match":true},...], "description":"(optional hint)"}. The service tests every example against a bank of battle-tested templates and picks the one that passes all of them; if none do, it falls back to character-class inference. Returns {regex, flags, test_matrix, backtrack_risk, notes}. Every error response carries a "fix" field. 422 means the examples aren\'t uniquely describable by a regular language.',
      price_per_call_usd: 0.002,
      free_credits: 50,
      credit_packs: PACKS,
      rate_limit_per_minute: 60,
      tools: [SYNTH_TOOL],
      endpoints: [
        { method: 'POST', path: '/v1/synth', cost_credits: 1, purpose: 'Synthesize a regex from labeled examples.' },
        { method: 'POST', path: '/v1/keys', cost_credits: 0, purpose: 'Mint a fresh API key (50 free credits).' },
        { method: 'GET', path: '/v1/keys/self', cost_credits: 0, purpose: 'Get credit balance.' },
        { method: 'POST', path: '/v1/credits', cost_credits: 0, purpose: 'Start a credit purchase (Stripe Checkout).' },
        { method: 'POST', path: '/v1/credits/verify', cost_credits: 0, purpose: 'Verify a paid Stripe session and credit the key.' },
        { method: 'POST', path: '/v1/payments/verify', cost_credits: 0, purpose: 'Verify an on-chain USDC Transfer on Base and credit the key.' },
        { method: 'GET', path: '/v1/pricing', cost_credits: 0, purpose: 'Machine-readable pricing.' },
        { method: 'GET', path: '/v1/errors', cost_credits: 0, purpose: 'Error code catalog.' },
      ],
      platform_wallet: env.PLATFORM_WALLET,
      base_rpc: 'https://base.llamarpc.com',
      stripe: {
        getSecretKey: () => env.STRIPE_SECRET_KEY,
        getWebhookSecret: () => env.STRIPE_WEBHOOK_SECRET,
      },
      storage,
      extra_manifest: {
        engine: {
          deterministic: true,
          llm_at_serve_time: false,
          template_bank_size: 67,
          nl_description_role: 'tie-breaking_only',
          fallback: 'character_class_inference',
        },
      },
    });

    // ============= the one tool endpoint =============
    app.post('/v1/synth', async (c) => {
      const ch = await charge(c);
      if ('errResp' in ch) return ch.errResp;
      const body = await c.req.json().catch(() => null) as any;
      if (!body || !Array.isArray(body.examples) || body.examples.length < 2) {
        return err(c, 'missing_input', { detail: 'Pass {"examples":[{"text":"...","match":true}, ...]} with at least 2 examples.' });
      }
      // Input validation
      for (const e of body.examples) {
        if (typeof e.text !== 'string' || typeof e.match !== 'boolean') {
          return err(c, 'missing_input', { detail: 'Each example must have {"text":string, "match":boolean}.' });
        }
        if (e.text.length > 2048) {
          return err(c, 'missing_input', { detail: 'Each example text must be ≤2048 chars.' });
        }
      }
      if (body.examples.length > 100) {
        return err(c, 'missing_input', { detail: 'Max 100 examples per call.' });
      }

      const input: SynthInput = {
        description: typeof body.description === 'string' ? body.description : '',
        examples: body.examples,
      };

      const result = synthesize(input);
      if (!result.ok) {
        return c.json({
          error: true,
          code: 'not_expressible',
          message: 'Could not synthesize a regex that satisfies all examples.',
          fix: 'Try: (a) provide more examples to disambiguate, (b) simplify the classes (e.g. only ASCII), (c) accept that this pattern is non-regular (balanced parens, counting, etc.) and use a parser instead.',
          http_status: 422,
          source: result.source,
          notes: result.notes,
          test_matrix: result.test_matrix,
          candidates_considered: result.candidates_considered,
        }, 422);
      }

      return c.json({
        regex: result.regex,
        flags: result.flags,
        source: result.source,
        template_name: result.template_name,
        all_pass: result.all_pass,
        backtrack_risk: result.backtrack_risk,
        backtrack_reasons: result.backtrack_reasons,
        test_matrix: result.test_matrix,
        candidates_considered: result.candidates_considered,
        candidates_passing: result.candidates_passing,
        notes: result.notes,
        cost_credits: 1,
        credits_remaining: ch.row.credits,
      });
    });

    return app.fetch(request, env, ctx);
  },
};
