import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../js/core.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('run progression: 10% per run, starting at half a mile', () => {
  assert.equal(core.freshState().runTarget, 0.5);
  close(core.nextRunTarget(0.5, 0.5), 0.55);
  close(core.nextRunTarget(0.5, 0.4), 0.55, 'running less still progresses');
  assert.equal(core.nextRunTarget(0.5, null), 0.5, 'skipped run: no change');
  assert.deepEqual(core.upcomingRuns(0.5, 4), [0.5, 0.55, 0.61, 0.67]);
});

test('running further: a third of the way to what you ran, then 10%', () => {
  close(core.nextRunTarget(1, 1.6), 1.2 * 1.1);
  close(core.nextRunTarget(0.5, 0.8), 0.6 * 1.1);
  // Entering the rounded listed distance is not "further".
  close(core.nextRunTarget(0.605, 0.61), 0.605 * 1.1);
});

test('a week is Run 1, Strength, Run 2 and then rolls over', () => {
  let s = core.freshState();
  assert.equal(core.nextDayIndex(s), 0);
  s = core.skipDay(s, 1);
  assert.equal(core.nextDayIndex(s), 0);
  s.active = core.startSession(s, 0, 1);
  s.active.exercises[0].sets[0].done = true;
  s = core.finishSession(s, 2);
  close(s.runTarget, 0.55);
  assert.equal(core.nextDayIndex(s), 2);
  s.active = core.startSession(s, 2, 3);
  assert.equal(s.active.exercises[0].sets[0].distance, 0.55);
  s.active.exercises[0].sets[0] = { distance: '0.85', done: true };
  s = core.finishSession(s, 4);
  assert.deepEqual([s.week, s.completed], [2, []]);
  close(s.runTarget, (0.55 + 0.3 / 3) * 1.1);
  assert.equal(s.log.length, 2);
  assert.equal(s.log[1].listed, 0.55);
  assert.deepEqual(s.log[1].exercises[0], { name: 'Run', type: 'distance', unit: 'mi', sets: [{ distance: 0.85 }] });
});

test('unticked run: day counts as done, nothing logged, distance unchanged', () => {
  let s = core.freshState();
  s.active = core.startSession(s, 0);
  s = core.finishSession(s);
  assert.equal(s.log.length, 0);
  assert.equal(s.runTarget, 0.5);
  assert.deepEqual(s.completed, [0]);
});

test('strength: two blocks of three TBD exercises, prefilled from last time', () => {
  let s = core.freshState();
  s.active = core.startSession(s, 1);
  const names = s.active.exercises.map((e) => `${e.block}/${e.name}`);
  assert.deepEqual(names, ['Block A/A1 (TBD)', 'Block A/A2 (TBD)', 'Block A/A3 (TBD)', 'Block B/B1 (TBD)', 'Block B/B2 (TBD)', 'Block B/B3 (TBD)']);
  assert.equal(s.active.exercises[0].sets.length, 3);
  s.active.exercises[0].sets[0] = { weight: '40', reps: '10', done: true };
  s = core.finishSession(s);
  assert.equal(s.runTarget, 0.5, 'strength does not move the run');
  s.active = core.startSession(s, 1);
  assert.deepEqual(s.active.exercises[0].sets[2], { weight: 40, reps: 10, done: false });
});

test('log summaries', () => {
  const log = [
    { id: 'a', week: 1, dayName: 'Strength', exercises: [{ name: 'A1 (TBD)', type: 'weight', unit: 'kg', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }] }] },
    { id: 'b', week: 1, dayName: 'Run 1', listed: 0.5, exercises: [{ name: 'Run', type: 'distance', unit: 'mi', sets: [{ distance: 0.6 }] }] },
    { id: 'c', week: 2, dayName: 'Run 2', listed: 0.6, exercises: [{ name: 'Run', type: 'distance', unit: 'mi', sets: [{ distance: 0.5 }] }] },
  ];
  assert.deepEqual(core.entryTotals(log[0]), ['900 kg']);
  assert.deepEqual(core.entryTotals(log[1]), ['0.6 mi']);
  const run = core.exerciseSummaries(log).find((x) => x.name === 'Run');
  assert.deepEqual([run.sessions, run.best], [2, { distance: 0.6 }]);
  assert.deepEqual(core.exerciseHistory(log, 'Run', 'distance').map((h) => [h.id, h.listed]), [['c', 0.6], ['b', 0.5]]);
  assert.equal(core.formatSet({ weight: 65, reps: 5 }), '65×5');
  assert.equal(core.formatSet({ distance: 0.6 }, 'distance', 'mi'), '0.6 mi');
});

test('old log entries without a type count as weights', () => {
  const log = [{ id: 'a', week: 1, dayName: 'Push', exercises: [{ name: 'Bench', unit: 'kg', sets: [{ weight: 60, reps: 8 }] }] }];
  assert.equal(core.exerciseSummaries(log)[0].type, 'weight');
  assert.deepEqual(core.lastSetsFor(log, 'Bench'), [{ weight: 60, reps: 8 }]);
});
