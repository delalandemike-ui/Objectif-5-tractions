import { createAuthClient } from './auth.js';
import { createCoachDataClient } from './coach-data.js';

export function mountCoachPage(doc, { auth = createAuthClient(), data = createCoachDataClient(), onAccess = () => {} } = {}) {
  const $ = id => doc.getElementById('coach-' + id);
  const view = doc.defaultView;
  let user = null, busy = false, stop, unobserve, epoch = 0, disposed = false;
  const message = text => { $('status').textContent = text; };
  function clear() {
    onAccess(null, []);
    $('dashboard').hidden = true; $('athletes').replaceChildren(); $('empty').hidden = true;
    $('role').textContent = 'Statut coach non vérifié.';
  }
  function render() {
    $('login-panel').hidden = !!user; $('account').hidden = !user;
    $('email').disabled = $('password').disabled = $('connect').disabled = busy || !!user;
    $('refresh').disabled = busy || !user; $('disconnect').disabled = busy || !user;
    $('identity').textContent = user ? `${user.email || 'Adresse indisponible'} · ${user.uid}` : '';
  }
  function invalidate() { epoch++; stop?.(); stop = null; clear(); }
  function failure(error) {
    clear();
    if (error?.code === 'permission-denied') message('Accès refusé : ce compte n’est pas le coach désigné et actif, ou son accès a été retiré.');
    else if (error?.code === 'coach/unverified') message('Adresse e-mail non vérifiée. Vérifiez votre adresse puis actualisez votre accès.');
    else if (['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(error?.code)) message('Adresse ou mot de passe incorrect.');
    else if (error?.code === 'auth/too-many-requests') message('Trop de tentatives. Patientez avant de réessayer.');
    else if (error?.code === 'auth/user-disabled') message('Ce compte est désactivé.');
    else message('Connexion impossible ou Firebase indisponible. Vérifiez Internet et réessayez. Vos séances locales sont conservées.');
  }
  async function check() {
    invalidate(); const request = epoch;
    if (!user || disposed) return;
    if (!user.emailVerified) { failure({ code: 'coach/unverified' }); return; }
    if (view?.navigator.onLine === false) { message('Hors connexion : accès coach non vérifié. Vos séances locales restent disponibles.'); return; }
    message('Vérification de votre accès coach…');
    try {
      const release = await data.watch(user, state => {
        if (request !== epoch || disposed) return;
        clear();
        if (!state.authorized) { message(state.loading ? 'Chargement des sportifs autorisés…' : 'Connexion au serveur nécessaire pour confirmer l’accès coach.'); return; }
        $('role').textContent = 'Coach désigné et actif · adresse e-mail vérifiée';
        for (const athlete of state.athletes) {
          const item = doc.createElement('li'); item.textContent = athlete.displayName + ' · ' + athlete.uid;
          $('athletes').appendChild(item);
        }
        $('empty').hidden = state.athletes.length !== 0; $('dashboard').hidden = false;
        onAccess(user, state.athletes);
        message('Accès coach confirmé par le serveur.');
      }, error => { if (request === epoch && !disposed) failure(error); });
      if (request !== epoch || disposed) release(); else stop = release;
    } catch (error) { if (request === epoch && !disposed) failure(error); }
  }
  async function run(action) {
    if (busy || disposed) return;
    busy = true; render();
    try { await action(); } catch (error) { failure(error); }
    finally { busy = false; if (disposed) user = null; render(); }
  }
  $('login').onsubmit = event => {
    event.preventDefault();
    let password = $('password').value; $('password').value = '';
    if (busy || user) { password = ''; return Promise.resolve(); }
    return run(async () => {
      try {
        message('Connexion en cours…');
        const connected = await auth.signInWithPassword($('email').value.trim(), password);
        if (disposed) { await auth.signOut(); return; }
        user = connected;
        if (!unobserve) unobserve = await auth.observe(current => {
          const changed = user?.uid !== current?.uid || user?.emailVerified !== current?.emailVerified;
          user = current;
          if (changed) invalidate();
          render();
          if (!current) message('Session terminée.');
          else if (changed && !busy) void check();
        }, error => { invalidate(); failure(error); });
        if (disposed) { unobserve?.(); await auth.signOut(); return; }
        await check();
      } finally { password = ''; }
    });
  };
  $('refresh').onclick = () => run(async () => { invalidate(); user = await auth.refreshIdentity(); await check(); });
  $('disconnect').onclick = () => run(async () => {
    invalidate(); await auth.signOut(); user = null; $('email').value = ''; $('password').value = '';
    message('Déconnecté. Vos séances locales sont conservées.');
  });
  const offline = () => { invalidate(); message('Hors connexion : accès coach non vérifié. Vos séances locales restent disponibles.'); };
  const focus = () => { if (user && !busy) return check(); };
  view?.addEventListener('offline', offline); view?.addEventListener('online', focus); view?.addEventListener('focus', focus);
  const restore = event => { if (event.persisted) view.location.reload(); };
  const dispose = () => { disposed = true; invalidate(); unobserve?.(); user = null; render(); $('password').value = ''; view?.removeEventListener('offline', offline); view?.removeEventListener('online', focus); view?.removeEventListener('focus', focus); view?.removeEventListener('pagehide', dispose); };
  view?.addEventListener('pageshow', restore);
  view?.addEventListener('pagehide', dispose);
  render(); message('Connectez-vous avec le compte coach existant.');
  return { dispose };
}
