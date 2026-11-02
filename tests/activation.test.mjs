import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
test('Le paquet Spark ne dépend que du client Auth/Firestore et conserve les douze séances', async () => {
  execFileSync(process.execPath, ['scripts/build-pages.mjs'], { cwd: root, env: { ...process.env, PAGES_TEST_BUILD: '1' } });
  const output = resolve(root, '.tools/pages-activation-test');
  assert.equal(await readFile(resolve(output, 'index.html'), 'utf8'), await readFile(resolve(root, 'index.html'), 'utf8'));
  const names = await readdir(resolve(output, 'js'));
  assert.ok(names.includes('invitations.js') && !names.includes('app-check.js'));
  for (const name of names) assert.doesNotMatch(await readFile(resolve(output, 'js', name), 'utf8'), /firebase-functions|httpsCallable|api\.resend\.com/);
  assert.ok(!(await readdir(output)).includes('functions'));
  assert.equal(JSON.parse(await readFile(resolve(root, 'firebase.json'))).functions, undefined);
});
