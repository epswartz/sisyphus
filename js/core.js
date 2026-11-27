// Pure logic: the fixed weekly plan, run progression, sessions and the log.
// No DOM access here, so it can be tested with `node --test`.

// ---- The plan ---------------------------------------------------------------

export const RUN = {
  start: 0.5, // miles for the first run
  growth: 1.1, // each run is 10% longer than the last one listed
  catchUp: 1 / 3, // running further moves the base a third of the way to what you ran
  unit: 'mi',
};

/** Strength exercises are placeholders until a schedule is imported for them. */
export const STRENGTH_BLOCKS = [
  { name: 'Block A', exercises: ['A1', 'A2', 'A3'] },
  { name: 'Block B', exercises: ['B1', 'B2', 'B3'] },
];
export const STRENGTH_SETS = 3;

export const DAYS = [
  { name: 'Run 1', kind: 'run' },
  { name: 'Strength', kind: 'strength' },
  { name: 'Run 2', kind: 'run' },
];

export const freshState = () => ({ week: 1, completed: [], runTarget: RUN.start, active: null, log: [] });

// ---- Run progression ---------------------------------------------------------

export const roundMiles = (n) => Math.round(n * 100) / 100;

/**
 * The next run's distance. Normally the listed distance plus 10%. If you ran
 * further, the base moves a third of the way from listed to actual first.
 * Skipped or unlogged runs (ran === null) leave the target unchanged.
 */
export function nextRunTarget(listed, ran) {
  if (ran === null || ran === undefined) return listed;
  const base = ran > roundMiles(listed) + 0.005 ? listed + (ran - listed) * RUN.catchUp : listed;
  return base * RUN.growth;
}

/** Upcoming run distances, assuming each is run exactly as listed. */
export function upcomingRuns(target, count) {
  const out = [];
  for (let i = 0, t = target; i < count; i++, t *= RUN.growth) out.push(roundMiles(t));
  return out;
}

// ---- Week progress -----------------------------------------------------------

export function nextDayIndex(state) {
  for (let i = 0; i < DAYS.length; i++) if (!state.completed.includes(i)) return i;
  return null;
}

/** Mark a day done. Finishing the last day of the week starts the next week. */
function completeDay(state, dayIndex) {
  const completed = state.completed.includes(dayIndex) ? state.completed : [...state.completed, dayIndex];
  return completed.length >= DAYS.length ? { week: state.week + 1, completed: [] } : { week: state.week, completed };
}

export function skipDay(state, dayIndex) {
  return { ...state, ...completeDay(state, dayIndex) };
}

// ---- Sessions ------------------------------------------------------------------

export const typeOf = (ex) => (ex && ex.type) || 'weight';

/** Sets from the most recent logged session that included this exercise. */
export function lastSetsFor(log, name, type = 'weight') {
  for (let i = log.length - 1; i >= 0; i--) {
    const ex = log[i].exercises.find((x) => x.name === name && typeOf(x) === type);
    if (ex && ex.sets.length) return ex.sets;
  }
  return null;
}

export const strengthName = (id) => `${id} (TBD)`;

export function startSession(state, dayIndex, now = Date.now()) {
  const day = DAYS[dayIndex];
  const base = { week: state.week, dayIndex, dayName: day.name, kind: day.kind, startedAt: now };
  if (day.kind === 'run') {
    return {
      ...base,
      runTarget: state.runTarget,
      exercises: [
        {
          name: 'Run',
          type: 'distance',
          unit: RUN.unit,
          target: { sets: 1, distance: roundMiles(state.runTarget) },
          last: lastSetsFor(state.log, 'Run', 'distance'),
          sets: [{ distance: roundMiles(state.runTarget), done: false }],
        },
      ],
    };
  }
  return {
    ...base,
    exercises: STRENGTH_BLOCKS.flatMap((block) =>
      block.exercises.map((id) => {
        const name = strengthName(id);
        const last = lastSetsFor(state.log, name);
        const sets = [];
        for (let i = 0; i < STRENGTH_SETS; i++) {
          const prev = last ? last[Math.min(i, last.length - 1)] : null;
          sets.push({ weight: prev ? prev.weight ?? '' : '', reps: prev ? prev.reps ?? '' : '', done: false });
        }
        return { name, block: block.name, type: 'weight', unit: 'kg', target: { sets: STRENGTH_SETS }, last, sets };
      })
    ),
  };
}

/** A copy of the set before it, for "+ Add set". */
export function nextSet(ex) {
  const prev = ex.sets[ex.sets.length - 1];
  if (prev) return { ...prev, done: false };
  return typeOf(ex) === 'distance' ? { distance: '', done: false } : { weight: '', reps: '', done: false };
}

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

function loggedSet(set, type) {
  if (type === 'distance') return { distance: num(set.distance) };
  return { weight: num(set.weight), reps: num(set.reps) };
}

export const doneSetCount = (session) => session.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.done).length, 0);

/** Total distance of the checked sets of a run session, or null if none were checked. */
export function ranDistance(session) {
  let total = null;
  for (const ex of session.exercises) {
    if (typeOf(ex) !== 'distance') continue;
    for (const s of ex.sets) if (s.done && num(s.distance) !== null) total = (total || 0) + num(s.distance);
  }
  return total;
}

/**
 * Finish the active session: log the checked sets, mark the day done and,
 * for runs, set the next run's distance. Returns the new state.
 */
export function finishSession(state, now = Date.now()) {
  const a = state.active;
  const exercises = a.exercises
    .map((ex) => ({ name: ex.name, type: typeOf(ex), unit: ex.unit, sets: ex.sets.filter((s) => s.done).map((s) => loggedSet(s, typeOf(ex))) }))
    .filter((ex) => ex.sets.length);
  const entry = {
    id: `${a.startedAt}-${a.week}-${a.dayIndex}`,
    week: a.week,
    dayIndex: a.dayIndex,
    dayName: a.dayName,
    startedAt: a.startedAt,
    finishedAt: now,
    exercises,
  };
  if (a.kind === 'run') entry.listed = roundMiles(a.runTarget);
  const next = {
    ...state,
    ...completeDay(state, a.dayIndex),
    active: null,
    log: exercises.length ? [...state.log, entry] : state.log,
  };
  if (a.kind === 'run') next.runTarget = nextRunTarget(a.runTarget, ranDistance(a));
  return next;
}

// ---- Log summaries -------------------------------------------------------------

export const entrySetCount = (entry) => entry.exercises.reduce((n, ex) => n + ex.sets.length, 0);

const round2 = (n) => Math.round(n * 100) / 100;

/** Totals worth showing for a session, e.g. ["1,260 kg", "1.5 mi"]. */
export function entryTotals(entry) {
  const byUnit = new Map();
  for (const ex of entry.exercises) {
    const type = typeOf(ex);
    for (const set of ex.sets) {
      const add = type === 'distance' ? set.distance || 0 : type === 'weight' ? (set.weight || 0) * (set.reps || 0) : 0;
      if (add) byUnit.set(ex.unit, (byUnit.get(ex.unit) || 0) + add);
    }
  }
  return [...byUnit].map(([unit, total]) => `${round2(total).toLocaleString()} ${unit}`);
}

/** The best set: heaviest (then most reps), or furthest. */
export function bestSet(sets, type = 'weight') {
  let best = null;
  for (const s of sets) {
    if (type === 'distance') {
      if (s.distance === null || s.distance === undefined) continue;
      if (!best || s.distance > best.distance) best = s;
    } else if (type === 'weight') {
      if (s.weight === null && s.reps === null) continue;
      const w = s.weight || 0, bw = best ? best.weight || 0 : 0;
      if (!best || w > bw || (w === bw && (s.reps || 0) > (best.reps || 0))) best = s;
    }
  }
  return best;
}

/** One row per exercise in the log, most recently done first. */
export function exerciseSummaries(log) {
  const map = new Map();
  log.forEach((entry, i) => {
    for (const ex of entry.exercises) {
      const type = typeOf(ex);
      const key = `${type}:${ex.name}`;
      const row = map.get(key) || { name: ex.name, type, unit: ex.unit, sessions: 0, sets: [], lastIndex: -1 };
      row.sessions++;
      row.sets.push(...ex.sets);
      row.lastIndex = i;
      row.unit = ex.unit;
      map.set(key, row);
    }
  });
  return [...map.values()]
    .sort((a, b) => b.lastIndex - a.lastIndex)
    .map(({ name, type, unit, sessions, sets }) => ({ name, type, unit, sessions, best: bestSet(sets, type) }));
}

/** Every logged session of one exercise, newest first. */
export function exerciseHistory(log, name, type = 'weight') {
  const out = [];
  for (let i = log.length - 1; i >= 0; i--) {
    const ex = log[i].exercises.find((x) => x.name === name && typeOf(x) === type);
    if (ex) out.push({ id: log[i].id, week: log[i].week, dayName: log[i].dayName, listed: log[i].listed, type, unit: ex.unit, sets: ex.sets });
  }
  return out;
}

/** "60×8" (weights) or "1.2 mi" (distance). */
export function formatSet(s, type = 'weight', unit = '') {
  if (type === 'distance') return s.distance === null || s.distance === undefined ? '—' : `${round2(s.distance)}${unit ? ' ' + unit : ''}`;
  if (type !== 'weight') return '—';
  if (s.weight === null || s.weight === 0) return s.reps === null ? '—' : `${s.reps}`;
  return `${s.weight}×${s.reps === null ? '?' : s.reps}`;
}
