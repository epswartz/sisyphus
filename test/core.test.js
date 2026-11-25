import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../js/core.js';

const sample = readFileSync(new URL('../sample-schedule.json', import.meta.url), 'utf8');

test('parses the sample schedule', () => {
  const s = core.parseSchedule(sample);
  assert.equal(s.name, 'Push Pull Legs');
  assert.equal(s.weeks.length, 2);
  assert.equal(s.weeks[0].days[0].exercises[0].unit, 'kg');
  assert.equal(s.weeks[0].days[0].exercises[2].weight, null);
});

test('accepts the one-week "days" shorthand and fills defaults', () => {
  const s = core.parseSchedule({ days: [{ exercises: [{ name: 'Squat' }] }] });
  assert.equal(s.weeks.length, 1);
  assert.equal(s.weeks[0].days[0].name, 'Day 1');
  assert.deepEqual(s.weeks[0].days[0].exercises[0], { name: 'Squat', type: 'weight', sets: 3, reps: null, weight: null, distance: null, seconds: null, unit: 'kg', notes: '' });
});

test('reports where a schedule is wrong', () => {
  assert.throws(() => core.parseSchedule('{nope'), /not valid JSON/);
  assert.throws(() => core.parseSchedule({}), /"weeks" list/);
  assert.throws(
    () => core.parseSchedule({ weeks: [{ days: [{ name: 'Push', exercises: [{ name: 'Bench', sets: 0 }] }] }] }),
    /Week 1, day 1 \("Push"\), exercise 1 \("Bench"\): "sets"/
  );
  assert.throws(() => core.parseSchedule({ days: [{ exercises: [{ sets: 3 }] }] }), /needs a "name"/);
});

test('progress walks through days, then weeks, and the schedule repeats', () => {
  const s = core.parseSchedule(sample);
  let p = core.freshProgress();
  assert.equal(core.nextDayIndex(s, p), 0);
  p = core.completeDay(s, p, 1);
  assert.equal(core.nextDayIndex(s, p), 0);
  p = core.completeDay(s, p, 0);
  assert.equal(core.nextDayIndex(s, p), 2);
  p = core.completeDay(s, p, 2);
  assert.deepEqual(p, { week: 2, completed: [] });
  assert.equal(core.templateWeek(s, 2).name, 'Heavy week');
  assert.equal(core.templateWeek(s, 3).name, 'Base week');
});

test('sessions prefill from the schedule, then from the last log', () => {
  const s = core.parseSchedule(sample);
  const p = core.freshProgress();
  const first = core.startSession(s, p, 1, [], 1000);
  const pullups = first.exercises[1];
  assert.equal(pullups.name, 'Pull-ups');
  assert.deepEqual(pullups.sets[0], { weight: '', reps: 6, done: false });

  pullups.sets[0] = { weight: '5', reps: '8', done: true };
  first.exercises[0].sets[0].done = true;
  const entry = core.finishSession(first, 2000);
  assert.equal(core.entrySetCount(entry), 2);
  assert.deepEqual(entry.exercises[1].sets, [{ weight: 5, reps: 8 }]);

  const again = core.startSession(s, p, 1, [entry], 3000);
  assert.equal(again.exercises[1].sets[0].weight, 5);
  assert.equal(again.exercises[0].sets[0].weight, 100, 'scheduled weight wins');
});

test('log summaries per exercise', () => {
  const log = [
    { id: 'a', week: 1, dayName: 'Push', exercises: [{ name: 'Bench', unit: 'kg', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }] }] },
    { id: 'b', week: 2, dayName: 'Push', exercises: [{ name: 'Bench', unit: 'kg', sets: [{ weight: 65, reps: 5 }] }, { name: 'Dips', unit: 'kg', sets: [{ weight: null, reps: 10 }] }] },
  ];
  assert.equal(core.entryVolume(log[0]), 900);
  const rows = core.exerciseSummaries(log);
  assert.deepEqual(rows.map((r) => r.name).sort(), ['Bench', 'Dips']);
  const bench = rows.find((r) => r.name === 'Bench');
  assert.equal(bench.sessions, 2);
  assert.deepEqual(bench.best, { weight: 65, reps: 5 });
  assert.deepEqual(core.exerciseHistory(log, 'Bench').map((h) => h.id), ['b', 'a']);
  assert.equal(core.formatSet({ weight: null, reps: 10 }), '10');
  assert.equal(core.formatSet({ weight: 65, reps: 5 }), '65×5');
});

test('distance and time exercises', () => {
  const s = core.parseSchedule({
    days: [{ name: 'Run', exercises: [
      { name: 'Jog', type: 'distance', distance: 0.25 },
      { name: 'Plank', type: 'time', sets: 3, seconds: 45 },
      { name: 'Row', type: 'distance', unit: 'm' },
    ] }],
  });
  const [jog, plank, row] = s.weeks[0].days[0].exercises;
  assert.equal(jog.sets, 1);
  assert.equal(jog.unit, 'mi');
  assert.equal(row.unit, 'm');
  assert.equal(core.formatTarget(jog, jog.unit, jog.type), '0.25 mi');
  assert.equal(core.formatTarget(plank, plank.unit, plank.type), '3 × 0:45');
  assert.throws(() => core.parseSchedule({ days: [{ exercises: [{ name: 'X', type: 'swim' }] }] }), /"type" must be one of/);
  assert.throws(() => core.parseSchedule({ days: [{ exercises: [{ name: 'X', type: 'distance', distance: -1 }] }] }), /"distance" must be a number above 0/);

  const session = core.startSession(s, core.freshProgress(), 0, []);
  assert.deepEqual(session.exercises[0].sets, [{ distance: 0.25, done: false }]);
  assert.deepEqual(session.exercises[1].sets[0], { time: '0:45', done: false });
  session.exercises[0].sets[0] = { distance: '0.3', done: true };
  session.exercises[1].sets[0] = { time: '1:05', done: true };
  const entry = core.finishSession(session);
  assert.deepEqual(entry.exercises[0], { name: 'Jog', type: 'distance', unit: 'mi', sets: [{ distance: 0.3 }] });
  assert.deepEqual(entry.exercises[1].sets, [{ seconds: 65 }]);
  assert.deepEqual(core.entryTotals(entry), ['0.3 mi', '1:05']);
  assert.equal(core.formatSet(entry.exercises[0].sets[0], 'distance', 'mi'), '0.3 mi');

  const next = core.startSession(s, core.freshProgress(), 0, [entry]);
  assert.equal(next.exercises[2].sets[0].distance, '', 'no target and no history');
  const summary = core.exerciseSummaries([entry]).find((x) => x.name === 'Plank');
  assert.deepEqual(summary.best, { seconds: 65 });
});

test('durations', () => {
  assert.equal(core.parseDuration('1:30'), 90);
  assert.equal(core.parseDuration('45'), 45);
  assert.equal(core.parseDuration('1:02:03'), 3723);
  assert.equal(core.parseDuration('abc'), null);
  assert.equal(core.parseDuration(''), null);
  assert.equal(core.formatDuration(3723), '1:02:03');
  assert.equal(core.formatDuration(5), '0:05');
});

test('old log entries without a type still work', () => {
  const log = [{ id: 'a', week: 1, dayName: 'Push', exercises: [{ name: 'Bench', unit: 'kg', sets: [{ weight: 60, reps: 8 }] }] }];
  assert.equal(core.exerciseSummaries(log)[0].type, 'weight');
  assert.equal(core.exerciseHistory(log, 'Bench').length, 1);
  assert.deepEqual(core.lastSetsFor(log, 'Bench'), [{ weight: 60, reps: 8 }]);
});
