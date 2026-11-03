import { athleteAuth as auth, selectedAthlete, selectAthlete, athleteLabel, checkAdmission, bounded, athleteError } from './athlete-session.js';
import { createAthleteStore, emptyProgram, emptySession } from './athlete-store.js';
import { createAthleteData } from './athlete-data.js';
import { mountMessages } from './messages.js';

export function mountProgramAccount(doc, bridge, {
  authentication = auth, remote = createAthleteData(), admission = checkAdmission,
  selection = { read: selectedAthlete, write: selectAthlete }, storage = localStorage, messaging = mountMessages
} = {}) {
  const $ = id => doc.getElementById('account-' + id), view = doc.defaultView;
  let store = null, user = null, epoch = 0, syncing = false, observing = false, unsubscribe, timer, controller, disposed = false, unsaved = null;
  let sessionUser = null;
  let stopMessages = () => {}, threadUid = null, lastCheck = 0;
  function clearMessages() { stopMessages(); stopMessages = () => {}; threadUid = null; }
  const message = text => { $('status').textContent = text; };
  function refreshAccounts() {
    const selected = $('local').value, placeholder = doc.createElement('option');
    placeholder.value = ''; placeholder.textContent = 'Choisir un suivi sur cet appareil';
    $('local').replaceChildren(placeholder);
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith('tractions-athlete-v1:')) {
          const option = doc.createElement('option'); option.value = key.slice(21); option.textContent = athleteLabel(option.value, storage); $('local').append(option);
        }
      }
    } catch { /* Le programme reste utilisable si l'énumération du stockage est bloquée. */ }
    $('local').value = selected;
  }
  function model() {
    const rows = store.read().documents, general = rows.program?.value || emptyProgram();
    const value = { done: [], score: general.score === null ? '' : String(general.score), notes: general.notes, sessions: {} };
    for (let id = 1; id <= 12; id++) {
      const session = rows[id]?.value || emptySession();
      if (session.completed) value.done.push(id);
      value.sessions[id] = { performance: session.performance ?? null, comments: session.comments || '' };
    }
    return value;
  }
  function tools() {
    refreshAccounts();
    $('tools').hidden = !store;
    $('sync').disabled = syncing || !store || !user;
    $('import').disabled = syncing || !store;
    $('identity').textContent = store ? `${user?.email || athleteLabel(store.uid, storage)} · ${user ? 'connecté' : 'disponible sur cet appareil'}` : 'Suivi personnel sur cet appareil.';
    if (!store) return;
    const rows = store.read().documents;
    $('conflicts').replaceChildren();
    for (const [id, entry] of Object.entries(rows).filter(([, entry]) => entry.conflict)) {
      const block = doc.createElement('div'), text = doc.createElement('p');
      const summary = value => !value ? 'Aucun résultat' : id === 'program'
        ? `meilleur score ${value.score ?? 'non renseigné'} ; notes : ${value.notes || 'aucune'}`
        : `${value.completed ? 'séance réalisée' : 'séance à faire'} ; tractions : ${value.performance ?? 'non renseignées'} ; commentaire : ${value.comments || 'aucun'}`;
      text.textContent = `Deux versions ${id === 'program' ? 'du suivi général' : 'de la séance ' + id}. Sur cet appareil : ${summary(entry.value)}. Dernier suivi partagé : ${summary(entry.conflict.value)}.`;
      block.append(text);
      for (const [label, local] of [['Garder ma version locale', true], ['Utiliser la version du serveur', false]]) {
        const button = doc.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = syncing;
        button.onclick = () => {
          try { store.resolve(id, local); bridge.update(model()); tools(); message('Conflit résolu ; les deux versions restent dans l’export. Synchronisez pour terminer.'); }
          catch (error) { message(athleteError(error)); }
        };
        block.append(button);
      }
      $('conflicts').append(block);
    }
  }
  function pendingMessage() {
    const count = Object.values(store.read().documents).filter(row => row.dirty).length;
    message(`${count} modification(s) à synchroniser. ${view.navigator.onLine ? '' : 'Hors connexion : résultats conservés sur cet appareil.'}`);
  }
  function stopWork() {
    epoch++; controller?.abort(); controller = null; clearTimeout(timer); syncing = false;
  }
  function exportAccount() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...store.read(), displayedData: unsaved }, null, 2)], { type: 'application/json' }));
    const link = doc.createElement('a'); link.href = url; link.download = `suivi-sportif-${Date.now()}.json`;
    doc.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function save(value) {
    try {
      const score = value.score === '' ? null : Number(value.score);
      if (score !== null && (!Number.isInteger(score) || score < 0 || score > 30)) throw new Error('Le meilleur score doit être un entier entre 0 et 30.');
      if (value.notes.length > 20000) throw new Error('Les notes sont limitées à 20000 caractères.');
      const rows = store.read().documents, changes = {};
      const general = { schemaVersion: 1, score, notes: value.notes };
      const previousGeneral = rows.program?.value || emptyProgram();
      if (Object.keys(general).some(key => general[key] !== previousGeneral[key])) changes.program = general;
      for (let id = 1; id <= 12; id++) {
        const old = { ...emptySession(), ...rows[id]?.value }, completed = value.done.includes(id), details = value.sessions?.[id];
        const next = { ...old, completed, completedAt: completed ? old.completedAt || Date.now() : null, performance: details?.performance ?? null, comments: details?.comments || '' };
        // Un ancien import peut avoir une séance réalisée sans date : ne pas la dater sans modification.
        if (completed === old.completed) next.completedAt = old.completedAt;
        if (JSON.stringify(next) !== JSON.stringify(old)) changes[id] = next;
      }
      if (Object.keys(changes).length) store.editMany(changes);
      refreshAccounts();
      unsaved = null; bridge.message('Résultats enregistrés dans le suivi de ce compte sur cet appareil.'); pendingMessage();
      clearTimeout(timer);
      if (user && view.navigator.onLine) timer = setTimeout(() => void synchronize(), 800);
      return true;
    } catch (error) {
      unsaved = structuredClone(value);
      bridge.message(athleteError(error) + ' Les dernières saisies restent affichées ; exportez-les avant de recharger.');
      return false;
    }
  }
  function open(uid) {
    const next = createAthleteStore(uid, storage);
    selection.write(uid); stopWork(); clearMessages(); store = next; unsaved = null;
    user = sessionUser?.uid === uid ? sessionUser : null;
    bridge.useAccount({ save, export: exportAccount }, model()); tools(); pendingMessage();
    $('admission').textContent = 'Admission à vérifier en ligne. Le suivi local ne prouve pas une autorisation Firebase.';
  }
  async function synchronize() {
    if (syncing || disposed || !store) return;
    if (!user || user.uid !== store.uid || !user.emailVerified) { message('Connectez-vous avec le compte vérifié de ce suivi pour synchroniser.'); return; }
    if (!view.navigator.onLine) { pendingMessage(); return; }
    if (unsaved) { message('Corrigez ou exportez les dernières saisies non enregistrées avant de synchroniser.'); return; }
    const current = epoch, active = store, identity = user, abort = new AbortController();
    let completed = false;
    controller = abort; syncing = true; tools(); message('Vérification de l’admission et synchronisation…');
    try {
      await bounded(async () => {
        await admission(identity);
        if (abort.signal.aborted || current !== epoch) return;
        $('admission').textContent = 'Admission confirmée par le serveur.';
        await active.sync(remote, { signal: abort.signal });
      });
      if (current !== epoch || disposed) return;
      if (!unsaved) bridge.update(model());
      lastCheck = Date.now();
      const conversation = doc.getElementById('athlete-messages');
      if (conversation && threadUid !== identity.uid) { clearMessages(); threadUid = identity.uid; stopMessages = messaging(conversation, { user: identity, uid: identity.uid }); }
      const rows = Object.values(active.read().documents);
      completed = true;
      message(rows.some(row => row.conflict) ? 'Conflit détecté : choisissez la version à conserver. Les deux versions sont préservées.' : rows.some(row => row.dirty) ? 'Nouvelles modifications locales en attente. Synchronisez de nouveau.' : 'Synchronisation terminée. Résultats disponibles pour votre coach.');
    } catch (error) {
      if (current === epoch && !disposed) {
        $('admission').textContent = 'Admission non confirmée pour cette synchronisation.';
        if (['permission-denied', 'firestore/permission-denied', 'athlete/not-admitted', 'athlete/revoked'].includes(error?.code)) clearMessages();
        if (!unsaved) bridge.update(model());
        message(athleteError(error));
      }
    } finally {
      abort.abort();
      if (current === epoch && !disposed) {
        syncing = false; controller = null; tools();
        const rows = Object.values(active.read().documents);
        if (completed && !unsaved && user && view.navigator.onLine && rows.some(row => row.dirty) && !rows.some(row => row.conflict)) {
          clearTimeout(timer); timer = setTimeout(() => void synchronize(), 800);
        }
      }
    }
  }
  async function observe() {
    if (observing || disposed) return;
    observing = true;
    try {
      const release = await authentication.observe(current => {
        if (disposed) return;
        stopWork(); sessionUser = current;
        if (current && current.uid !== store?.uid && selection.read()?.uid === current.uid) open(current.uid);
        user = current?.uid === store?.uid ? current : null; if (!user) clearMessages(); tools();
        if (user && store) void synchronize();
        else if (store) message('Suivi local ouvert. Connectez-vous à ce compte pour synchroniser.');
      }, error => { stopWork(); clearMessages(); sessionUser = user = null; tools(); message(athleteError(error)); });
      if (disposed) release(); else unsubscribe = release;
    } catch (error) { observing = false; message(athleteError(error)); }
  }
  $('sync').onclick = () => synchronize();
  $('import').onclick = () => {
    if (!store || syncing || !view.confirm('Copier le suivi historique dans ce compte ? L’original est conservé. Ce compte doit avoir un suivi local vide ; les données distantes différentes créeront des conflits.')) return;
    try { store.importLegacy(); bridge.update(model()); refreshAccounts(); tools(); pendingMessage(); }
    catch (error) { message(athleteError(error)); }
  };
  $('close').onclick = async () => {
    stopWork();
    try {
      if (sessionUser) await bounded(() => authentication.signOut());
      selection.write(null); clearMessages(); sessionUser = user = null; store = null; unsaved = null;
      bridge.useLegacy(); tools(); $('admission').textContent = 'Connexion facultative pour partager vos résultats avec votre coach.';
      message('Compte fermé. Ses résultats restent conservés séparément sur cet appareil.');
    } catch (error) { tools(); message(athleteError(error)); }
  };
  $('resume').onclick = () => {
    try { if ($('local').value) { open($('local').value); if (view.navigator.onLine) void observe(); } }
    catch (error) { message(athleteError(error)); }
  };
  const online = () => { if (store) { if (observing && user) void synchronize(); else void observe(); } };
  const offline = () => { stopWork(); tools(); if (store) { $('admission').textContent = 'Hors connexion : admission non vérifiable. Synchronisation suspendue.'; pendingMessage(); } };
  const changed = event => {
    if (event.key === 'tractions-active-athlete-v1') {
      stopWork(); clearMessages();
      try {
        const selected = selection.read();
        if (selected) { open(selected.uid); if (view.navigator.onLine) { if (user) void synchronize(); else void observe(); } }
        else { store = null; user = null; unsaved = null; bridge.useLegacy(); tools(); message('Compte déconnecté dans un autre onglet. Vos résultats sont conservés.'); }
      } catch (error) { user = null; tools(); message(athleteError(error)); }
    }
    if (store && event.key === `tractions-athlete-v1:${store.uid}`) { stopWork(); tools(); message('Suivi modifié dans un autre onglet. Rechargez avant de continuer.'); }
  };
  view.addEventListener('online', online); view.addEventListener('offline', offline); view.addEventListener('storage', changed);
  const focus = () => { if (store && user && view.navigator.onLine && Date.now() - lastCheck > 30000) void synchronize(); };
  view.addEventListener('focus', focus);
  try {
    refreshAccounts();
    const selected = selection.read();
    if (selected) { open(selected.uid); if (view.navigator.onLine) void observe(); }
  } catch (error) { message(athleteError(error)); }
  const dispose = () => { disposed = true; stopWork(); clearMessages(); unsubscribe?.(); view.removeEventListener('focus', focus); view.removeEventListener('online', online); view.removeEventListener('offline', offline); view.removeEventListener('storage', changed); };
  view.addEventListener('pagehide', dispose, { once: true });
  view.addEventListener('pageshow', event => { if (event.persisted) view.location.reload(); });
  return { dispose, synchronize };
}

if (typeof document !== 'undefined' && window.trainingProgram) mountProgramAccount(document, window.trainingProgram);
