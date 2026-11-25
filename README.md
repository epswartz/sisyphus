# Sisyphus

A workout tracker that follows a fixed schedule, week by week. Import your schedule as JSON and the app walks you through it, then keeps a log of what you actually did.

- **No dates.** Progress is counted in weeks: finish (or skip) every day of a week and you move on to the next.
- **Schedules repeat.** A schedule with several weeks runs through them in order, then starts again from the first.
- **A log of what you did**, viewable by session or by exercise, with your best set per exercise.
- **Everything stays on your phone.** Data is kept in the browser's local storage. Use *Schedule → Export my data* to make a backup.

It is a plain installable web app (PWA): no build step and no dependencies.

## Running it

```bash
npm start
```

Then open http://localhost:8000. To use it on a phone, host the folder on any static host (GitHub Pages works) and use the browser's "Add to Home Screen".

```bash
npm test
```

### Single-file version

[`standalone/sisyphus.html`](standalone/sisyphus.html) is the whole app in one file. Open it directly in a browser, no server needed. It has no offline caching or home-screen install. Rebuild it after changing the source:

```bash
node scripts/build-standalone.mjs
```

## Schedule format

```json
{
  "name": "Push Pull Legs",
  "unit": "kg",
  "weeks": [
    {
      "name": "Base week",
      "days": [
        {
          "name": "Push",
          "exercises": [
            { "name": "Bench press", "sets": 3, "reps": 8, "weight": 60 },
            { "name": "Dips", "sets": 2, "reps": "10-12", "notes": "Bodyweight" }
          ]
        }
      ]
    }
  ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `name` | no | Shown in the app. |
| `unit` | no | Default weight unit, `kg` if left out. An exercise can set its own `unit`. |
| `weeks` | yes* | List of weeks, each with a `days` list. *Or give a top-level `days` list for a single repeating week. |
| `days[].name` | no | Defaults to "Day 1", "Day 2", … |
| `exercises[].name` | yes | Exercises with the same name share their log history. |
| `exercises[].sets` | no | Whole number, default 3. |
| `exercises[].reps` | no | A number, or text like `"8-10"` or `"AMRAP"`. |
| `exercises[].weight` | no | Prefills each set. Without it, the app prefills from the last time you did the exercise. |
| `exercises[].notes` | no | Shown under the exercise. |

See [`sample-schedule.json`](sample-schedule.json) for a full two-week example.
