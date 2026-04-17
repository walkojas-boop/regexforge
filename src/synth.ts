/**
 * Regex synthesis engine. Deterministic. No LLM at serve time.
 *
 *   Phase 1: template bank — test every pre-compiled regex against examples.
 *            Any template that passes all 20 is a candidate.
 *   Phase 2: if multiple candidates, score by NL-keyword overlap + shortest.
 *   Phase 3: if no template passes, run character-class inference:
 *              - longest common prefix / suffix across positives
 *              - middle expressed as a union-of-classes with length bounds
 *              - test against all negatives; if passes, return it
 *   Phase 4: if nothing passes, return 422 not_expressible.
 *
 * Bonus: every returned regex runs through a static backtracking risk scan.
 */
import { TEMPLATES, type Template } from './templates.js';

export type Example = { text: string; match: boolean };
export type TestRow = { text: string; expected: boolean; actual: boolean; pass: boolean };
export type BacktrackRisk = 'none' | 'low' | 'high' | 'unknown';

export type SynthResult = {
  ok: boolean;
  regex?: string;
  flags?: string;
  source: 'template' | 'char_class' | 'none';
  template_name?: string;
  test_matrix: TestRow[];
  all_pass: boolean;
  backtrack_risk: BacktrackRisk;
  backtrack_reasons: string[];
  candidates_considered: number;
  candidates_passing: number;
  notes: string[];
};

export type SynthInput = { description?: string; examples: Example[] };

function testPattern(pattern: string, flags: string, examples: Example[]): { matrix: TestRow[]; all_pass: boolean } {
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    return { matrix: examples.map(e => ({ text: e.text, expected: e.match, actual: false, pass: !e.match })), all_pass: false };
  }
  const matrix: TestRow[] = examples.map(e => {
    const actual = re.test(e.text);
    return { text: e.text, expected: e.match, actual, pass: actual === e.match };
  });
  const all_pass = matrix.every(r => r.pass);
  return { matrix, all_pass };
}

function scoreByKeywords(description: string, kws: string[]): number {
  if (!description) return 0;
  const tokens = new Set(description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  let hits = 0;
  for (const kw of kws) if (tokens.has(kw.toLowerCase())) hits++;
  return hits;
}

function pickBestTemplate(passing: Template[], description: string): Template {
  // Primary: keyword overlap. Secondary: shorter pattern wins. Tertiary: more specific.
  const scored = passing.map(t => ({
    t,
    kw: scoreByKeywords(description, t.keywords),
    len: t.pattern.length,
  }));
  scored.sort((a, b) => (b.kw - a.kw) || (a.len - b.len));
  return scored[0].t;
}

function longestCommonPrefix(strs: string[]): string {
  if (!strs.length) return '';
  let prefix = strs[0];
  for (const s of strs.slice(1)) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
}
function longestCommonSuffix(strs: string[]): string {
  if (!strs.length) return '';
  let suffix = strs[0];
  for (const s of strs.slice(1)) {
    while (!s.endsWith(suffix)) suffix = suffix.slice(1);
    if (!suffix) break;
  }
  return suffix;
}
function escRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function classOf(ch: string): string {
  if (/[a-z]/.test(ch)) return 'a-z';
  if (/[A-Z]/.test(ch)) return 'A-Z';
  if (/\d/.test(ch)) return '0-9';
  return escRx(ch);
}

function inferCharClassPattern(positives: string[]): string | null {
  if (!positives.length) return null;
  const lens = positives.map(s => s.length);
  const minLen = Math.min(...lens);
  const maxLen = Math.max(...lens);
  const prefix = longestCommonPrefix(positives);
  const suffix = prefix.length < minLen ? longestCommonSuffix(positives.map(s => s.slice(prefix.length))) : '';
  const middleSamples = positives.map(s => s.slice(prefix.length, s.length - suffix.length));
  const classes = new Set<string>();
  for (const m of middleSamples) for (const ch of m) classes.add(classOf(ch));
  const classList = Array.from(classes).sort();
  const classStr = classList.length ? `[${classList.join('')}]` : '';
  const midMin = Math.min(...middleSamples.map(m => m.length));
  const midMax = Math.max(...middleSamples.map(m => m.length));
  if (midMin === 0 && midMax === 0 && !classStr) {
    return `^${escRx(prefix)}${escRx(suffix)}$`;
  }
  if (!classStr) return null;
  const quant = midMin === midMax ? `{${midMin}}` : midMin === 0 ? `{0,${midMax}}` : `{${midMin},${midMax}}`;
  return `^${escRx(prefix)}${classStr}${quant}${escRx(suffix)}$`;
}

function scanBacktrack(pattern: string): { risk: BacktrackRisk; reasons: string[] } {
  const reasons: string[] = [];
  // Nested quantified groups: (...+)+, (...*)*  etc.
  if (/\([^)]*(?:[*+][*+]|\*\+|\+\*)\)[*+]/.test(pattern)) {
    reasons.push('nested quantifiers (catastrophic backtracking risk)');
  }
  if (/\([^)]*[*+]\)[*+]/.test(pattern)) {
    reasons.push('quantified group with inner quantifier');
  }
  if (/\\[1-9]/.test(pattern)) reasons.push('backreferences (exponential worst case)');
  if (/\(\?[=!<]/.test(pattern)) reasons.push('lookaround (variable; usually safe but context-dependent)');
  const risk: BacktrackRisk = reasons.length === 0 ? 'none' : reasons[0].includes('catastrophic') ? 'high' : 'low';
  return { risk, reasons };
}

export function synthesize(input: SynthInput): SynthResult {
  const examples = input.examples;
  const description = input.description || '';
  const notes: string[] = [];
  let passing: Template[] = [];

  // Phase 1 & 2: template bank
  for (const t of TEMPLATES) {
    const { all_pass } = testPattern(t.pattern, t.flags, examples);
    if (all_pass) passing.push(t);
  }

  if (passing.length > 0) {
    const best = pickBestTemplate(passing, description);
    const { matrix, all_pass } = testPattern(best.pattern, best.flags, examples);
    const { risk, reasons } = scanBacktrack(best.pattern);
    notes.push(`${passing.length} template(s) satisfied every example; picked "${best.name}".`);
    return {
      ok: true,
      regex: best.pattern,
      flags: best.flags,
      source: 'template',
      template_name: best.name,
      test_matrix: matrix,
      all_pass,
      backtrack_risk: risk,
      backtrack_reasons: reasons,
      candidates_considered: TEMPLATES.length,
      candidates_passing: passing.length,
      notes,
    };
  }

  // Phase 3: character-class inference from positives alone, then test against negatives
  const positives = examples.filter(e => e.match).map(e => e.text);
  if (positives.length > 0) {
    const inferred = inferCharClassPattern(positives);
    if (inferred) {
      const { matrix, all_pass } = testPattern(inferred, '', examples);
      if (all_pass) {
        const { risk, reasons } = scanBacktrack(inferred);
        notes.push('No template passed; synthesized via character-class inference from positives.');
        return {
          ok: true,
          regex: inferred,
          flags: '',
          source: 'char_class',
          test_matrix: matrix,
          all_pass: true,
          backtrack_risk: risk,
          backtrack_reasons: reasons,
          candidates_considered: TEMPLATES.length + 1,
          candidates_passing: 1,
          notes,
        };
      } else {
        notes.push(`Character-class inference produced ${inferred} but it failed ${matrix.filter(r => !r.pass).length}/${examples.length} examples.`);
      }
    }
  }

  // Phase 4: give up
  notes.push('The provided positive and negative examples do not uniquely characterize a regular language reachable by our synthesis engine. If the pattern involves balanced-nesting, semantic checks, or variable-context matching, it may not be expressible as a finite regex.');
  const { matrix } = testPattern('$impossible^', '', examples);
  return {
    ok: false,
    source: 'none',
    test_matrix: matrix,
    all_pass: false,
    backtrack_risk: 'unknown',
    backtrack_reasons: [],
    candidates_considered: TEMPLATES.length + 1,
    candidates_passing: 0,
    notes,
  };
}
