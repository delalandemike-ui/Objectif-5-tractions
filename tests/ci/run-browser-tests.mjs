// Reutilise les bancs DOM existants sous Linux, sans Auth/CDN reel.
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(join(root, path), 'utf8');
const encode = value => Buffer.from(value.replaceAll('\r\n', '\n')).toString('base64');
const index = encode(await read('index.html')), sw = encode(await read('sw.js'));
const fixtures = [
  { name: 'application', file: 'regression.html', expected: 7, sources: {
    index, sw,
    baseline: encode(execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' })),
    baselineSw: encode(execFileSync('git', ['show', 'HEAD:sw.js'], { cwd: root, encoding: 'utf8' }))
  } },
  { name: 'firebase-simule', file: 'firebase-config.html', expected: 7, sources: { index, sw, module: encode(await read('js/firebase-config.js')) } },
  { name: 'auth-simule', file: 'auth.html', expected: 10, sources: { index, sw, module: encode(await read('js/auth.js')) } }
];
const temp = await mkdtemp(join(tmpdir(), 'tractions-ci-'));
await mkdir(join(root, 'test-results'), { recursive: true });
const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  for (const fixture of fixtures) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    // Ne pas permettre aux bancs simules de joindre Firebase ou un autre service HTTP.
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let report;
    try {
      const html = (await read(`tests/${fixture.file}`)).replace('// TEST_SOURCES', `const SOURCES=${JSON.stringify(fixture.sources)};`);
      const file = join(temp, fixture.file);
      await writeFile(file, html);
      await page.goto(pathToFileURL(file).href);
      await page.waitForFunction(() => /ALL PASSED|FAILED/.test(document.getElementById('results')?.textContent || ''), undefined, { timeout: 30000 });
      report = await page.locator('#results').innerText();
      const passes = report.split('\n').filter(line => line.startsWith('PASS ')).length;
      if (!report.endsWith('ALL PASSED') || /^FAIL /m.test(report) || passes !== fixture.expected || errors.length) failed = true;
      report += `\nGroupes attendus : ${fixture.expected}, PASS observes : ${passes}`;
    } catch (error) {
      failed = true;
      report = `FAILED ${error.message}`;
    } finally {
      report += errors.length ? `\nErreurs navigateur : ${errors.join('\n')}` : '';
      await writeFile(join(root, `test-results/${fixture.name}.txt`), report);
      console.log(`\n=== ${fixture.name} ===\n${report}`);
      await context.close();
    }
  }
} finally { await browser.close(); }
if (failed) process.exitCode = 1;
