import * as core from './core.js';
import { bust, column, icons } from './art.js';
import { BUILD } from './version.js';

const STORAGE_KEY = 'sisyphus.v2';
const OLD_KEY = 'sisyphus.v1';

// ---- Persistence ------------------------------------------------------------

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        ...core.freshState(),
        week: d.week || 1,
        completed: Array.isArray(d.completed) ? d.completed : [],
        runTarget: typeof d.runTarget === 'number' && d.runTarget > 0 ? d.runTarget : core.RUN.start,
        active: d.active || null,
        log: Array.isArray(d.log) ? d.log : [],
      };
    }
    // Moving from the schedule-import version: keep the log, start the plan fresh.
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    return { ...core.freshState(), log: old && Array.isArray(old.log) ? old.log : [] };
  } catch {
    return core.freshState();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save on this device.');
  }
}

let state = load();
save();
const ui = { tab: 'workout', logView: 'sessions', exercise: null, openEntry: null, toast: null };

// ---- Helpers ----------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const miles = (n) => `${core.roundMiles(n)} ${core.RUN.unit}`;
const bestLabel = (set, type, unit) => (set ? ` · best ${esc(core.formatSet(set, type, unit))}${type === 'weight' && set.weight ? ' ' + esc(unit) : ''}` : '');

let toastTimer;
function toast(msg) {
  ui.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = null; render(); }, 3000);
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

function dayPreview(day, i) {
  if (day.kind === 'run') {
    // Runs still to do this week get the next distances in order.
    const pending = core.DAYS.map((d, j) => j).filter((j) => core.DAYS[j].kind === 'run' && !state.completed.includes(j));
    return `Run ${miles(core.upcomingRuns(state.runTarget, pending.length)[pending.indexOf(i)])}`;
  }
  return core.STRENGTH_BLOCKS.map((b) => `${b.name}: ${b.exercises.length} exercises`).join(' · ');
}

function viewWeek() {
  const next = core.nextDayIndex(state);
  const days = core.DAYS.map((day, i) => {
    const isDone = state.completed.includes(i);
    const isNext = i === next;
    const status = isDone ? '<span class="pill done">Done</span>' : isNext ? '<span class="pill next">Up next</span>' : '';
    return `
      <article class="card day ${isNext ? 'is-next' : ''} ${isDone ? 'is-done' : ''}">
        <div class="row between">
          <h3>${esc(day.name)}</h3>
          ${status}
        </div>
        <p class="muted small">${isDone ? 'Done this week' : esc(dayPreview(day, i))}</p>
        ${isDone ? '' : `<div class="row gap">
          <button class="btn ${isNext ? 'primary' : ''}" data-action="start-day" data-day="${i}">Start</button>
          <button class="btn text" data-action="skip-day" data-day="${i}">Skip</button>
        </div>`}
      </article>`;
  }).join('');
  return `
  <header class="head">
    <div>
      <p class="eyebrow">${plural(state.completed.length, 'day')} of ${core.DAYS.length} done</p>
      <h1 class="display">Week ${state.week}</h1>
    </div>
    ${bust(70)}
  </header>
  <div class="stack">${days}</div>`;
}

function viewSession() {
  const a = state.active;
  let lastBlock = null;
  const exercises = a.exercises.map((ex, ei) => {
    const type = core.typeOf(ex);
    const field = (name, si, label, mode) =>
      `<input aria-label="${esc(ex.name)} set ${si + 1} ${label}" inputmode="${mode}" data-field="${name}" data-ex="${ei}" data-set="${si}" value="${esc(ex.sets[si][name] ?? '')}" placeholder="—">`;
    const rows = ex.sets.map((set, si) => {
      const inputs = type === 'distance'
        ? field('distance', si, `distance (${ex.unit})`, 'decimal')
        : `${field('weight', si, `weight (${ex.unit})`, 'decimal')}<span class="muted">×</span>${field('reps', si, 'reps', 'numeric')}`;
      return `
        <div class="set ${type === 'distance' ? 'single' : ''} ${set.done ? 'is-done' : ''}">
          <span class="set-n">${si + 1}</span>
          ${inputs}
          <button class="check" aria-label="Set ${si + 1} done" aria-pressed="${set.done}" data-action="toggle-set" data-ex="${ei}" data-set="${si}">${set.done ? icons.check : ''}</button>
        </div>`;
    }).join('');
    const head = type === 'distance'
      ? `<div class="set single head-row"><span></span><span class="small muted">${esc(ex.unit)}</span><span></span></div>`
      : `<div class="set head-row"><span></span><span class="small muted">${esc(ex.unit)}</span><span></span><span class="small muted">Reps</span><span></span></div>`;
    const target = type === 'distance' ? `Listed ${miles(ex.target.distance)}` : `${ex.target.sets} sets`;
    const last = ex.last ? `<p class="muted small">Last time: ${ex.last.map((x) => core.formatSet(x, type, ex.unit)).join(' · ')}</p>` : '';
    const blockHead = ex.block && ex.block !== lastBlock ? `<h2 class="block-head">${esc(ex.block)}</h2>` : '';
    lastBlock = ex.block || lastBlock;
    return `
      ${blockHead}
      <article class="card">
        <div class="row between">
          <h3>${esc(ex.name)}</h3>
          <span class="muted small">${esc(target)}</span>
        </div>
        ${last}
        ${head}
        ${rows}
        ${type === 'distance' ? '' : `<button class="btn text small" data-action="add-set" data-ex="${ei}">+ Add set</button>`}
      </article>`;
  }).join('');
  const hint = a.kind === 'run'
    ? `<p class="muted small hint">Change the distance if you ran a different amount, then tick it off. Running further than listed raises your next runs.</p>`
    : '';
  return `
  <header class="head">
    <div>
      <p class="eyebrow">Week ${a.week}</p>
      <h1 class="display">${esc(a.dayName)}</h1>
      <p class="muted">${plural(core.doneSetCount(a), 'set')} done</p>
    </div>
    <div class="stack tight end">
      <button class="btn primary" data-action="finish">Finish</button>
      <button class="btn text small" data-action="discard">Discard</button>
    </div>
  </header>
  ${hint}
  <div class="stack">${exercises}</div>`;
}

function viewLog() {
  const header = `
  <header class="head">
    <div>
      <p class="eyebrow">${plural(state.log.length, 'session')} logged</p>
      <h1 class="display">Log</h1>
    </div>
    ${column(48)}
  </header>`;
  if (!state.log.length) return `${header}<p class="muted empty">Finished workouts show up here.</p>`;
  if (ui.exercise) return viewExercise();
  const tabs = `
  <div class="segmented" role="group" aria-label="Log view">
    <button aria-pressed="${ui.logView === 'sessions'}" data-action="log-view" data-view="sessions">Sessions</button>
    <button aria-pressed="${ui.logView === 'exercises'}" data-action="log-view" data-view="exercises">Exercises</button>
  </div>`;
  return header + tabs + (ui.logView === 'sessions' ? viewSessions() : viewExercises());
}

function viewSessions() {
  return `<div class="card list">${[...state.log].reverse().map((e) => {
    const open = ui.openEntry === e.id;
    const totals = core.entryTotals(e).map((t) => ` · ${esc(t)}`).join('');
    const listed = e.listed ? `<div class="row between small"><span class="muted">Listed</span><span class="muted">${esc(miles(e.listed))}</span></div>` : '';
    const detail = open
      ? `<div class="detail">${listed}${e.exercises.map((ex) => `<div class="row between small"><span>${esc(ex.name)}</span><span class="muted">${ex.sets.map((x) => core.formatSet(x, core.typeOf(ex), ex.unit)).join(' · ')}</span></div>`).join('')}</div>`
      : '';
    return `
      <div class="item">
        <button class="item-btn" aria-expanded="${open}" data-action="toggle-entry" data-id="${esc(e.id)}">
          <span><strong>Week ${e.week} · ${esc(e.dayName)}</strong><br><span class="muted small">${plural(core.entrySetCount(e), 'set')}${totals}</span></span>
          <span class="chev ${open ? 'open' : ''}">${icons.chevron}</span>
        </button>
        ${detail}
      </div>`;
  }).join('')}</div>`;
}

function viewExercises() {
  return `<div class="card list">${core.exerciseSummaries(state.log).map((x) => `
    <div class="item">
      <button class="item-btn" data-action="open-exercise" data-name="${esc(x.name)}" data-type="${x.type}">
        <span><strong>${esc(x.name)}</strong><br><span class="muted small">${plural(x.sessions, 'session')}${bestLabel(x.best, x.type, x.unit)}</span></span>
        <span class="chev">${icons.chevron}</span>
      </button>
    </div>`).join('')}</div>`;
}

function viewExercise() {
  const { name, type } = ui.exercise;
  const hist = core.exerciseHistory(state.log, name, type);
  const best = core.bestSet(hist.flatMap((h) => h.sets), type);
  const unit = hist[0] ? hist[0].unit : '';
  return `
  <button class="btn text back" data-action="close-exercise">${icons.back} Log</button>
  <header class="head">
    <div>
      <p class="eyebrow">${plural(hist.length, 'session')}${bestLabel(best, type, unit)}</p>
      <h1 class="display">${esc(name)}</h1>
    </div>
  </header>
  <div class="card list">${hist.map((h) => `
    <div class="item static">
      <div class="row between"><strong>Week ${h.week} · ${esc(h.dayName)}</strong>${h.listed ? `<span class="muted small">listed ${esc(miles(h.listed))}</span>` : ''}</div>
      <div class="muted small">${h.sets.map((x) => core.formatSet(x, type, h.unit)).join(' · ')}</div>
    </div>`).join('')}</div>`;
}

function viewPlan() {
  const upcoming = core.upcomingRuns(state.runTarget, 6);
  return `
  <header class="head">
    <div>
      <p class="eyebrow">Every week</p>
      <h1 class="display">Plan</h1>
    </div>
  </header>
  <div class="stack">
    <section class="card">
      <div class="row between"><h3>Running</h3><span class="muted small">2 runs a week</span></div>
      <p class="muted small">Each run is 10% longer than the one before. Run further than listed and the next run starts a third of the way from the listed distance to what you ran, plus 10%.</p>
      <div class="upcoming">
        ${upcoming.map((d, i) => i === 0
          ? `<div class="row between small"><strong>Next run</strong><strong>${esc(miles(d))}</strong></div>`
          : `<div class="row between small muted"><span>Then</span><span>${esc(miles(d))}</span></div>`).join('')}
      </div>
    </section>
    <section class="card">
      <div class="row between"><h3>Strength</h3><span class="muted small">1 day a week</span></div>
      ${core.STRENGTH_BLOCKS.map((b) => `
        <div class="sched-day">
          <p class="label">${esc(b.name)}</p>
          ${b.exercises.map((id) => `<div class="row between small"><span>${esc(id)}</span><span class="muted">TBD · ${core.STRENGTH_SETS} sets</span></div>`).join('')}
        </div>`).join('')}
    </section>
  </div>
  <div class="stack actions">
    <button class="btn wide" data-action="export">Export my data</button>
    <div class="row between">
      <button class="btn text danger" data-action="reset">Erase everything</button>
      <span class="build muted small">Build ${esc(BUILD)}</span>
    </div>
  </div>`;
}

function nav() {
  const item = (id, label, icon) =>
    `<button class="tab" data-action="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icons[icon]}<span>${label}</span></button>`;
  return `<nav class="tabs" aria-label="Main">${item('workout', 'Workout', 'workout')}${item('log', 'Log', 'log')}${item('plan', 'Plan', 'schedule')}</nav>`;
}

function render() {
  const app = document.getElementById('app');
  const body = ui.tab === 'log' ? viewLog() : ui.tab === 'plan' ? viewPlan() : state.active ? viewSession() : viewWeek();
  const scrollY = window.scrollY;
  app.innerHTML = `<main class="page">${body}</main>${nav()}${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ''}`;
  window.scrollTo(0, scrollY);
}

// ---- Events -----------------------------------------------------------------

const actions = {
  tab: (el) => { ui.tab = el.dataset.tab; ui.exercise = null; window.scrollTo(0, 0); },
  'start-day': (el) => {
    state.active = core.startSession(state, Number(el.dataset.day));
    save();
    window.scrollTo(0, 0);
  },
  'skip-day': (el) => {
    const day = core.DAYS[Number(el.dataset.day)];
    const note = day.kind === 'run' ? ' Your next run stays the same distance.' : '';
    if (!confirm(`Skip ${day.name} this week?${note}`)) return;
    state = core.skipDay(state, Number(el.dataset.day));
    save();
  },
  'toggle-set': (el) => {
    const set = state.active.exercises[el.dataset.ex].sets[el.dataset.set];
    set.done = !set.done;
    save();
  },
  'add-set': (el) => {
    const ex = state.active.exercises[el.dataset.ex];
    ex.sets.push(core.nextSet(ex));
    save();
  },
  finish: () => {
    const a = state.active;
    if (core.doneSetCount(a) === 0) {
      const note = a.kind === 'run' ? ' Nothing will be logged and your next run stays the same distance.' : ' Nothing will be logged.';
      if (!confirm(`Nothing is ticked off. Finish anyway?${note}`)) return;
    }
    const wasWeek = state.week;
    state = core.finishSession(state);
    save();
    const runNote = a.kind === 'run' ? ` Next run: ${miles(state.runTarget)}.` : '';
    toast(state.week > wasWeek ? `Week ${wasWeek} complete.${runNote}` : `${a.dayName} logged.${runNote}`);
    window.scrollTo(0, 0);
  },
  discard: () => {
    if (!confirm('Discard this workout? Nothing will be logged.')) return;
    state.active = null;
    save();
  },
  'log-view': (el) => { ui.logView = el.dataset.view; },
  'toggle-entry': (el) => { ui.openEntry = ui.openEntry === el.dataset.id ? null : el.dataset.id; },
  'open-exercise': (el) => { ui.exercise = { name: el.dataset.name, type: el.dataset.type || 'weight' }; window.scrollTo(0, 0); },
  'close-exercise': () => { ui.exercise = null; ui.logView = 'exercises'; },
  export: () => download('sisyphus-data.json', { exportedAt: new Date().toISOString(), build: BUILD, ...state }),
  reset: () => {
    if (!confirm('Erase your progress and the whole log from this device?')) return;
    if (!confirm('This cannot be undone. Erase everything?')) return;
    state = core.freshState();
    try { localStorage.removeItem(OLD_KEY); } catch { /* ignore */ }
    save();
    ui.tab = 'workout';
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  fn(el);
  render();
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset.field || !state.active) return;
  state.active.exercises[el.dataset.ex].sets[el.dataset.set][el.dataset.field] = el.value.replace(',', '.');
  save();
});

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // When an update takes over, reload once so the new code runs right away.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => reg.update())
    .catch(() => {});
}
