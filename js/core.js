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
  const distanceUnit = str(data.distanceUnit) || 'mi';
  let weeks;
  if (Array.isArray(data.weeks)) weeks = data.weeks;
  else if (Array.isArray(data.days)) weeks = [{ days: data.days }];
  else fail('The schedule needs a "weeks" list, or a "days" list for one repeating week.');
  if (!weeks.length) fail('"weeks" is empty.');
  return {
    name: str(data.name) || 'My schedule',
    unit,
    distanceUnit,
    weeks: weeks.map((w, wi) => normWeek(w, wi, { unit, distanceUnit })),
  };
}

function normWeek(w, wi, units) {
  const where = `Week ${wi + 1}`;
  if (!isObj(w)) fail(`${where} must be an object with a "days" list.`);
  if (!Array.isArray(w.days) || !w.days.length) fail(`${where} needs a non-empty "days" list.`);
  return { name: str(w.name) || where, days: w.days.map((d, di) => normDay(d, di, where, units)) };
}

function normDay(d, di, weekWhere, units) {
  const where = `${weekWhere}, day ${di + 1}`;
  if (!isObj(d)) fail(`${where} must be an object.`);
  const name = str(d.name) || `Day ${di + 1}`;
  if (!Array.isArray(d.exercises) || !d.exercises.length) fail(`${where} ("${name}") needs a non-empty "exercises" list.`);
  return { name, exercises: d.exercises.map((e, ei) => normExercise(e, ei, `${where} ("${name}")`, units)) };
}

export const TYPES = ['weight', 'distance', 'time'];

function normExercise(e, ei, dayWhere, units) {
  const where = `${dayWhere}, exercise ${ei + 1}`;
  if (!isObj(e)) fail(`${where} must be an object.`);
  const name = str(e.name);
  if (!name) fail(`${where} needs a "name".`);
  const label = `${where} ("${name}")`;
  const type = str(e.type) || 'weight';
  if (!TYPES.includes(type)) fail(`${label}: "type" must be one of ${TYPES.map((t) => `"${t}"`).join(', ')}.`);

  const sets = e.sets === undefined ? (type === 'weight' ? 3 : 1) : e.sets;
  if (!Number.isInteger(sets) || sets < 1 || sets > 50) fail(`${label}: "sets" must be a whole number from 1 to 50.`);
  const positive = (key) => {
    const v = e[key] === undefined || e[key] === null ? null : e[key];
    if (v !== null && !(typeof v === 'number' && v > 0)) fail(`${label}: "${key}" must be a number above 0.`);
    return v;
  };
  const out = { name, type, sets, reps: null, weight: null, distance: null, seconds: null, unit: '', notes: str(e.notes) };

  if (type === 'distance') {
    out.distance = positive('distance');
    out.unit = str(e.unit) || units.distanceUnit;
  } else if (type === 'time') {
    out.seconds = positive('seconds');
  } else {
    let reps = e.reps === undefined ? null : e.reps;
    if (reps !== null && !((typeof reps === 'number' && reps > 0) || (typeof reps === 'string' && reps.trim()))) {
      fail(`${label}: "reps" must be a number or text like "8-10".`);
    }
    out.reps = typeof reps === 'string' ? reps.trim() : reps;
    const weight = e.weight === undefined || e.weight === null ? null : e.weight;
    if (weight !== null && !(typeof weight === 'number' && weight >= 0)) fail(`${label}: "weight" must be a number.`);
    out.weight = weight;
    out.unit = str(e.unit) || units.unit;
  }
  return out;
}

// ---- Durations --------------------------------------------------------------

/** "1:30" → 90, "1:02:03" → 3723, "45" → 45 (plain numbers are seconds). */
export function parseDuration(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (!/^\d+(\.\d+)?$|^\d+(:\d{1,2}){1,2}$/.test(t)) return null;
  return Math.round(t.split(':').reduce((acc, part) => acc * 60 + Number(part), 0));
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
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

/** Exercises saved before types existed are weight exercises. */
export const typeOf = (ex) => (ex && ex.type) || 'weight';

const leadingNumber = (reps) => {
  if (typeof reps === 'number') return reps;
  const m = typeof reps === 'string' ? reps.match(/\d+/) : null;
  return m ? Number(m[0]) : '';
};

/** Sets from the most recent logged session that included this exercise. */
export function lastSetsFor(log, name, type = 'weight') {
  for (let i = log.length - 1; i >= 0; i--) {
    const ex = log[i].exercises.find((x) => x.name === name && typeOf(x) === type);
    if (ex && ex.sets.length) return ex.sets;
  }
  return null;
}

/** The editable values a new set starts with. Inputs hold text, so time is "m:ss". */
function prefillSet(ex, prev) {
  if (ex.type === 'distance') return { distance: ex.distance !== null ? ex.distance : prev ? prev.distance ?? '' : '', done: false };
  if (ex.type === 'time') return { time: formatDuration(ex.seconds !== null ? ex.seconds : prev ? prev.seconds : null), done: false };
  return { weight: ex.weight !== null ? ex.weight : prev ? prev.weight ?? '' : '', reps: leadingNumber(ex.reps), done: false };
}

export function startSession(schedule, progress, dayIndex, log, now = Date.now()) {
  const day = templateWeek(schedule, progress.week).days[dayIndex];
  return {
    week: progress.week,
    dayIndex,
    dayName: day.name,
    startedAt: now,
    exercises: day.exercises.map((raw) => {
      const ex = { ...raw, type: typeOf(raw) };
      const last = lastSetsFor(log, ex.name, ex.type);
      const sets = [];
      for (let i = 0; i < ex.sets; i++) sets.push(prefillSet(ex, last ? last[Math.min(i, last.length - 1)] : null));
      return {
        name: ex.name,
        type: ex.type,
        unit: ex.unit,
        notes: ex.notes,
        target: { sets: ex.sets, reps: ex.reps, weight: ex.weight, distance: ex.distance, seconds: ex.seconds },
        last,
        sets,
      };
    }),
  };
}

/** A copy of the set before it, for "+ Add set". */
export function nextSet(ex) {
  const prev = ex.sets[ex.sets.length - 1];
  return prev ? { ...prev, done: false } : prefillSet({ ...ex.target, type: typeOf(ex) }, null);
}

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

function loggedSet(set, type) {
  if (type === 'distance') return { distance: num(set.distance) };
  if (type === 'time') return { seconds: parseDuration(set.time) };
  return { weight: num(set.weight), reps: num(set.reps) };
}

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
        type: typeOf(ex),
        unit: ex.unit,
        sets: ex.sets.filter((s) => s.done).map((s) => loggedSet(s, typeOf(ex))),
      }))
      .filter((ex) => ex.sets.length),
  };
}

export const doneSetCount = (session) => session.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.done).length, 0);

// ---- Log summaries --------------------------------------------------------

export const entrySetCount = (entry) => entry.exercises.reduce((n, ex) => n + ex.sets.length, 0);

export const entryVolume = (entry) =>
  entry.exercises
    .filter((ex) => typeOf(ex) === 'weight')
    .reduce((v, ex) => v + ex.sets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0), 0);

/** Totals worth showing for a session, e.g. ["1,260 kg", "1.5 mi", "3:00"]. */
export function entryTotals(entry) {
  const out = [];
  const byUnit = new Map();
  let seconds = 0;
  for (const ex of entry.exercises) {
    const type = typeOf(ex);
    for (const set of ex.sets) {
      if (type === 'weight') byUnit.set(ex.unit, (byUnit.get(ex.unit) || 0) + (set.weight || 0) * (set.reps || 0));
      else if (type === 'distance') byUnit.set(ex.unit, (byUnit.get(ex.unit) || 0) + (set.distance || 0));
      else seconds += set.seconds || 0;
    }
  }
  for (const [unit, total] of byUnit) if (total) out.push(`${round2(total).toLocaleString()} ${unit}`);
  if (seconds) out.push(formatDuration(seconds));
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;

/** The best set: heaviest (then most reps), furthest, or longest. */
export function bestSet(sets, type = 'weight') {
  let best = null;
  const better = {
    weight: (a, b) => (a.weight || 0) > (b.weight || 0) || ((a.weight || 0) === (b.weight || 0) && (a.reps || 0) > (b.reps || 0)),
    distance: (a, b) => (a.distance || 0) > (b.distance || 0),
    time: (a, b) => (a.seconds || 0) > (b.seconds || 0),
  }[type];
  for (const s of sets) {
    const empty = type === 'weight' ? s.weight === null && s.reps === null : type === 'distance' ? s.distance === null : s.seconds === null;
    if (empty) continue;
    if (!best || better(s, best)) best = s;
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
    if (ex) out.push({ id: log[i].id, week: log[i].week, dayName: log[i].dayName, type, unit: ex.unit, sets: ex.sets });
  }
  return out;
}

/** "60×8" (weights), "1.2 mi" (distance), "1:30" (time). */
export function formatSet(s, type = 'weight', unit = '') {
  if (type === 'distance') return s.distance === null ? '—' : `${round2(s.distance)}${unit ? ' ' + unit : ''}`;
  if (type === 'time') return s.seconds === null ? '—' : formatDuration(s.seconds);
  if (s.weight === null || s.weight === 0) return s.reps === null ? '—' : `${s.reps}`;
  return `${s.weight}×${s.reps === null ? '?' : s.reps}`;
}

/** The target as written in the schedule, e.g. "3 × 8 · 60 kg", "0.5 mi", "3 × 0:45". */
export function formatTarget(t, unit, type = 'weight') {
  if (type === 'distance' || type === 'time') {
    const each = type === 'distance' ? (t.distance === null ? 'any distance' : `${t.distance} ${unit}`) : t.seconds === null ? 'any time' : formatDuration(t.seconds);
    return t.sets > 1 ? `${t.sets} × ${each}` : each;
  }
  let out = `${t.sets} ×${t.reps === null ? ' ?' : ' ' + t.reps}`;
  if (t.weight !== null) out += ` · ${t.weight} ${unit}`;
  return out;
}
