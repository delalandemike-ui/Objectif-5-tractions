import { athleteAuth as auth, selectAthlete, rememberAthlete, checkAdmission, bounded, athleteError } from './athlete-session.js';
import { accessAction } from './invitations.js';

export function mountAthleteAccount(doc, {
  authentication = auth, access = accessAction, admission = checkAdmission,
  select = selectAthlete, remember = rememberAthlete,
  navigate = url => doc.defaultView.location.assign(url), storage = localStorage
} = {}) {
  const $ = id => doc.getElementById(id), view = doc.defaultView, page = new URL(view.location.href);
  let invitationId = page.searchParams.get('invitation') || '', signup = !!invitationId;
  const manage = page.searchParams.get('manage') === '1';
  let user = null, busy = false, disposed = false, release, timer, version = 0;
  const message = text => { $('status').textContent = text; };
  const hint = new URLSearchParams(page.hash.slice(1)).get('email');
  if (hint && hint.length <= 254) $('email').value = hint;
  if (page.search || page.hash) view.history.replaceState(null, '', page.pathname);
  function render() {
    $('account-title').textContent = signup && !user ? 'Créer mon compte' : 'Mon compte sportif';
    $('credentials').hidden = !!user; $('account-state').hidden = !user;
    $('identity').textContent = user ? `${user.displayName || 'Mon compte'} · ${user.email}` : '';
    $('pseudo-label').hidden = !signup; $('display-name').required = signup;
    $('password').autocomplete = signup ? 'new-password' : 'current-password';
    $('submit').textContent = signup ? 'Créer mon compte' : 'Se connecter';
    $('mode-toggle').textContent = signup ? 'J’ai déjà un compte' : 'Créer mon compte avec mon invitation';
    doc.querySelectorAll('button, input').forEach(control => { control.disabled = busy; });
  }
  function draftKey() { return `tractions-registration-v1:${user?.email?.toLowerCase() || $('email').value.trim().toLowerCase()}`; }
  function draft() { try { return JSON.parse(storage.getItem(draftKey())) || {}; } catch { return {}; } }
  function schedule() {
    clearTimeout(timer);
    if (!disposed && user && !doc.hidden) timer = setTimeout(() => void run(() => advance(true)), user.emailVerified ? 30000 : 12000);
  }
  async function run(action) {
    if (busy || disposed) return;
    busy = true; $('retry').hidden = true; render();
    try { await action(); }
    catch (error) { if (!disposed) { message(athleteError(error)); $('retry').hidden = !user; } }
    finally { busy = false; if (!disposed) { render(); schedule(); } }
  }
  async function advance(refresh = false) {
    const request = version;
    if (refresh) user = await bounded(() => authentication.refreshIdentity());
    if (!user || disposed || request !== version) return;
    $('open-program').hidden = true;
    if (!user.emailVerified) {
      $('resend').hidden = false;
      message('Inscription enregistrée. Confirmez votre adresse grâce à l’e-mail reçu ; votre demande sera ensuite transmise automatiquement au coach.');
      $('admission-status').textContent = 'Vérification de votre adresse en attente.';
      return;
    }
    $('resend').hidden = true;
    remember(user, storage); select(user.uid);
    try {
      await admission(user);
      if (disposed || request !== version) return;
      $('admission-status').textContent = 'Votre inscription est validée.';
      $('open-program').hidden = false; message('Bienvenue ! Votre programme est prêt.');
      if (!manage) navigate(new URL('index.html', doc.baseURI).href);
      return;
    } catch (error) {
      if (!['athlete/not-admitted', 'athlete/revoked', 'permission-denied', 'firestore/permission-denied'].includes(error?.code)) throw error;
    }
    if (disposed || request !== version) return;
    const saved = draft(); invitationId ||= saved.id || '';
    let invitations;
    if (invitationId) invitations = [await access(user, 'getInvitation', { id: invitationId })];
    else invitations = (await access(user, 'myInvitations')).invitations;
    if (disposed || request !== version) return;
    invitations = invitations.filter(row => row.email?.toLowerCase() === user.email.toLowerCase());
    const requested = invitations.find(row => row.status === 'requested' && row.athleteUid === user.uid && row.expiresAt.toMillis() > Date.now());
    const pending = invitations.filter(row => row.status === 'pending' && row.expiresAt.toMillis() > Date.now()).sort((a,b) => b.expiresAt.toMillis() - a.expiresAt.toMillis())[0];
    if (requested || pending) {
      if (!requested) await access(user, 'acceptInvitation', { id: pending.id, displayName: user.displayName || saved.displayName || 'Sportif' });
      if (disposed || request !== version) return;
      $('admission-status').textContent = 'En attente de validation du coach.';
      message('Inscription enregistrée — en attente de validation du coach');
    } else if (invitations.some(row => row.status === 'accepted')) {
      $('admission-status').textContent = 'Accès suspendu.'; message('Votre accès a été révoqué. Contactez votre coach.');
    } else if (invitations.some(row => row.status === 'cancelled')) {
      $('admission-status').textContent = 'Demande refusée ou invitation annulée.'; message('Votre demande n’a pas été acceptée. Contactez votre coach.');
    } else {
      $('admission-status').textContent = 'Aucune invitation active.'; message('Cette invitation est expirée ou ne correspond pas à votre adresse. Contactez votre coach.');
    }
  }
  $('mode-toggle').onclick = event => { event.preventDefault(); if (!busy) { signup = !signup; render(); } };
  $('login').onsubmit = event => {
    event.preventDefault();
    if (busy) return;
    let password = $('password').value; $('password').value = '';
    return run(async () => {
      try {
        const email = $('email').value.trim(), displayName = $('display-name').value.trim();
        if (signup) {
          if (!displayName) throw new Error('Choisissez votre pseudo.');
          storage.setItem(draftKey(), JSON.stringify({ id: invitationId, displayName }));
          user = await bounded(() => authentication.register(email, password, { displayName, invitationId }));
        } else user = await bounded(() => authentication.signInWithPassword(email, password));
        await advance();
      } finally { password = ''; }
    });
  };
  $('resend').onclick = () => run(async () => { await bounded(() => authentication.resendVerification()); message('E-mail renvoyé. Cliquez sur le lien reçu pour confirmer votre adresse.'); });
  $('retry').onclick = () => run(() => advance(true));
  $('logout').onclick = () => run(async () => {
    version++; clearTimeout(timer); await bounded(() => authentication.signOut()); select(null); user = null;
    $('password').value = ''; message('Vous êtes déconnecté. Vos résultats sont conservés sur cet appareil.');
  });
  const focus = () => { if (user && !busy && view.navigator.onLine) void run(() => advance(true)); };
  view.addEventListener('focus', focus); view.addEventListener('online', focus);
  const visibility = () => { if (doc.hidden) clearTimeout(timer); else focus(); };
  doc.addEventListener('visibilitychange', visibility);
  render(); message('Connectez-vous ou créez votre compte à partir de l’invitation de votre coach.');
  if (view.navigator.onLine) {
    authentication.observe(current => {
      if (disposed) return;
      if (user?.uid !== current?.uid) version++;
      user = current; render();
      if (current && !busy) void run(() => advance());
    }, error => { if (!disposed) message(athleteError(error)); }).then(stop => { if (disposed) stop(); else release = stop; }).catch(error => { if (!disposed) message(athleteError(error)); });
  } else message('Hors connexion. Revenez au programme pour retrouver vos séances sur cet appareil.');
  const dispose = () => { disposed = true; version++; clearTimeout(timer); release?.(); $('password').value = ''; view.removeEventListener('focus', focus); view.removeEventListener('online', focus); doc.removeEventListener('visibilitychange', visibility); };
  view.addEventListener('pageshow', event => { if (event.persisted) view.location.reload(); });
  view.addEventListener('pagehide', dispose, { once: true });
  return { dispose, refresh: () => run(() => advance(true)) };
}
if (typeof document !== 'undefined' && document.getElementById('login')) mountAthleteAccount(document);
