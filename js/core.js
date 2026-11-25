// Pure logic: schedule parsing, week/day progress, sessions and the log.
// No DOM access here, so it can be tested with `node --test`.

export class ScheduleError extends Error {}

const fail = (msg) => { throw new ScheduleError(msg); };
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Parse and validate a schedule (JSON text or an object).
 * Accepts { name, unit?, weeks: [{ name?, days: [...] }] }
 * or the shorthand { name, unit?, days: [...] } for one repeating week.
 */
export function parseSchedule(input) {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch (e) { fail('This file is not valid JSON (' + e.message + ').'); }
  }
  if (!isObj(data)) fail('The schedule must be a JSON object.');
  const unit = str(data.unit) || 'kg';
  let weeks;
  if (Array.isArray(data.weeks)) weeks = data.weeks;
  else if (Array.isArray(data.days)) weeks = [{ days: data.days }];
  else fail('The schedule needs a "weeks" list, or a "days" list for one repeating week.');
  if (!weeks.length) fail('"weeks" is empty.');
  return {
    name: str(data.name) || 'My schedule',
    unit,
    weeks: weeks.map((w, wi) => normWeek(w, wi, unit)),
  };
}

function normWeek(w, wi, unit) {
  const where = `Week ${wi + 1}`;
  if (!isObj(w)) fail(`${where} must be an object with a "days" list.`);
  if (!Array.isArray(w.days) || !w.days.length) fail(`${where} needs a non-empty "days" list.`);
  return { name: str(w.name) || where, days: w.days.map((d, di) => normDay(d, di, where, unit)) };
}

function normDay(d, di, weekWhere, unit) {
  const where = `${weekWhere}, day ${di + 1}`;
  if (!isObj(d)) fail(`${where} must be an object.`);
  const name = str(d.name) || `Day ${di + 1}`;
  if (!Array.isArray(d.exercises) || !d.exercises.length) fail(`${where} ("${name}") needs a non-empty "exercises" list.`);
  return { name, exercises: d.exercises.map((e, ei) => normExercise(e, ei, `${where} ("${name}")`, unit)) };
}

function normExercise(e, ei, dayWhere, unit) {
  const where = `${dayWhere}, exercise ${ei + 1}`;
  if (!isObj(e)) fail(`${where} must be an object.`);
  const name = str(e.name);
  if (!name) fail(`${where} needs a "name".`);
  let sets = e.sets === undefined ? 3 : e.sets;
  if (!Number.isInteger(sets) || sets < 1 || sets > 50) fail(`${where} ("${name}"): "sets" must be a whole number from 1 to 50.`);
  let reps = e.reps === undefined ? null : e.reps;
  if (reps !== null && !((typeof reps === 'number' && reps > 0) || (typeof reps === 'string' && reps.trim()))) {
    fail(`${where} ("${name}"): "reps" must be a number or text like "8-10".`);
  }
  if (typeof reps === 'string') reps = reps.trim();
  const weight = e.weight === undefined || e.weight === null ? null : e.weight;
  if (weight !== null && !(typeof weight === 'number' && weight >= 0)) fail(`${where} ("${name}"): "weight" must be a number.`);
  return { name, sets, reps, weight, unit: str(e.unit) || unit, notes: str(e.notes) };
}

// ---- Progress through the weeks ------------------------------------------

export const freshProgress = () => ({ week: 1, completed: [] });

/** The template week used for an (unbounded) week number; schedules repeat. */
export function templateWeek(schedule, weekNumber) {
  const n = schedule.weeks.length;
  return schedule.weeks[(weekNumber - 1) % n];
}

export function nextDayIndex(schedule, progress) {
  const days = templateWeek(schedule, progress.week).days;
  for (let i = 0; i < days.length; i++) if (!progress.completed.includes(i)) return i;
  return null;
}

/** Mark a day done (or skipped). Finishing the last day moves to the next week. */
export function completeDay(schedule, progress, dayIndex) {
  const days = templateWeek(schedule, progress.week).days;
  const completed = progress.completed.includes(dayIndex) ? progress.completed : [...progress.completed, dayIndex];
  if (completed.length >= days.length) return { week: progress.week + 1, completed: [] };
  return { week: progress.week, completed };
}

// ---- Sessions ---------------------------------------------------------------

const leadingNumber = (reps) => {
  if (typeof reps === 'number') return reps;
  const m = typeof reps === 'string' ? reps.match(/\d+/) : null;
  return m ? Number(m[0]) : '';
};

/** Sets from the most recent logged session that included this exercise. */
export function lastSetsFor(log, name) {
  for (let i = log.length - 1; i >= 0; i--) {
    const ex = log[i].exercises.find((x) => x.name === name);
    if (ex && ex.sets.length) return ex.sets;
  }
  return null;
}

export function startSession(schedule, progress, dayIndex, log, now = Date.now()) {
  const day = templateWeek(schedule, progress.week).days[dayIndex];
  return {
    week: progress.week,
    dayIndex,
    dayName: day.name,
    startedAt: now,
    exercises: day.exercises.map((ex) => {
      const last = lastSetsFor(log, ex.name);
      const sets = [];
      for (let i = 0; i < ex.sets; i++) {
        const prev = last ? last[Math.min(i, last.length - 1)] : null;
        sets.push({
          weight: ex.weight !== null ? ex.weight : prev ? prev.weight : '',
          reps: leadingNumber(ex.reps),
          done: false,
        });
      }
      return { name: ex.name, unit: ex.unit, notes: ex.notes, target: { sets: ex.sets, reps: ex.reps, weight: ex.weight }, last, sets };
    }),
  };
}

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

/** Turn an in-progress session into a log entry holding only the checked sets. */
export function finishSession(session, now = Date.now()) {
  return {
    id: `${session.startedAt}-${session.week}-${session.dayIndex}`,
    week: session.week,
    dayIndex: session.dayIndex,
    dayName: session.dayName,
    startedAt: session.startedAt,
    finishedAt: now,
    exercises: session.exercises
      .map((ex) => ({
        name: ex.name,
        unit: ex.unit,
        sets: ex.sets.filter((s) => s.done).map((s) => ({ weight: num(s.weight), reps: num(s.reps) })),
      }))
      .filter((ex) => ex.sets.length),
  };
}

export const doneSetCount = (session) => session.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.done).length, 0);

// ---- Log summaries --------------------------------------------------------

export const entrySetCount = (entry) => entry.exercises.reduce((n, ex) => n + ex.sets.length, 0);

export const entryVolume = (entry) =>
  entry.exercises.reduce((v, ex) => v + ex.sets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0), 0);

/** Heaviest set (ties broken by reps). */
export function bestSet(sets) {
  let best = null;
  for (const s of sets) {
    if (s.weight === null && s.reps === null) continue;
    if (!best || (s.weight || 0) > (best.weight || 0) || ((s.weight || 0) === (best.weight || 0) && (s.reps || 0) > (best.reps || 0))) best = s;
  }
  return best;
}

/** One row per exercise name in the log, most recently done first. */
export function exerciseSummaries(log) {
  const map = new Map();
  log.forEach((entry, i) => {
    for (const ex of entry.exercises) {
      const row = map.get(ex.name) || { name: ex.name, unit: ex.unit, sessions: 0, sets: [], lastIndex: -1 };
      row.sessions++;
      row.sets.push(...ex.sets);
      row.lastIndex = i;
      row.unit = ex.unit;
      map.set(ex.name, row);
    }
  });
  return [...map.values()]
    .sort((a, b) => b.lastIndex - a.lastIndex)
    .map(({ name, unit, sessions, sets }) => ({ name, unit, sessions, best: bestSet(sets) }));
}

/** Every logged session of one exercise, newest first. */
export function exerciseHistory(log, name) {
  const out = [];
  for (let i = log.length - 1; i >= 0; i--) {
    const ex = log[i].exercises.find((x) => x.name === name);
    if (ex) out.push({ id: log[i].id, week: log[i].week, dayName: log[i].dayName, unit: ex.unit, sets: ex.sets });
  }
  return out;
}

export const formatSet = (s) => {
  if (s.weight === null || s.weight === 0) return s.reps === null ? '—' : `${s.reps}`;
  return `${s.weight}×${s.reps === null ? '?' : s.reps}`;
};

export function formatTarget(t, unit) {
  let out = `${t.sets} ×${t.reps === null ? ' ?' : ' ' + t.reps}`;
  if (t.weight !== null) out += ` · ${t.weight} ${unit}`;
  return out;
}
