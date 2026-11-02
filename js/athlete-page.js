import { authClient as auth } from './auth.js';
import { createAthleteStore, emptyProgram, emptySession } from './athlete-store.js';
import { createAthleteData } from './athlete-data.js';
import { accessAction } from './invitations.js';

const $ = id => document.getElementById(id), data = createAthleteData();
let store, user, busy = false, program = [], epoch = 0;
const invitation = new URL(location.href).searchParams;
const invitationId = invitation.get('invitation');
if (invitationId) $('invitation-link').value = location.href;
// Le lien est retiré de l'URL ; il ne remplace jamais les contrôles d'identité.
if (location.search) history.replaceState(null, '', location.pathname);
const message = text => { $('status').textContent = text; };
const currentId = () => $('training').value;
function value(id) { return store?.read().documents[id]?.value || (id === 'program' ? emptyProgram() : emptySession()); }
function renderSession() {
  const id = currentId(), session = value(id), workout = program.find(row => String(row[1]) === id);
  $('completed').checked = session.completed; $('performance').value = session.performance ?? ''; $('comments').value = session.comments || '';
  $('exercises').replaceChildren();
  if (workout) ['Tractions sans aide', 'Tractions avec élastique', 'Descentes lentes', 'Autres exercices', 'Durée'].forEach((label, i) => {
    const line = document.createElement('p'); line.className = 'exercise'; line.textContent = `${label} : ${workout[i + 2]}`; $('exercises').append(line);
  });
}
function render() {
  $('workspace').hidden = !store; $('logout').hidden = !store && !user;
  $('admission').hidden = !user;
  $('identity').textContent = user ? `${user.email} · connecté` : store ? `${store.uid} · suivi local, connexion nécessaire pour synchroniser` : '';
  if (!store) return;
  const state = store.read(), general = value('program');
  $('athlete-score').value = general.score ?? ''; $('athlete-notes').value = general.notes;
  const entries = Object.entries(state.documents);
  $('progress').textContent = `${entries.filter(([id, entry]) => id !== 'program' && entry.value.completed).length}/12 séances réalisées · ${entries.filter(([, entry]) => entry.dirty).length} modification(s) à synchroniser`;
  $('conflicts').replaceChildren();
  for (const [id, entry] of entries.filter(([, entry]) => entry.conflict)) {
    const block = document.createElement('div'), text = document.createElement('p');
    text.textContent = `Conflit ${id === 'program' ? 'du suivi général' : 'séance ' + id}. Local : ${JSON.stringify(entry.value)}. Serveur : ${JSON.stringify(entry.conflict.value)}.`;
    block.append(text);
    for (const [label, local] of [['Garder ma version locale', true], ['Utiliser la version du serveur', false]]) {
      const button = document.createElement('button'); button.textContent = label;
      button.onclick = () => run(async () => { store.resolve(id, local); render(); message('Conflit résolu. Les deux versions restent dans l’export. Synchronisez pour terminer.'); });
      block.append(button);
    }
    $('conflicts').append(block);
  }
  renderSession();
}
async function run(action) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button, input, select, textarea')];
  controls.forEach(control => { control.disabled = true; });
  try { await action(); } catch (error) { message(error.message || 'Opération indisponible. Les données locales sont conservées.'); }
  finally { busy = false; controls.forEach(control => { control.disabled = false; }); }
}
function loadAccounts() {
  $('local-accounts').replaceChildren(new Option('Choisir un suivi local', ''));
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('tractions-athlete-v1:')) $('local-accounts').append(new Option(key.slice(21), key.slice(21)));
  }
}
function open(uid) { const next = createAthleteStore(uid); store = next; epoch++; render(); loadAccounts(); }
async function synchronize() {
  if (!store || user?.uid !== store.uid || !user.emailVerified) throw new Error('Connectez-vous avec l’adresse vérifiée de ce suivi pour synchroniser.');
  if (!navigator.onLine) { message('Hors connexion : vos modifications sont conservées en attente.'); return; }
  const active = store, generation = epoch;
  message('Synchronisation en cours…');
  await active.sync(data);
  if (generation !== epoch) return;
  render();
  const conflicts = Object.values(active.read().documents).some(entry => entry.conflict);
  message(conflicts ? 'Conflit détecté : choisissez la version à conserver. Les deux versions sont préservées.' : 'Synchronisation terminée.');
}
async function connect(action) {
  const connected = await action();
  if (!connected?.emailVerified) throw new Error('Vérifiez votre adresse, puis connectez-vous de nouveau. Vous pouvez renvoyer la vérification.');
  user = connected; open(user.uid); message('Compte connecté. Acceptez votre invitation si nécessaire, puis synchronisez.');
}
$('login').onsubmit = event => { event.preventDefault(); const password = $('password').value; $('password').value = ''; return run(() => connect(() => auth.signInWithPassword($('email').value, password))); };
$('register').onclick = () => { const password = $('password').value; $('password').value = ''; return run(async () => { await auth.register($('email').value, password); message('Compte créé. Vérifiez votre adresse avec l’e-mail Firebase, puis connectez-vous ici avec votre mot de passe. L’admission reste à confirmer par le coach.'); }); };
$('verify').onclick = () => run(async () => { await auth.resendVerification(); message('E-mail de vérification demandé. Vérifiez votre adresse, puis reconnectez-vous.'); });
$('resume').onclick = () => run(async () => { if (user) await auth.signOut(); user = null; open($('local-accounts').value); message('Suivi local ouvert. Enregistrez vos séances hors connexion ; reconnectez-vous pour les transmettre.'); });
$('logout').onclick = () => run(async () => { if (user) await auth.signOut(); user = null; store = null; epoch++; $('email').value = ''; $('password').value = ''; $('workspace').hidden = true; $('conflicts').replaceChildren(); render(); message('Espace fermé. Le suivi reste enregistré sur cet appareil.'); });
$('accept').onclick = () => run(async () => {
  if (!user) throw new Error('Connexion requise.');
  const link = new URL($('invitation-link').value);
  if (link.origin !== location.origin || link.pathname !== location.pathname) throw new Error('Utilisez le lien d’invitation de cette application.');
  await accessAction(user, 'acceptInvitation', { id: link.searchParams.get('invitation'), displayName: $('display-name').value });
  message('Demande envoyée. Le coach doit confirmer votre admission. Ensuite, cliquez sur Synchroniser maintenant.');
});
$('training').onchange = renderSession;
function number(id, max) {
  const raw = $(id).value;
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max) throw new Error('Performance invalide.');
  return value;
}
$('save-program').onclick = () => run(async () => {
  store.edit('program', { schemaVersion: 1, score: number('athlete-score', 30), notes: $('athlete-notes').value }); render(); message('Suivi enregistré sur cet appareil.'); if (user && navigator.onLine) await synchronize();
});
$('save-session').onclick = () => run(async () => {
  const completed = $('completed').checked, old = value(currentId());
  store.edit(currentId(), { completed, completedAt: completed ? old.completedAt || Date.now() : null, performance: number('performance', 10000), comments: $('comments').value }); render(); message('Séance enregistrée sur cet appareil.'); if (user && navigator.onLine) await synchronize();
});
$('sync').onclick = () => run(synchronize);
$('import').onclick = () => run(async () => { store.importLegacy(); render(); message('Import local terminé. L’original tractions-v2 est intact. Synchronisez pour transmettre ce suivi.'); });
$('export').onclick = () => run(async () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(store.read(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `suivi-sportif-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('online', () => { if (store && user && !busy) void run(synchronize); });
window.addEventListener('offline', () => message('Hors connexion : les séances restent enregistrables sur cet appareil.'));
window.addEventListener('storage', event => { if (store && event.key === `tractions-athlete-v1:${store.uid}`) message('Ce suivi a changé dans un autre onglet. Rechargez avant toute modification.'); });
try {
  // Source unique : le programme historique reste intégralement dans index.html.
  const response = await fetch('./index.html');
  if (!response.ok) throw new Error('Programme indisponible.');
  const html = await response.text(), match = html.match(/const S=(\[[\s\S]*?\n\]);/);
  program = JSON.parse(match[1]);
  if (program.length !== 12) throw new Error('Programme incomplet.');
  for (const row of program) $('training').append(new Option(`Semaine ${row[0]} · Séance ${row[1]}`, String(row[1])));
  loadAccounts(); message('Connectez-vous ou reprenez votre suivi local.');
} catch (error) { message('Chargement impossible : ' + error.message); }
render();
if (navigator.serviceWorker?.register) navigator.serviceWorker.register('sw.js').catch(() => {});
