import * as core from './core.js';
import { bust, column, icons } from './art.js';

const STORAGE_KEY = 'sisyphus.v1';

// ---- Persistence ------------------------------------------------------------

function load() {
  const empty = { schedule: null, progress: core.freshProgress(), active: null, log: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const d = JSON.parse(raw);
    return {
      schedule: d.schedule || null,
      progress: d.progress || core.freshProgress(),
      active: d.active || null,
      log: Array.isArray(d.log) ? d.log : [],
    };
  } catch {
    return empty;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    toast('Could not save on this device.');
  }
}

let data = load();
const ui = { tab: 'workout', logView: 'sessions', exercise: null, openEntry: null, toast: null };

// ---- Helpers ----------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => Math.round(n).toLocaleString();
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
let toastTimer;
function toast(msg) {
  ui.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = null; render(); }, 2600);
}

function setSchedule(schedule, label) {
  data.schedule = schedule;
  data.progress = core.freshProgress();
  data.active = null;
  save();
  ui.tab = 'workout';
  toast(`${label} loaded.`);
  render();
}

function importText(text) {
  let schedule;
  try {
    schedule = core.parseSchedule(text);
  } catch (e) {
    alert(e instanceof core.ScheduleError ? `Could not import the schedule.\n\n${e.message}` : String(e));
    return;
  }
  if (data.schedule && !confirm(`Replace "${data.schedule.name}" with "${schedule.name}"?\n\nYou will start again at week 1. Your log is kept.`)) return;
  setSchedule(schedule, `"${schedule.name}"`);
}

function download(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Views ------------------------------------------------------------------

const importButton = (label, cls = 'btn') =>
  `<label class="${cls} file-btn">${label}<input type="file" accept=".json,application/json" data-action="import-file" hidden></label>`;

function viewWelcome() {
  return `
  <section class="welcome">
    ${bust(120)}
    <h1 class="display">Sisyphus</h1>
    <p class="muted">A workout tracker that follows a fixed weekly schedule. Import your schedule as a JSON file to begin.</p>
    <div class="stack">
      ${importButton('Import schedule', 'btn primary wide')}
      <button class="btn wide" data-action="load-sample">Try the sample schedule</button>
    </div>
    <details class="format">
      <summary>Schedule format</summary>
      ${formatHelp()}
    </details>
  </section>`;
}

function formatHelp() {
  return `<p class="muted small">Each week lists its days, and each day lists its exercises. With several weeks they run in order and then repeat. <code>weight</code> and <code>notes</code> are optional, and <code>reps</code> can be text like "8-10".</p>
<pre>{
  "name": "My plan",
  "unit": "kg",
  "weeks": [
    { "days": [
      { "name": "Push",
        "exercises": [
          { "name": "Bench press",
            "sets": 3, "reps": 8,
            "weight": 60 }
        ] }
    ] }
  ]
}</pre>`;
}

function weekHeader() {
  const s = data.schedule;
  const week = core.templateWeek(s, data.progress.week);
  const sub = s.weeks.length > 1 ? `${esc(week.name)} · ${esc(s.name)}` : esc(s.name);
  return { week, sub };
}

function viewWeek() {
  const s = data.schedule;
  const { week, sub } = weekHeader();
  const next = core.nextDayIndex(s, data.progress);
  const done = data.progress.completed.length;
  const days = week.days
    .map((day, i) => {
      const isDone = data.progress.completed.includes(i);
      const isNext = i === next;
      const status = isDone ? '<span class="pill done">Done</span>' : isNext ? '<span class="pill next">Up next</span>' : '';
      const list = day.exercises.map((e) => esc(e.name)).join(' · ');
      return `
      <article class="card day ${isNext ? 'is-next' : ''} ${isDone ? 'is-done' : ''}">
        <div class="row between">
          <h3>${esc(day.name)}</h3>
          ${status}
        </div>
        <p class="muted small">${list}</p>
        ${isDone ? '' : `<div class="row gap">
          <button class="btn ${isNext ? 'primary' : ''}" data-action="start-day" data-day="${i}">Start</button>
          <button class="btn text" data-action="skip-day" data-day="${i}">Skip</button>
        </div>`}
      </article>`;
    })
    .join('');
  return `
  <header class="head">
    <div>
      <p class="eyebrow">${sub}</p>
      <h1 class="display">Week ${data.progress.week}</h1>
      <p class="muted">${done} of ${week.days.length} days done</p>
    </div>
    ${bust(70)}
  </header>
  <div class="stack">${days}</div>`;
}

function viewSession() {
  const a = data.active;
  const s = data.schedule;
  const total = core.templateWeek(s, a.week).days.length;
  const exercises = a.exercises
    .map((ex, ei) => {
      const rows = ex.sets
        .map(
          (set, si) => `
        <div class="set ${set.done ? 'is-done' : ''}">
          <span class="set-n">${si + 1}</span>
          <input aria-label="${esc(ex.name)} set ${si + 1} weight (${esc(ex.unit)})" inputmode="decimal" data-field="weight" data-ex="${ei}" data-set="${si}" value="${esc(set.weight)}" placeholder="—">
          <span class="muted">×</span>
          <input aria-label="${esc(ex.name)} set ${si + 1} reps" inputmode="numeric" data-field="reps" data-ex="${ei}" data-set="${si}" value="${esc(set.reps)}" placeholder="—">
          <button class="check" aria-label="Set ${si + 1} done" aria-pressed="${set.done}" data-action="toggle-set" data-ex="${ei}" data-set="${si}">${set.done ? icons.check : ''}</button>
        </div>`
        )
        .join('');
      const last = ex.last ? `<p class="muted small">Last time: ${ex.last.map(core.formatSet).join(' · ')}</p>` : '';
      const notes = ex.notes ? `<p class="muted small">${esc(ex.notes)}</p>` : '';
      return `
      <article class="card">
        <div class="row between">
          <h3>${esc(ex.name)}</h3>
          <span class="muted small">${esc(core.formatTarget(ex.target, ex.unit))}</span>
        </div>
        ${notes}${last}
        <div class="set head-row"><span></span><span class="small muted">${esc(ex.unit)}</span><span></span><span class="small muted">Reps</span><span></span></div>
        ${rows}
        <button class="btn text small" data-action="add-set" data-ex="${ei}">+ Add set</button>
      </article>`;
    })
    .join('');
  return `
  <header class="head">
    <div>
      <p class="eyebrow">Week ${a.week} · Day ${a.dayIndex + 1} of ${total}</p>
      <h1 class="display">${esc(a.dayName)}</h1>
      <p class="muted">${plural(core.doneSetCount(a), 'set')} done</p>
    </div>
    <div class="stack tight end">
      <button class="btn primary" data-action="finish">Finish</button>
      <button class="btn text small" data-action="discard">Discard</button>
    </div>
  </header>
  <div class="stack">${exercises}</div>`;
}

function viewLog() {
  const tabs = `
  <div class="segmented" role="group" aria-label="Log view">
    <button aria-pressed="${ui.logView === 'sessions'}" data-action="log-view" data-view="sessions">Sessions</button>
    <button aria-pressed="${ui.logView === 'exercises'}" data-action="log-view" data-view="exercises">Exercises</button>
  </div>`;
  const header = `
  <header class="head">
    <div>
      <p class="eyebrow">${plural(data.log.length, 'session')} logged</p>
      <h1 class="display">Log</h1>
    </div>
    ${column(48)}
  </header>`;
  if (!data.log.length) return `${header}<p class="muted empty">Finished workouts show up here.</p>`;
  if (ui.exercise) return viewExercise();
  return header + tabs + (ui.logView === 'sessions' ? viewSessions() : viewExercises());
}

function viewSessions() {
  return `<div class="card list">${[...data.log]
    .reverse()
    .map((e) => {
      const open = ui.openEntry === e.id;
      const vol = core.entryVolume(e);
      const unit = e.exercises[0] ? e.exercises[0].unit : '';
      const detail = open
        ? `<div class="detail">${e.exercises
            .map((ex) => `<div class="row between small"><span>${esc(ex.name)}</span><span class="muted">${ex.sets.map(core.formatSet).join(' · ')}</span></div>`)
            .join('')}</div>`
        : '';
      return `
      <div class="item">
        <button class="item-btn" aria-expanded="${open}" data-action="toggle-entry" data-id="${esc(e.id)}">
          <span><strong>Week ${e.week} · ${esc(e.dayName)}</strong><br><span class="muted small">${plural(e.exercises.length, 'exercise')} · ${plural(core.entrySetCount(e), 'set')}${vol ? ` · ${fmtNum(vol)} ${esc(unit)}` : ''}</span></span>
          <span class="chev ${open ? 'open' : ''}">${icons.chevron}</span>
        </button>
        ${detail}
      </div>`;
    })
    .join('')}</div>`;
}

function viewExercises() {
  return `<div class="card list">${core
    .exerciseSummaries(data.log)
    .map(
      (x) => `
    <div class="item">
      <button class="item-btn" data-action="open-exercise" data-name="${esc(x.name)}">
        <span><strong>${esc(x.name)}</strong><br><span class="muted small">${plural(x.sessions, 'session')}${x.best ? ` · best ${esc(core.formatSet(x.best))}${x.best.weight ? ' ' + esc(x.unit) : ''}` : ''}</span></span>
        <span class="chev">${icons.chevron}</span>
      </button>
    </div>`
    )
    .join('')}</div>`;
}

function viewExercise() {
  const name = ui.exercise;
  const hist = core.exerciseHistory(data.log, name);
  const best = core.bestSet(hist.flatMap((h) => h.sets));
  const unit = hist[0] ? hist[0].unit : '';
  return `
  <button class="btn text back" data-action="close-exercise">${icons.back} Log</button>
  <header class="head">
    <div>
      <p class="eyebrow">${plural(hist.length, 'session')}${best ? ` · best ${esc(core.formatSet(best))}${best.weight ? ' ' + esc(unit) : ''}` : ''}</p>
      <h1 class="display">${esc(name)}</h1>
    </div>
  </header>
  <div class="card list">${hist
    .map(
      (h) => `
    <div class="item static">
      <div class="row between"><strong>Week ${h.week} · ${esc(h.dayName)}</strong></div>
      <div class="muted small">${h.sets.map(core.formatSet).join(' · ')}</div>
    </div>`
    )
    .join('')}</div>`;
}

function viewSchedule() {
  const s = data.schedule;
  const weeks = s.weeks
    .map(
      (w, wi) => `
    <details class="card" ${wi === (data.progress.week - 1) % s.weeks.length ? 'open' : ''}>
      <summary><h3>${esc(w.name)}</h3><span class="muted small">${w.days.length} days</span></summary>
      ${w.days
        .map(
          (d) => `
        <div class="sched-day">
          <p class="label">${esc(d.name)}</p>
          ${d.exercises.map((e) => `<div class="row between small"><span>${esc(e.name)}</span><span class="muted">${esc(core.formatTarget(e, e.unit))}</span></div>`).join('')}
        </div>`
        )
        .join('')}
    </details>`
    )
    .join('');
  return `
  <header class="head">
    <div>
      <p class="eyebrow">${s.weeks.length} ${s.weeks.length === 1 ? 'week, repeating' : 'weeks, then repeats'}</p>
      <h1 class="display">${esc(s.name)}</h1>
    </div>
  </header>
  <div class="stack">${weeks}</div>
  <div class="stack actions">
    ${importButton('Import a new schedule', 'btn wide')}
    <button class="btn wide" data-action="export">Export my data</button>
    <button class="btn text wide danger" data-action="reset">Erase everything</button>
  </div>
  <details class="format"><summary>Schedule format</summary>${formatHelp()}</details>`;
}

function nav() {
  const item = (id, label) =>
    `<button class="tab" data-action="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icons[id]}<span>${label}</span></button>`;
  return `<nav class="tabs" aria-label="Main">${item('workout', 'Workout')}${item('log', 'Log')}${item('schedule', 'Schedule')}</nav>`;
}

function render() {
  const app = document.getElementById('app');
  let body;
  if (!data.schedule) body = viewWelcome();
  else if (ui.tab === 'log') body = viewLog();
  else if (ui.tab === 'schedule') body = viewSchedule();
  else body = data.active ? viewSession() : viewWeek();
  const scrollY = window.scrollY;
  app.innerHTML = `<main class="page">${body}</main>${data.schedule ? nav() : ''}${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ''}`;
  window.scrollTo(0, scrollY);
}

// ---- Events -----------------------------------------------------------------

const actions = {
  tab: (el) => { ui.tab = el.dataset.tab; ui.exercise = null; window.scrollTo(0, 0); },
  'load-sample': async () => {
    try {
      const res = await fetch('./sample-schedule.json');
      setSchedule(core.parseSchedule(await res.text()), 'Sample schedule');
    } catch (e) {
      alert('Could not load the sample schedule: ' + e.message);
    }
  },
  'start-day': (el) => {
    data.active = core.startSession(data.schedule, data.progress, Number(el.dataset.day), data.log);
    save();
    window.scrollTo(0, 0);
  },
  'skip-day': (el) => {
    const day = core.templateWeek(data.schedule, data.progress.week).days[Number(el.dataset.day)];
    if (!confirm(`Skip ${day.name} this week?`)) return;
    data.progress = core.completeDay(data.schedule, data.progress, Number(el.dataset.day));
    save();
  },
  'toggle-set': (el) => {
    const set = data.active.exercises[el.dataset.ex].sets[el.dataset.set];
    set.done = !set.done;
    save();
  },
  'add-set': (el) => {
    const ex = data.active.exercises[el.dataset.ex];
    const prev = ex.sets[ex.sets.length - 1];
    ex.sets.push({ weight: prev ? prev.weight : '', reps: prev ? prev.reps : '', done: false });
    save();
  },
  finish: () => {
    const a = data.active;
    const n = core.doneSetCount(a);
    if (n === 0 && !confirm('No sets are checked off. Finish anyway? Nothing will be logged, but the day counts as done.')) return;
    if (n > 0) data.log.push(core.finishSession(a));
    const wasWeek = data.progress.week;
    data.progress = core.completeDay(data.schedule, data.progress, a.dayIndex);
    data.active = null;
    save();
    toast(data.progress.week > wasWeek ? `Week ${wasWeek} complete. On to week ${data.progress.week}.` : `${a.dayName} logged.`);
    window.scrollTo(0, 0);
  },
  discard: () => {
    if (!confirm('Discard this workout? Nothing will be logged.')) return;
    data.active = null;
    save();
  },
  'log-view': (el) => { ui.logView = el.dataset.view; },
  'toggle-entry': (el) => { ui.openEntry = ui.openEntry === el.dataset.id ? null : el.dataset.id; },
  'open-exercise': (el) => { ui.exercise = el.dataset.name; window.scrollTo(0, 0); },
  'close-exercise': () => { ui.exercise = null; ui.logView = 'exercises'; },
  export: () => download('sisyphus-data.json', { exportedAt: new Date().toISOString(), ...data }),
  reset: () => {
    if (!confirm('Erase the schedule, your progress and the whole log from this device?')) return;
    if (!confirm('This cannot be undone. Erase everything?')) return;
    data = { schedule: null, progress: core.freshProgress(), active: null, log: [] };
    save();
    ui.tab = 'workout';
  },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  await fn(el);
  render();
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action !== 'import-file' || !el.files[0]) return;
  const file = el.files[0];
  el.value = '';
  file.text().then(importText);
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset.field || !data.active) return;
  data.active.exercises[el.dataset.ex].sets[el.dataset.set][el.dataset.field] = el.value.replace(',', '.');
  save();
});

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
