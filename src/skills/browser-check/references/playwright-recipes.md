# Playwright recipes

Patterns for the scripts the check writes. Read the section you need.

- [Script skeleton](#script-skeleton)
- [Settling](#settling)
- [Dumping interactive elements](#dumping-interactive-elements)
- [Choosing selectors](#choosing-selectors)
- [Console and network capture](#console-and-network-capture)
- [Signing in once](#signing-in-once)
- [Screenshots that show the claim](#screenshots-that-show-the-claim)
- [Running the script](#running-the-script)

## Script skeleton

Write plain ESM and run it with `node`. Import from `playwright` or `@playwright/test`, whichever `package.json` lists. Register console and request listeners before `goto`, or errors raised during load are lost.

```js
// .browser-check/save-button.mjs (sample name; one claim per file)
import { chromium } from 'playwright';

const url = process.env.APP_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`request: ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

try {
  await page.goto(`${url}/notes/new`, { waitUntil: 'networkidle' });
  // Compare the pathname, not a substring: '/login?next=/notes/new' contains '/notes/new'.
  if (new URL(page.url()).pathname !== '/notes/new') throw new Error(`redirected to ${page.url()}`);

  // Reconnaissance: look before acting.
  await page.screenshot({ path: '.browser-check/01-before.png', fullPage: true });

  // Action and assertion, encoding the claim.
  const save = page.getByRole('button', { name: 'Save' });
  if (!(await save.isDisabled())) throw new Error('Save enabled with an empty title');
  await page.getByLabel('Title').fill('Browser check sample');
  // The re-render after fill() is asynchronous; one isDisabled() call right after it races it.
  await page.getByRole('button', { name: 'Save', disabled: false }).waitFor({ timeout: 5000 })
    .catch(() => { throw new Error('Save still disabled after typing a title'); });

  await page.screenshot({ path: '.browser-check/02-after.png', fullPage: true });
  console.log(JSON.stringify({ result: 'pass', errors }, null, 2));
  process.exitCode = errors.length ? 2 : 0;
} catch (error) {
  await page.screenshot({ path: '.browser-check/99-failure.png', fullPage: true });
  console.log(JSON.stringify({ result: 'fail', message: error.message, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
```

Exit codes: 0 passed clean, 1 the assertion failed, 2 the assertion passed but the console or network reported errors. Treat 2 as a failure in the report.

## Settling

`waitUntil: 'networkidle'` is a reasonable first wait, but apps with polling or websockets never go idle. Then wait for the element the claim is about: `await page.getByRole('heading', { name: 'Notes' }).waitFor()`. Never use `waitForTimeout` as the only wait; a fixed delay passes on a fast machine and fails on a slow one, and a screenshot taken during a skeleton state looks like a rendering bug.

State checks race re-renders the same way. A single `isDisabled()` or `textContent()` right after an action reads whatever was there at that instant. With `@playwright/test` installed, `expect(locator).toBeEnabled()` and `toHaveText()` retry until they pass or time out; with bare `playwright`, wait on a locator that only matches the expected state (`getByRole('button', { name, disabled: false })`, `getByText(expected)`) as the skeleton does.

## Dumping interactive elements

Run this after settling and before writing any action. It prints what the user can act on, in the terms Playwright's locators use.

```js
const dump = await page.evaluate(() =>
  [...document.querySelectorAll('a, button, input, select, textarea, [role], [data-testid]')]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') ?? undefined,
      testId: el.getAttribute('data-testid') ?? undefined,
      label: el.getAttribute('aria-label') ?? el.labels?.[0]?.textContent?.trim() ?? undefined,
      text: el.textContent?.trim().slice(0, 60) || undefined,
      disabled: el.disabled || undefined,
    })),
);
console.error(JSON.stringify(dump, null, 2));
```

For a full picture, `await page.locator('body').ariaSnapshot()` returns the accessibility tree as YAML; it's long, so write it to a file and search it rather than printing it.

## Choosing selectors

In order of preference: `getByRole` with the accessible name, `getByTestId`, `getByLabel` for form fields, `getByText` for static copy, and a CSS selector only when the dump shows nothing better. Take the name from the dump, not from the source, because a component may render different text than its props suggest. If a locator matches more than one element, Playwright throws on action; narrow with `.first()` only when the duplicates are genuinely interchangeable, otherwise scope with `page.getByRole('dialog').getByRole('button', …)`.

## Console and network capture

The listeners in the skeleton catch console errors, uncaught exceptions, failed requests, and 4xx/5xx responses. Subtract the project note's **Known noise** list first. What remains is new unless you can show it on the base branch; don't `git stash` to find out, because a running dev server rebuilds the old code the moment the tree changes and your later checks run against it. If the comparison matters, run the reconnaissance script against a separate worktree of the base branch on another port. Report new errors as failures and errors you can't classify under unverified, with the text.

## Signing in once

Do the sign-in in a setup script and save the session, then reuse it, so every check script doesn't repeat the flow and a rerun doesn't create duplicate sessions:

```js
// .browser-check/auth.mjs: sign in and save storage state
await page.goto(`${url}/login`);
await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL);
await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
await page.context().storageState({ path: '.browser-check/state.json' });
```

Then `browser.newContext({ storageState: '.browser-check/state.json' })` in check scripts. Credentials come from the project note's test account or the seed file, passed as environment variables, never written into the script. If the app uses a magic link or OAuth with no test bypass, report the surface as skipped rather than inventing a workaround.

## Screenshots that show the claim

Take one before the action and one after, full page, at a fixed viewport so runs compare. For a claim about a single element, add `await locator.screenshot({ path })` so the report can show the element without the rest of the page. Read every screenshot you take; a screenshot nobody looks at verifies nothing.

## Running the script

`node .browser-check/save-button.mjs` from the project root, with `APP_URL` set when the app isn't on the default port. Read stdout for the JSON result and stderr for the dump. If `node` can't find `playwright`, the script is outside the project tree or the dependency isn't installed; don't work around it with `NODE_PATH`, which ESM ignores.
