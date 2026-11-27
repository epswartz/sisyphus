# Sisyphus

A workout tracker with a fixed weekly plan: two runs and one strength day.

- **Weeks, not dates.** Finish (or skip) all three days and you move on to the next week.
- **Runs progress automatically.** The first run is 0.5 mi and each run is 10% longer than the one before. If you run further than listed, the next run starts a third of the way from the listed distance to what you ran, then adds the 10%. For example, listed 1.0 mi and ran 1.6 mi gives 1.2 × 1.1 = 1.32 mi next. Running less than listed still progresses normally. Skipped runs don't change the distance.
- **Strength day:** two blocks of three exercises, all placeholders (TBD) for now.
- **A log of what you did**, by session or by exercise, with your best set per exercise.
- **Everything stays on your phone.** Data is kept in the browser's local storage. Use *Plan → Export my data* to make a backup.

The plan lives in `js/core.js` (`RUN`, `STRENGTH_BLOCKS`, `DAYS`).

It is a plain installable web app (PWA): no build step and no dependencies.

## Running it

```bash
npm start
```

Then open http://localhost:8000.

```bash
npm test
```

Pushing to `main` deploys to GitHub Pages and stamps the build number shown at the bottom of the Plan tab.

### Single-file version

[`standalone/sisyphus.html`](standalone/sisyphus.html) is the whole app in one file. Open it directly in a browser, no server needed. It has no offline caching or home-screen install. Rebuild it after changing the source:

```bash
node scripts/build-standalone.mjs
```
