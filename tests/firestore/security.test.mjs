// Tests du vrai moteur de règles, uniquement avec un projet demo et un émulateur local.
import { readFile } from 'node:fs/promises';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, query, where, documentId, writeBatch, deleteField } from 'firebase/firestore';

const projectId = 'demo-objectif-5-tractions';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw new Error('Tests refusés : FIRESTORE_EMULATOR_HOST doit être 127.0.0.1:8080.');
}
let env;
const stamp = Timestamp.fromMillis(1000);
const program = (revision = 1) => ({ schemaVersion: 1, score: 2, notes: 'Fictif', revision, updatedAt: serverTimestamp() });
const session = (revision = 1) => ({ completed: true, completedAt: null, revision, updatedAt: serverTimestamp() });
const progress = 'athletes/alice/programs/tractions-12-v1';
const sessionIds = Array.from({ length: 12 }, (_, index) => String(index + 1));
const sessionList = (database, ids = sessionIds) => getDocs(query(collection(database, `${progress}/sessions`), where(documentId(), 'in', ids)));
const db = (uid, claims = {}) => env.authenticatedContext(uid, { email_verified: true, ...claims }).firestore();
const read = (database, path = progress) => getDoc(doc(database, path));
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: {
    host: '127.0.0.1', port: 8080,
    rules: await readFile(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8')
  } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    for (const [path, data] of [
      ['settings/access', { coachUid: 'coach', active: true }],
      ['athletes/alice', { enrolled: true, invitedBy: 'coach', acceptedAt: stamp }],
      ['athletes/bob', { enrolled: true, invitedBy: 'coach', acceptedAt: stamp }],
      ['coaches/coach/athletes/alice', { status: 'active', acceptedAt: stamp, invitationId: 'invite-alice' }],
      ['coaches/coach/athletes/bob', { status: 'revoked', acceptedAt: stamp, invitationId: 'invite-bob' }],
      ['users/alice', { displayName: 'Alice fictive', updatedAt: stamp }],
      [progress, { schemaVersion: 1, score: 2, notes: 'Fictif', revision: 1, updatedAt: stamp }],
      ['athletes/bob/programs/tractions-12-v1', { schemaVersion: 1, score: 0, notes: '', revision: 1, updatedAt: stamp }],
      ['invitations/pending', { email: 'fake@example.invalid', status: 'pending' }]
    ]) await setDoc(doc(admin, path), data);
  });
});
after(async () => { if (env) await env.cleanup(); });

test('anonyme : aucun suivi, profil, configuration ou invitation', async () => {
  const anon = env.unauthenticatedContext().firestore();
  for (const path of [progress, 'users/alice', 'settings/access', 'invitations/pending']) await assertFails(read(anon, path));
  await assertFails(setDoc(doc(anon, progress), program(2)));
});
test('sportif non invité : ni données propres, ni auto-admission, ni relation', async () => {
  const stranger = db('stranger');
  await assertFails(read(stranger));
  await assertFails(read(stranger, 'athletes/stranger/programs/tractions-12-v1'));
  await assertFails(setDoc(doc(stranger, 'athletes/stranger/programs/tractions-12-v1'), program()));
  await assertFails(setDoc(doc(stranger, 'athletes/stranger'), { enrolled: true }));
  await assertFails(setDoc(doc(stranger, 'coaches/coach/athletes/stranger'), { status: 'active' }));
});
test('sportif admis : lecture et modification de son seul suivi', async () => {
  const alice = db('alice');
  await assertSucceeds(read(alice));
  await assertSucceeds(setDoc(doc(alice, progress), program(2)));
  await assertFails(read(alice, 'athletes/bob/programs/tractions-12-v1'));
  await assertFails(setDoc(doc(alice, 'athletes/bob/programs/tractions-12-v1'), program(2)));
  await assertFails(deleteDoc(doc(alice, progress)));
});
test('les 12 séances sont valides ; ID hors bornes, type et date refusés', async () => {
  const alice = db('alice');
  for (let id = 1; id <= 12; id++) await assertSucceeds(setDoc(doc(alice, `${progress}/sessions/${id}`), session()));
  await assertSucceeds(sessionList(alice));
  for (const id of ['0', '13', '01', 'role']) await assertFails(setDoc(doc(alice, `${progress}/sessions/${id}`), session()));
  await assertFails(setDoc(doc(alice, `${progress}/sessions/1`), { ...session(2), completed: 'true' }));
  await assertFails(setDoc(doc(alice, `${progress}/sessions/1`), { ...session(2), completedAt: Timestamp.fromMillis(4102444800000) }));
  await assertSucceeds(setDoc(doc(alice, `${progress}/sessions/1`), { ...session(2), completed: false }));
});
test('coach désigné : lecture associée uniquement ; pas de modification des scores', async () => {
  const coach = db('coach');
  await assertSucceeds(read(coach));
  await assertSucceeds(read(coach, 'users/alice'));
  await assertSucceeds(getDocs(collection(coach, 'coaches/coach/athletes')));
  await assertFails(read(coach, 'athletes/bob/programs/tractions-12-v1'));
  await assertFails(setDoc(doc(coach, progress), program(2)));
  await assertFails(setDoc(doc(coach, 'coaches/coach/athletes/bob'), { status: 'active' }));
});
test('courriel non vérifié : refus même pour le bon UID coach ou sportif', async () => {
  await assertFails(read(db('coach', { email_verified: false })));
  await assertFails(read(db('alice', { email_verified: false })));
});
test('élévation de privilèges : profil, configuration, claim coach et invitation refusés', async () => {
  const alice = db('alice');
  await assertFails(setDoc(doc(alice, 'users/alice'), { displayName: 'Alice', role: 'coach', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(alice, 'users/alice'), { coachUid: 'alice' }));
  for (const actor of [alice, db('coach')]) {
    await assertFails(setDoc(doc(actor, 'settings/access'), { coachUid: 'alice', active: true }));
    await assertFails(deleteDoc(doc(actor, 'settings/access')));
    await assertFails(read(actor, 'invitations/pending'));
    await assertFails(updateDoc(doc(actor, 'invitations/pending'), { status: 'accepted' }));
  }
  await assertFails(read(db('fake-coach', { coach: true, role: 'coach' })));
});
test('profils : champs autorisés seulement, pas de liste globale', async () => {
  const alice = db('alice');
  await assertSucceeds(setDoc(doc(alice, 'users/alice'), { displayName: 'Alice', updatedAt: serverTimestamp() }));
  await assertFails(getDocs(collection(alice, 'users')));
  await assertFails(getDocs(collection(db('coach'), 'athletes')));
});
test('schéma, bornes, révision et horodatage serveur contrôlés', async () => {
  const alice = db('alice');
  for (const data of [program(1), { ...program(2), score: 31 }, { ...program(2), score: '2' },
    { ...program(2), notes: 'x'.repeat(20001) }, { ...program(2), role: 'coach' },
    { ...program(2), updatedAt: stamp }]) await assertFails(setDoc(doc(alice, progress), data));
  await assertSucceeds(setDoc(doc(alice, progress), { ...program(2), score: null }));
});
test('coach désactivé ou configuration absente : refus ; propriétaire conserve son suivi', async () => {
  await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'settings/access'), { active: false }));
  await assertFails(read(db('coach')));
  await assertSucceeds(read(db('alice')));
  await env.withSecurityRulesDisabled(async c => deleteDoc(doc(c.firestore(), 'settings/access')));
  await assertFails(read(db('coach')));
  await assertSucceeds(read(db('alice')));
});
test('révocation relation : coach refusé, sportif propriétaire conserve son accès', async () => {
  await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'coaches/coach/athletes/alice'), { status: 'revoked' }));
  await assertFails(read(db('coach')));
  await assertSucceeds(read(db('alice')));
});
test('chemins inconnus, imports et faux programmes fermés', async () => {
  for (const actor of [db('alice'), db('coach')]) {
    for (const path of ['other/anything', 'athletes/alice/imports/legacy', 'athletes/alice/programs/autre']) {
      await assertFails(read(actor, path));
      await assertFails(setDoc(doc(actor, path), { role: 'coach' }));
    }
  }
});

test('configuration coach mal formée : refus explicite, propriétaire indépendant', async () => {
  for (const config of [{}, { coachUid: 'coach' }, { active: true }, { coachUid: 'coach', active: 'true' }, { coachUid: ['coach'], active: true }, { coachUid: '', active: true }]) {
    await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'settings/access'), config));
    await assertFails(read(db('coach')));
    await assertSucceeds(read(db('alice')));
  }
});
test('admission absente, fausse ou incomplète : ni propriétaire ni accès coach', async () => {
  for (const admission of [null, {}, { enrolled: false }, { enrolled: 'true' }]) {
    await env.withSecurityRulesDisabled(async c => {
      const ref = doc(c.firestore(), 'athletes/alice');
      if (admission === null) await deleteDoc(ref); else await setDoc(ref, admission);
    });
    await assertFails(read(db('alice')));
    await assertFails(read(db('coach')));
    await assertFails(read(db('alice'), 'coaches/coach/athletes/alice'));
  }
});
test('relation absente ou statut incomplet : propriétaire admis seulement', async () => {
  for (const relation of [null, {}, { status: 'revoked' }, { status: true }]) {
    await env.withSecurityRulesDisabled(async c => {
      const ref = doc(c.firestore(), 'coaches/coach/athletes/alice');
      if (relation === null) await deleteDoc(ref); else await setDoc(ref, relation);
    });
    await assertFails(read(db('coach')));
    await assertSucceeds(read(db('alice')));
  }
});
test('confidentialité des relations : pas de coach tiers, non-admis ou liste sportive', async () => {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'coaches/other/athletes/alice'), { status: 'active', invitationId: 'other-private' });
    await setDoc(doc(c.firestore(), 'coaches/coach/athletes/stranger'), { status: 'pending' });
  });
  await assertSucceeds(read(db('alice'), 'coaches/coach/athletes/alice'));
  await assertSucceeds(read(db('bob'), 'coaches/coach/athletes/bob'));
  for (const actor of [db('alice'), db('coach'), db('other')]) await assertFails(read(actor, 'coaches/other/athletes/alice'));
  await assertFails(read(db('stranger'), 'coaches/coach/athletes/stranger'));
  await assertFails(read(db('alice'), 'coaches/coach/athletes/bob'));
  await assertFails(getDocs(collection(db('alice'), 'coaches/coach/athletes')));
});
test('remplacement du coach : aucune ancienne relation transférée implicitement', async () => {
  await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'settings/access'), { coachUid: 'new-coach' }));
  await assertFails(read(db('coach')));
  await assertFails(read(db('new-coach')));
  await assertFails(read(db('alice'), 'coaches/coach/athletes/alice'));
  await assertSucceeds(read(db('alice')));
});
test('séances : même périmètre pour get et listes filtrées, y compris données Admin hors schéma', async () => {
  await env.withSecurityRulesDisabled(async c => {
    for (const id of ['1', '13', 'secret']) await setDoc(doc(c.firestore(), `${progress}/sessions/${id}`), { completed: true, revision: 1, completedAt: null, updatedAt: stamp });
  });
  for (const actor of [db('alice'), db('coach')]) {
    await assertSucceeds(read(actor, `${progress}/sessions/1`));
    await assertSucceeds(sessionList(actor));
    await assertFails(getDocs(collection(actor, `${progress}/sessions`)));
    await assertFails(sessionList(actor, ['1', '13']));
    for (const id of ['13', 'secret', '0']) await assertFails(read(actor, `${progress}/sessions/${id}`));
  }
  await assertFails(sessionList(db('bob')));
});
test('profils : création, modification partielle, bornes et suppressions de champs', async () => {
  const alice = db('alice');
  await env.withSecurityRulesDisabled(async c => deleteDoc(doc(c.firestore(), 'users/alice')));
  await assertSucceeds(setDoc(doc(alice, 'users/alice'), { displayName: 'A'.repeat(100), updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(alice, 'users/alice'), { displayName: 'Alice', updatedAt: serverTimestamp() }));
  for (const data of [{ displayName: 'A'.repeat(101), updatedAt: serverTimestamp() }, { displayName: 1, updatedAt: serverTimestamp() }, { displayName: 'Alice' }]) {
    await assertFails(setDoc(doc(alice, 'users/alice'), data));
  }
  await assertFails(updateDoc(doc(alice, 'users/alice'), { displayName: deleteField(), updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(alice, 'users/alice')));
  await assertFails(setDoc(doc(db('coach'), 'users/alice'), { displayName: 'Modifié', updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db('coach'), 'users/coach'), { displayName: 'Coach', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db('stranger'), 'users/stranger'), { displayName: 'Stranger', updatedAt: serverTimestamp() }));
});
test('création de suivi et révision : première version 1 puis incrément exact', async () => {
  const bob = db('bob'), path = 'athletes/bob/programs/tractions-12-v1';
  await env.withSecurityRulesDisabled(async c => deleteDoc(doc(c.firestore(), path)));
  await assertFails(setDoc(doc(bob, path), program(2)));
  await assertSucceeds(setDoc(doc(bob, path), program()));
  for (const revision of [0, 1, 3, 1.5, '2']) await assertFails(setDoc(doc(bob, path), program(revision)));
  await assertSucceeds(setDoc(doc(bob, path), program(2)));
});
test('révisions concurrentes : une seule écriture de même révision acceptée', async () => {
  const outcomes = await Promise.allSettled([setDoc(doc(db('alice'), progress), program(2)), setDoc(doc(db('alice'), progress), program(2))]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(r => r.status === 'rejected').length, 1);
});
test('ancienne révision invalide et horodatage futur : réparation administrative requise', async () => {
  const alice = db('alice');
  for (const corrupt of [{ revision: 0, updatedAt: stamp }, { updatedAt: stamp }, { revision: 1, updatedAt: 'bad' }, { revision: 1, updatedAt: Timestamp.fromMillis(4102444800000) }]) {
    await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), progress), { schemaVersion: 1, score: 0, notes: '', ...corrupt }));
    await assertFails(setDoc(doc(alice, progress), program(corrupt.revision === 0 ? 1 : 2)));
  }
});
test('privilèges : pas de contournement par batch ni par claim email absent', async () => {
  const stranger = db('stranger'), batch = writeBatch(stranger);
  batch.set(doc(stranger, 'athletes/stranger'), { enrolled: true });
  batch.set(doc(stranger, 'athletes/stranger/programs/tractions-12-v1'), program());
  await assertFails(batch.commit());
  await assertFails(read(env.authenticatedContext('alice', {}).firestore()));
  await assertFails(getDocs(collection(db('coach'), 'users')));
  await assertFails(read(db('alice'), 'settings/access'));
});
test('chemins imbriqués inconnus : aucun héritage de permission', async () => {
  for (const actor of [db('alice'), db('coach')]) {
    for (const path of [`${progress}/sessions/1/private/secret`, 'users/alice/private/secret', 'settings/access/private/secret', 'coaches/coach/athletes/alice/private/secret']) {
      await assertFails(read(actor, path));
      await assertFails(setDoc(doc(actor, path), { value: true }));
    }
  }
});
