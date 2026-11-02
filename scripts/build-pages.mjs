import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() !== 'developpement-coach') throw new Error('Branche developpement-coach requise.');
const output = join(root, process.env.PAGES_TEST_BUILD === '1' ? '.tools/pages-activation-test' : '_site');
// Liste fermée : aucun serveur, secret, test ou document personnel dans Pages.
const files = [
  'index.html', 'athlete.html', 'coach.html', 'multisport.css', 'sw.js', 'manifest.webmanifest', 'icon.svg',
  'js/auth.js', 'js/firebase-config.js', 'js/invitations.js', 'js/cloud.js',
  'js/athlete-store.js', 'js/athlete-data.js', 'js/athlete-page.js',
  'js/coach-data.js', 'js/coach-page.js', 'js/coach-management.js'
];
// Refus d'un dossier contenant des fichiers étrangers : aucun effacement automatique.
const { readdir } = await import('node:fs/promises');
async function existing(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Lien symbolique interdit dans _site.');
    if (entry.isDirectory()) result.push(...await existing(join(dir, entry.name), name + '/'));
    else result.push(name);
  }
  return result;
}
const allowed = new Set([...files, 'js/multisport-config.js', '.nojekyll']);
for (const name of await existing(output)) if (!allowed.has(name)) throw new Error(`Fichier inattendu dans _site : ${name}. Déplacez-le avant de construire.`);
for (const name of files) {
  const target = join(output, name); await mkdir(dirname(target), { recursive: true }); await copyFile(join(root, name), target);
}
await writeFile(join(output, 'js/multisport-config.js'), `export const multisportConfig = Object.freeze({enabled:true,plan:'spark'});\n`);
await writeFile(join(output, '.nojekyll'), '');
const html = await readFile(join(output, 'index.html'), 'utf8');
const sessions = JSON.parse(html.match(/const S=(\[[\s\S]*?\n\]);/)[1]);
if (sessions.length !== 12) throw new Error('Le programme doit contenir exactement 12 séances.');
console.log(`Prêt : ${output}, multisport actif, 12 séances conservées. Aucun déploiement effectué.`);
