// Outil local d'essai, indépendant de js/auth.js et du site.
const MESSAGES = {
  'auth/invalid-credential': 'Adresse ou mot de passe incorrect. Vérifiez votre saisie.',
  'auth/wrong-password': 'Adresse ou mot de passe incorrect. Vérifiez votre saisie.',
  'auth/user-not-found': 'Adresse ou mot de passe incorrect. Vérifiez votre saisie.',
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/user-disabled': 'Ce compte est désactivé.',
  'auth/network-request-failed': 'Réseau interrompu. Vérifiez la session ; un envoi peut avoir abouti. Aucun renvoi automatique.',
  'auth/too-many-requests': 'Firebase limite les tentatives. Patientez avant toute nouvelle demande.',
  'auth/requires-recent-login': 'Reconnectez-vous avant de réessayer.',
  'auth/operation-not-allowed': 'La connexion par mot de passe n’est pas disponible pour ce projet.',
  'auth/unauthorized-domain': 'Cette origine n’est pas autorisée par Firebase.',
  'auth/already-initialized': 'Auth utilise déjà d’autres options. Ouvrez un contexte local isolé.'
};
async function loadVerificationSdk() {
  const config = await import('../js/firebase-config.js');
  let timer;
  let sdk;
  try {
    sdk = await Promise.race([
      import(`https://www.gstatic.com/firebasejs/${config.FIREBASE_SDK_VERSION}/firebase-auth.js`),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('SDK unavailable')), 12000); })
    ]);
  } finally { clearTimeout(timer); }
  const app = await config.initializeFirebase();
  const auth = sdk.initializeAuth(app, { persistence: sdk.inMemoryPersistence });
  auth.languageCode = 'fr';
  return { sdk, auth };
}

export function mountVerificationPage(doc, { load = loadVerificationSdk, clock = Date.now, origin = globalThis.location } = {}) {
  const $ = id => doc.getElementById(id);
  if (!origin || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || !['http:', 'https:'].includes(origin.protocol)) {
    $('status').textContent = 'Page désactivée hors HTTP local.';
    return;
  }
  let context, busy = false, nextSend = 0, attempted = false;
  const cooldown = 120000;
  function user() { return context?.auth.currentUser || null; }
  function message(text) { $('status').textContent = text; }
  function render() {
    const current = user();
    $('email').disabled = busy || !!current;
    $('password').disabled = busy || !!current;
    $('connect').disabled = busy || !!current;
    $('confirm').disabled = busy || !current || current.emailVerified;
    $('send').disabled = busy || !current || current.emailVerified || !$('confirm').checked || clock() < nextSend;
    $('refresh').disabled = busy || !current;
    $('disconnect').disabled = busy || !current;
    $('identity').textContent = current ? `Compte connecté : ${current.email || 'adresse indisponible'}` : 'Aucune session.';
    $('verified').textContent = current ? (current.emailVerified ? 'Adresse vérifiée.' : 'Adresse non vérifiée.') : 'État non consulté.';
  }
  async function run(action) {
    if (busy) return;
    busy = true; render();
    try { await action(); }
    catch (error) { message(Object.hasOwn(MESSAGES, error?.code) ? MESSAGES[error.code] : 'L’opération a échoué. Vérifiez le réseau et la configuration, puis réessayez volontairement.'); }
    finally { busy = false; render(); }
  }
  $('login').onsubmit = event => {
    event.preventDefault();
    let password = $('password').value;
    $('password').value = '';
    if (busy || user()) { password = ''; return Promise.resolve(); }
    const email = $('email').value.trim();
    return run(async () => {
      try {
        if (!email || !password) { message('Saisissez votre adresse et votre mot de passe.'); return; }
        context ||= await load();
        await context.sdk.signInWithEmailAndPassword(context.auth, email, password);
        message('Connexion établie. Aucun e-mail envoyé. Vérifiez l’adresse affichée.');
      } finally { password = ''; }
    });
  };
  $('confirm').onchange = render;
  $('send').onclick = () => {
    if (busy || !user() || user().emailVerified || !$('confirm').checked) return Promise.resolve();
    if (clock() < nextSend) { message('Attendez deux minutes après la dernière tentative avant tout nouvel envoi.'); return Promise.resolve(); }
    return run(async () => {
      // Début de tentative, même en cas de réponse perdue : pas de répétition immédiate.
      nextSend = clock() + cooldown;
      attempted = true;
      $('confirm').checked = false;
      await context.sdk.sendEmailVerification(user());
      message('Demande envoyée à Firebase. Consultez votre boîte et les indésirables, puis ouvrez le lien reçu. Aucun nouvel envoi automatique.');
    });
  };
  $('refresh').onclick = () => run(async () => {
    if (!user()) return;
    await context.sdk.reload(user());
    if (user()?.emailVerified) {
      // Actualise aussi le claim email_verified pour une utilisation ultérieure.
      await context.sdk.getIdToken(user(), true);
      message('Adresse vérifiée et jeton actualisé. Aucun rôle coach attribué.');
    } else message('Adresse pas encore vérifiée. Ouvrez le lien reçu puis actualisez à nouveau.');
  });
  $('disconnect').onclick = () => run(async () => {
    if (context) await context.sdk.signOut(context.auth);
    $('password').value = ''; $('email').value = ''; $('confirm').checked = false;
    message('Déconnecté. Aucun résultat local modifié.');
  });
  // Retourner sur la page permet de réactiver le bouton après le délai, sans polling réseau.
  const update = () => { render(); };
  doc.defaultView?.addEventListener('focus', update);
  $('confirm').onchange = () => { render(); if (attempted && clock() < nextSend) message('Attendez deux minutes après la dernière tentative.'); };
  render();
  return { refreshView: render, dispose() { doc.defaultView?.removeEventListener('focus', update); $('password').value = ''; } };
}
