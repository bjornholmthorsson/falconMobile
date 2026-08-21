/**
 * Turns a day's Outlook calendar events into postable Tempo worklogs.
 *
 * The screen uses this to log a whole day in one action. The rule of the
 * resolver is: only an event whose Jira issue can be established with
 * certainty is posted. Everything else is *skipped with a reason* so the user
 * amends it by hand — a guessed issue key is what makes the Tempo write fail.
 *
 * Kept free of react-native and Graph imports so it stays unit-testable.
 */

/** Minimal shape of a Graph calendar event (see graphService.CalendarEvent). */
export interface CalendarEventLike {
  id: string;
  subject: string;
  start: Date;
  end: Date;
  durationSeconds: number;
}

/** Minimal shape of a stored keyword rule (see api.WorklogKeywordRule). */
export interface KeywordRuleLike {
  keyword: string;
  jiraKey: string;
}

/** Minimal shape of an already-logged Tempo entry (see api.TempoWorklogEntry). */
export interface LoggedEntryLike {
  startTime: string | null;
  timeSpentSeconds: number;
}

/** How the issue key was established, for display in the preview. */
export type IssueKeySource = 'subject-key' | 'rule';

export interface IssueKeyMatch {
  issueKey: string;
  /** The rule keyword that matched, or null for an explicit key in the subject. */
  keyword: string | null;
  source: IssueKeySource;
}

export type PlanItemStatus =
  | 'ready'
  | 'no-rule'
  | 'invalid-key'
  | 'already-logged'
  | 'zero-duration';

export interface CalendarWorklogPlanItem {
  event: CalendarEventLike;
  status: PlanItemStatus;
  /** Resolved key, uppercased — null unless the status is 'ready'. */
  issueKey: string | null;
  matchedKeyword: string | null;
  source: IssueKeySource | null;
  /** Post-ready fields, matching the postTempoWorklog payload. */
  startTime: string;
  endTime: string;
  timeSpentSeconds: number;
  comment: string;
  /** True when this ready event overlaps the previous ready one. */
  overlapsPrevious: boolean;
}

// ── Jira key handling ────────────────────────────────────────────────────────

/**
 * A Jira issue key: an uppercase letters-only project prefix and an issue
 * number. Letters only, because a digit in the prefix means the token is
 * something else ("Q1-2026") rather than an issue.
 */
const JIRA_KEY = /^[A-Z][A-Z]+-\d{1,7}$/;
const JIRA_KEY_IN_TEXT = /(^|[^A-Za-z0-9])([A-Z][A-Z]+-\d{1,7})(?![A-Za-z0-9])/;

/** True when `key` is shaped like a Jira issue key Tempo will accept. */
export function isValidJiraKey(key: string): boolean {
  return JIRA_KEY.test(key.trim());
}

/** The project prefix of an issue key ("INT-5" → "INT"), or null. */
export function projectPrefix(key: string): string | null {
  const k = key.trim().toUpperCase();
  const dash = k.indexOf('-');
  return dash > 0 ? k.slice(0, dash) : null;
}

// ── keyword matching ─────────────────────────────────────────────────────────

/**
 * Word characters, without relying on unicode property escapes — Hermes
 * support for those is patchy. A character is a letter when it cases
 * differently, which holds for Icelandic (á, þ, ð…) as well as ASCII.
 */
function isWordChar(ch: string): boolean {
  if (!ch) return false;
  if (ch >= '0' && ch <= '9') return true;
  if (ch === '_') return true;
  return ch.toLowerCase() !== ch.toUpperCase();
}

/**
 * Finds `needle` in `haystack` (both lowercased) and reports whether any
 * occurrence stands on its own word boundaries. A whole-word hit is the
 * trustworthy one: "int" inside "Internal" is a coincidence, not a match.
 */
function findKeyword(haystack: string, needle: string): { found: boolean; wholeWord: boolean } {
  let found = false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    found = true;
    const before = at === 0 ? '' : haystack[at - 1];
    const afterAt = at + needle.length;
    const after = afterAt >= haystack.length ? '' : haystack[afterAt];
    if (!isWordChar(before) && !isWordChar(after)) return { found: true, wholeWord: true };
    from = at + 1;
  }
  return { found, wholeWord: false };
}

/**
 * Resolves the Jira issue a calendar subject should book to.
 *
 * Precedence:
 *  1. An explicit issue key written in the subject ("INT-42 pairing") — the
 *     most specific instruction there is. Only trusted when its project is one
 *     of `knownProjects`, so that "COVID-19" is not mistaken for an issue.
 *  2. The user's keyword rules, ranked so the most specific rule wins: a
 *     whole-word match beats a mid-word one, then the longer keyword beats the
 *     shorter, then the earlier rule.
 *
 * Returns null when the subject gives no reliable answer — the caller must
 * skip, not guess.
 */
export function resolveIssueKey(
  subject: string,
  rules: KeywordRuleLike[],
  knownProjects?: Set<string>,
): IssueKeyMatch | null {
  const text = (subject ?? '').trim();
  if (!text) return null;

  const explicit = JIRA_KEY_IN_TEXT.exec(text)?.[2];
  if (explicit) {
    const prefix = projectPrefix(explicit);
    const trusted = !knownProjects || knownProjects.size === 0 || (!!prefix && knownProjects.has(prefix));
    if (trusted) return { issueKey: explicit.toUpperCase(), keyword: null, source: 'subject-key' };
  }

  const lower = text.toLowerCase();
  let best: { match: IssueKeyMatch; score: number } | null = null;

  for (const rule of rules) {
    const keyword = (rule.keyword ?? '').trim();
    if (!keyword) continue;
    const { found, wholeWord } = findKeyword(lower, keyword.toLowerCase());
    if (!found) continue;
    // Whole-word hits outrank every mid-word hit regardless of length.
    const score = (wholeWord ? 100000 : 0) + keyword.length;
    if (!best || score > best.score) {
      best = {
        score,
        match: {
          issueKey: (rule.jiraKey ?? '').trim().toUpperCase(),
          keyword,
          source: 'rule',
        },
      };
    }
  }

  return best?.match ?? null;
}

// ── plan building ────────────────────────────────────────────────────────────

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * The projects the user demonstrably books to — used to decide whether an
 * issue key spotted in a subject is real. Drawn from the keyword rules plus
 * anything already logged or favourited, all of which the caller supplies.
 */
export function knownProjectsFrom(
  rules: KeywordRuleLike[],
  extraKeys: (string | null | undefined)[] = [],
): Set<string> {
  const out = new Set<string>();
  for (const r of rules) {
    const p = projectPrefix(r.jiraKey ?? '');
    if (p) out.add(p);
  }
  for (const k of extraKeys) {
    const p = k ? projectPrefix(k) : null;
    if (p) out.add(p);
  }
  return out;
}

/**
 * Builds the per-event plan for a single day, in chronological order. Only
 * items with status 'ready' are safe to post; every other status carries the
 * reason it was skipped so the UI can offer to amend it.
 */
export function buildCalendarWorklogPlan({
  events,
  rules,
  existing,
  knownProjects,
}: {
  events: CalendarEventLike[];
  rules: KeywordRuleLike[];
  existing: LoggedEntryLike[];
  knownProjects?: Set<string>;
}): CalendarWorklogPlanItem[] {
  const projects = knownProjects ?? knownProjectsFrom(rules);
  const ordered = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

  const plan: CalendarWorklogPlanItem[] = [];
  // The furthest end reached by an accepted event so far. Tracking the maximum
  // rather than the previous event's end matters for a long block with shorter
  // meetings nested inside it — the second nested one still overlaps.
  let maxReadyEnd: number | null = null;

  for (const event of ordered) {
    const startTime = hhmm(event.start);
    const base = {
      event,
      issueKey: null as string | null,
      matchedKeyword: null as string | null,
      source: null as IssueKeySource | null,
      startTime,
      endTime: hhmm(event.end),
      timeSpentSeconds: event.durationSeconds,
      comment: event.subject,
      overlapsPrevious: false,
    };

    if (event.durationSeconds <= 0) {
      plan.push({ ...base, status: 'zero-duration' });
      continue;
    }

    // Mirrors the single-entry calendar suggestion check: same start time and
    // same duration means this event is already on the timesheet.
    const alreadyLogged = existing.some(
      w => w.startTime === startTime && w.timeSpentSeconds === event.durationSeconds,
    );
    if (alreadyLogged) {
      plan.push({ ...base, status: 'already-logged' });
      continue;
    }

    const match = resolveIssueKey(event.subject, rules, projects);
    if (!match) {
      plan.push({ ...base, status: 'no-rule' });
      continue;
    }
    if (!isValidJiraKey(match.issueKey)) {
      plan.push({
        ...base,
        status: 'invalid-key',
        issueKey: match.issueKey || null,
        matchedKeyword: match.keyword,
        source: match.source,
      });
      continue;
    }

    plan.push({
      ...base,
      status: 'ready',
      issueKey: match.issueKey,
      matchedKeyword: match.keyword,
      source: match.source,
      overlapsPrevious: maxReadyEnd !== null && event.start.getTime() < maxReadyEnd,
    });
    maxReadyEnd = Math.max(maxReadyEnd ?? 0, event.end.getTime());
  }

  return plan;
}

/** Human label for a skipped item, shown in the preview. */
export function statusLabel(status: PlanItemStatus): string {
  switch (status) {
    case 'ready':          return 'Ready';
    case 'no-rule':        return 'No keyword rule';
    case 'invalid-key':    return 'Rule has an invalid Jira key';
    case 'already-logged': return 'Already logged';
    case 'zero-duration':  return 'No duration';
  }
}
