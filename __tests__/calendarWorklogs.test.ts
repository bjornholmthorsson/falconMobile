/**
 * Resolver that turns a day's calendar events into postable Tempo worklogs.
 * Anything it cannot resolve to a valid Jira issue must be skipped, never
 * guessed — an unresolved entry is amended by hand, a wrong one fails the write.
 */
import {
  resolveIssueKey,
  buildCalendarWorklogPlan,
  isValidJiraKey,
  type CalendarEventLike,
  type KeywordRuleLike,
} from '../src/utils/calendarWorklogs';

// ── helpers ──────────────────────────────────────────────────────────────────

function ev(
  subject: string,
  from: string,
  to: string,
  id = subject,
): CalendarEventLike {
  const start = new Date(`2026-08-20T${from}:00`);
  const end = new Date(`2026-08-20T${to}:00`);
  return {
    id,
    subject,
    start,
    end,
    durationSeconds: Math.round((end.getTime() - start.getTime()) / 1000),
  };
}

function rule(keyword: string, jiraKey: string): KeywordRuleLike {
  return { keyword, jiraKey };
}

// ── isValidJiraKey ───────────────────────────────────────────────────────────

describe('isValidJiraKey', () => {
  // accepts a well-formed project key
  it('accepts a well-formed project key', () => {
    // Arrange / Act / Assert
    expect(isValidJiraKey('INT-5')).toBe(true);
  });

  // rejects a key with no issue number
  it('rejects a key with no issue number', () => {
    expect(isValidJiraKey('INT-')).toBe(false);
  });

  // rejects a bare project prefix
  it('rejects a bare project prefix', () => {
    expect(isValidJiraKey('INT')).toBe(false);
  });

  // rejects a key with a lowercase prefix so a typo'd rule can't reach Tempo
  it('rejects a key with a lowercase prefix', () => {
    expect(isValidJiraKey('int-5')).toBe(false);
  });
});

// ── resolveIssueKey ──────────────────────────────────────────────────────────

describe('resolveIssueKey', () => {
  // resolves a keyword contained in the subject
  it('resolves a keyword contained in the subject', () => {
    // Arrange
    const rules = [rule('standup', 'INT-5')];

    // Act
    const match = resolveIssueKey('Daily standup', rules);

    // Assert
    expect(match).toEqual({ issueKey: 'INT-5', keyword: 'standup', source: 'rule' });
  });

  // matches keywords case-insensitively
  it('matches keywords case-insensitively', () => {
    const match = resolveIssueKey('DAILY STANDUP', [rule('standup', 'INT-5')]);
    expect(match?.issueKey).toBe('INT-5');
  });

  // tolerates padded keywords and lowercase Jira keys in a stored rule
  it('tolerates padded keywords and lowercase Jira keys in a stored rule', () => {
    const match = resolveIssueKey('Daily standup', [rule('  standup  ', 'int-5')]);
    expect(match?.issueKey).toBe('INT-5');
  });

  // prefers a whole-word match over a keyword that only matches mid-word
  it('prefers a whole-word match over a keyword that only matches mid-word', () => {
    // Arrange — "int" hides inside "Internal", "internal" is the real match
    const rules = [rule('int', 'AAA-1'), rule('internal', 'BBB-2')];

    // Act
    const match = resolveIssueKey('Internal review', rules);

    // Assert
    expect(match?.issueKey).toBe('BBB-2');
  });

  // prefers the most specific keyword when several match as whole words
  it('prefers the most specific keyword when several match as whole words', () => {
    const rules = [rule('sales', 'SAL-1'), rule('sales meeting', 'SAL-2')];
    const match = resolveIssueKey('Weekly sales meeting', rules);
    expect(match?.issueKey).toBe('SAL-2');
  });

  // treats Icelandic letters as word characters when checking boundaries
  it('treats Icelandic letters as word characters when checking boundaries', () => {
    // Arrange — "fund" must not whole-word-match inside "fundur"
    const rules = [rule('fund', 'AAA-1'), rule('fundur', 'BBB-2')];

    // Act
    const match = resolveIssueKey('Vikulegur fundur hjá Akkuro', rules);

    // Assert
    expect(match?.issueKey).toBe('BBB-2');
  });

  // picks up an explicit Jira key written in the subject
  it('picks up an explicit Jira key written in the subject', () => {
    const match = resolveIssueKey('INT-42 pairing session', []);
    expect(match).toEqual({ issueKey: 'INT-42', keyword: null, source: 'subject-key' });
  });

  // lets an explicit Jira key in the subject win over a keyword rule
  it('lets an explicit Jira key in the subject win over a keyword rule', () => {
    const match = resolveIssueKey('INT-42 standup', [rule('standup', 'INT-5')]);
    expect(match?.issueKey).toBe('INT-42');
  });

  // ignores a hyphenated word that only looks like a Jira key
  it('ignores a hyphenated word that only looks like a Jira key', () => {
    // Arrange / Act — "Q1-2026" has a digit in the prefix, so it is not a key
    const match = resolveIssueKey('Q1-2026 planning', []);

    // Assert
    expect(match).toBeNull();
  });

  // only trusts an explicit key whose project is one the user actually books to
  it('only trusts an explicit key whose project is one the user actually books to', () => {
    // Arrange — COVID-19 is well-formed but COVID is not a known project
    const known = new Set(['INT', 'SAL']);

    // Act
    const match = resolveIssueKey('COVID-19 policy update', [], known);

    // Assert
    expect(match).toBeNull();
  });

  // accepts an explicit key from a known project
  it('accepts an explicit key from a known project', () => {
    const match = resolveIssueKey('INT-42 pairing', [], new Set(['INT']));
    expect(match?.issueKey).toBe('INT-42');
  });

  // returns null when nothing in the subject matches
  it('returns null when nothing in the subject matches', () => {
    expect(resolveIssueKey('Lunch', [rule('standup', 'INT-5')])).toBeNull();
  });

  // ignores a rule with an empty keyword instead of matching everything
  it('ignores a rule with an empty keyword instead of matching everything', () => {
    expect(resolveIssueKey('Lunch', [rule('   ', 'INT-5')])).toBeNull();
  });
});

// ── buildCalendarWorklogPlan ─────────────────────────────────────────────────

describe('buildCalendarWorklogPlan', () => {
  // marks an event with a resolved key as ready and carries the posting fields
  it('marks an event with a resolved key as ready and carries the posting fields', () => {
    // Arrange
    const events = [ev('Daily standup', '09:00', '09:30')];
    const rules = [rule('standup', 'INT-5')];

    // Act
    const plan = buildCalendarWorklogPlan({ events, rules, existing: [] });

    // Assert
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      status: 'ready',
      issueKey: 'INT-5',
      startTime: '09:00',
      endTime: '09:30',
      timeSpentSeconds: 1800,
      comment: 'Daily standup',
    });
  });

  // skips an event no rule matches so it can be amended by hand
  it('skips an event no rule matches so it can be amended by hand', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Coffee with Anna', '10:00', '10:30')],
      rules: [rule('standup', 'INT-5')],
      existing: [],
    });
    expect(plan[0].status).toBe('no-rule');
    expect(plan[0].issueKey).toBeNull();
  });

  // skips an event whose rule points at a malformed Jira key
  it('skips an event whose rule points at a malformed Jira key', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Daily standup', '09:00', '09:30')],
      rules: [rule('standup', 'NOT A KEY')],
      existing: [],
    });
    expect(plan[0].status).toBe('invalid-key');
  });

  // skips an event already logged at the same start for the same duration
  it('skips an event already logged at the same start for the same duration', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Daily standup', '09:00', '09:30')],
      rules: [rule('standup', 'INT-5')],
      existing: [{ startTime: '09:00', timeSpentSeconds: 1800 }],
    });
    expect(plan[0].status).toBe('already-logged');
  });

  // still logs an event when an existing entry starts alike but ran longer
  it('still logs an event when an existing entry starts alike but ran longer', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Daily standup', '09:00', '09:30')],
      rules: [rule('standup', 'INT-5')],
      existing: [{ startTime: '09:00', timeSpentSeconds: 3600 }],
    });
    expect(plan[0].status).toBe('ready');
  });

  // skips a zero-length event that Tempo would reject
  it('skips a zero-length event that Tempo would reject', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Placeholder', '09:00', '09:00')],
      rules: [rule('placeholder', 'INT-5')],
      existing: [],
    });
    expect(plan[0].status).toBe('zero-duration');
  });

  // flags a ready event that overlaps the previous ready event
  it('flags a ready event that overlaps the previous ready event', () => {
    // Arrange — two accepted invitations for the same slot
    const events = [
      ev('Standup', '09:00', '10:00'),
      ev('Standup elsewhere', '09:30', '10:30', 'second'),
    ];
    const rules = [rule('standup', 'INT-5')];

    // Act
    const plan = buildCalendarWorklogPlan({ events, rules, existing: [] });

    // Assert
    expect(plan[0].overlapsPrevious).toBe(false);
    expect(plan[1].overlapsPrevious).toBe(true);
  });

  // keeps flagging overlaps against the longest event seen, not just the last
  it('keeps flagging overlaps against the longest event seen, not just the last', () => {
    // Arrange — a long block with two short meetings sitting inside it
    const events = [
      ev('Standup workshop', '09:00', '12:00', 'long'),
      ev('Standup sync', '10:00', '10:30', 'inner-a'),
      ev('Standup review', '11:00', '11:30', 'inner-b'),
    ];

    // Act
    const plan = buildCalendarWorklogPlan({
      events,
      rules: [rule('standup', 'INT-5')],
      existing: [],
    });

    // Assert — both short meetings sit inside the 09:00–12:00 block
    expect(plan.map(p => p.overlapsPrevious)).toEqual([false, true, true]);
  });

  // does not let a skipped event trigger an overlap warning on the next one
  it('does not let a skipped event trigger an overlap warning on the next one', () => {
    const events = [ev('Coffee', '09:00', '10:00'), ev('Standup', '09:30', '10:30', 'second')];
    const plan = buildCalendarWorklogPlan({
      events,
      rules: [rule('standup', 'INT-5')],
      existing: [],
    });
    expect(plan[1].overlapsPrevious).toBe(false);
  });

  // returns the events in chronological order whatever order they arrive in
  it('returns the events in chronological order whatever order they arrive in', () => {
    const events = [ev('Late standup', '15:00', '16:00'), ev('Early standup', '09:00', '10:00')];
    const plan = buildCalendarWorklogPlan({
      events,
      rules: [rule('standup', 'INT-5')],
      existing: [],
    });
    expect(plan.map(p => p.event.subject)).toEqual(['Early standup', 'Late standup']);
  });

  // derives the known project set from the rules so subject keys are trusted
  it('derives the known project set from the rules so subject keys are trusted', () => {
    // Arrange — no keyword matches, but INT is a project the rules already use
    const plan = buildCalendarWorklogPlan({
      events: [ev('INT-77 refinement', '11:00', '12:00')],
      rules: [rule('standup', 'INT-5')],
      existing: [],
    });

    // Assert
    expect(plan[0]).toMatchObject({ status: 'ready', issueKey: 'INT-77' });
  });

  // treats an unknown project in the subject as unresolved rather than guessing
  it('treats an unknown project in the subject as unresolved rather than guessing', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('COVID-19 briefing', '11:00', '12:00')],
      rules: [rule('standup', 'INT-5')],
      existing: [],
    });
    expect(plan[0].status).toBe('no-rule');
  });
});

// ── manual overrides ─────────────────────────────────────────────────────────
// The day-log sheet lets the user pick an issue for an entry the rules could
// not resolve. That choice is an override, and it outranks the rules.

describe('buildCalendarWorklogPlan with manual overrides', () => {
  // makes an otherwise unresolved entry ready once an issue is chosen for it
  it('makes an otherwise unresolved entry ready once an issue is chosen for it', () => {
    // Arrange
    const events = [ev('Coffee with Anna', '10:00', '10:30', 'coffee')];

    // Act
    const plan = buildCalendarWorklogPlan({
      events,
      rules: [],
      existing: [],
      overrides: { coffee: 'INT-9' },
    });

    // Assert
    expect(plan[0]).toMatchObject({ status: 'ready', issueKey: 'INT-9', source: 'manual' });
  });

  // lets a chosen issue win over a keyword rule that also matched
  it('lets a chosen issue win over a keyword rule that also matched', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Daily standup', '09:00', '09:30', 'standup')],
      rules: [rule('standup', 'INT-5')],
      existing: [],
      overrides: { standup: 'SAL-3' },
    });
    expect(plan[0].issueKey).toBe('SAL-3');
  });

  // uppercases a chosen key so a typed lowercase issue still posts
  it('uppercases a chosen key so a typed lowercase issue still posts', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Coffee', '10:00', '10:30', 'coffee')],
      rules: [],
      existing: [],
      overrides: { coffee: 'int-9' },
    });
    expect(plan[0]).toMatchObject({ status: 'ready', issueKey: 'INT-9' });
  });

  // still skips a malformed chosen key rather than sending it to Tempo
  it('still skips a malformed chosen key rather than sending it to Tempo', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Coffee', '10:00', '10:30', 'coffee')],
      rules: [],
      existing: [],
      overrides: { coffee: 'nonsense' },
    });
    expect(plan[0].status).toBe('invalid-key');
  });

  // does not let a choice revive an entry that is already on the timesheet
  it('does not let a choice revive an entry that is already on the timesheet', () => {
    // Arrange — the slot is already logged, so choosing an issue must not re-post it
    const plan = buildCalendarWorklogPlan({
      events: [ev('Daily standup', '09:00', '09:30', 'standup')],
      rules: [],
      existing: [{ startTime: '09:00', timeSpentSeconds: 1800 }],
      overrides: { standup: 'INT-5' },
    });

    // Assert
    expect(plan[0].status).toBe('already-logged');
  });

  // does not let a choice revive a zero-length entry Tempo would reject
  it('does not let a choice revive a zero-length entry Tempo would reject', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Placeholder', '09:00', '09:00', 'ph')],
      rules: [],
      existing: [],
      overrides: { ph: 'INT-5' },
    });
    expect(plan[0].status).toBe('zero-duration');
  });

  // ignores an override aimed at an event that is not in the day
  it('ignores an override aimed at an event that is not in the day', () => {
    const plan = buildCalendarWorklogPlan({
      events: [ev('Coffee', '10:00', '10:30', 'coffee')],
      rules: [],
      existing: [],
      overrides: { 'some-other-event': 'INT-9' },
    });
    expect(plan[0].status).toBe('no-rule');
  });

  // counts a chosen entry when working out overlaps
  it('counts a chosen entry when working out overlaps', () => {
    // Arrange — the first entry is only ready because an issue was chosen
    const events = [
      ev('Coffee', '09:00', '10:00', 'coffee'),
      ev('Standup', '09:30', '10:30', 'standup'),
    ];

    // Act
    const plan = buildCalendarWorklogPlan({
      events,
      rules: [rule('standup', 'INT-5')],
      existing: [],
      overrides: { coffee: 'INT-9' },
    });

    // Assert
    expect(plan.map(p => p.overlapsPrevious)).toEqual([false, true]);
  });
});
