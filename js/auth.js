// Préparation indépendante : aucun import ou appel depuis l'application actuelle.
export const AUTH_RETURN_URL = "https://delalandemike-ui.github.io/Objectif-5-tractions/";

export class AuthPreparationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuthPreparationError";
    this.code = code;
  }
}

const MESSAGES = Object.freeze({
  "auth/expired-action-code": "Le lien a expiré. Demandez volontairement un nouveau lien.",
  "auth/invalid-action-code": "Le lien est invalide ou déjà utilisé. Demandez un nouveau lien.",
  "auth/invalid-email": "Saisissez une adresse e-mail valide.",
  "auth/invalid-credential": "Le lien ou l'adresse ne permet pas cette connexion.",
  "auth/user-disabled": "Ce compte est désactivé.",
  "auth/network-request-failed": "Connexion interrompue. Vérifiez l'état de session avant de réessayer.",
  "auth/too-many-requests": "Trop de tentatives. Patientez avant de réessayer.",
  "auth/operation-not-allowed": "Ce mode de connexion n'est pas disponible.",
  "auth/unauthorized-domain": "Ce domaine n'est pas autorisé pour la connexion.",
  "auth/already-initialized": "Auth est déjà initialisé avec d'autres options. Rechargez un contexte isolé."
});
function failure(error, fallback = "auth/operation-failed") {
  if (error instanceof AuthPreparationError) return error;
  const code = Object.hasOwn(MESSAGES, error?.code) ? error.code : fallback;
  return new AuthPreparationError(code, MESSAGES[code] || "L'opération Firebase Authentication a échoué.");
}
function emailValue(email) {
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new AuthPreparationError("auth/invalid-email", MESSAGES["auth/invalid-email"]);
  }
  return email.trim();
}
function linkValue(link) {
  let url;
  try { url = new URL(link); } catch { /* traité ci-dessous */ }
  const allowed = url && (url.origin === "https://objectif-5-tractions.firebaseapp.com"
    ? url.pathname === "/__/auth/action"
    : url.origin === "https://delalandemike-ui.github.io"
      && ["/Objectif-5-tractions/", "/Objectif-5-tractions/index.html"].includes(url.pathname));
  if (!allowed || url.username || url.password || ["apiKey", "mode", "oobCode"].some(key => url.searchParams.getAll(key).length !== 1)) {
    throw new AuthPreparationError("auth/invalid-action-code", MESSAGES["auth/invalid-action-code"]);
  }
  return url.href;
}
function identity(user) {
  return user ? Object.freeze({ uid: user.uid, email: user.email, emailVerified: user.emailVerified === true }) : null;
}

async function loadDependencies() {
  const config = await import("./firebase-config.js");
  let timer;
  let sdk;
  try {
    sdk = await Promise.race([
      import(`https://www.gstatic.com/firebasejs/${config.FIREBASE_SDK_VERSION}/firebase-auth.js`),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new AuthPreparationError("auth/sdk-timeout", "Le chargement du SDK Auth a dépassé 12 secondes.")), 12000);
      })
    ]);
  } finally { clearTimeout(timer); }
  return { sdk, app: await config.initializeFirebase() };
}

// Injection réservée aux tests ; le client par défaut utilise le SDK CDN réel.
export function createAuthClient({ load = loadDependencies } = {}) {
  let pending = null;
  let busy = false;
  function context() {
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        let dependencies;
        try {
          dependencies = await load();
          const sdk = dependencies?.sdk;
          if (!sdk?.inMemoryPersistence || ["initializeAuth", "sendSignInLinkToEmail", "isSignInWithEmailLink", "signInWithEmailLink", "signOut", "onAuthStateChanged"].some(key => typeof sdk[key] !== "function")) {
            throw new Error("SDK Auth incompatible");
          }
        } catch (error) { throw failure(error, "auth/sdk-load-failed"); }
        const { sdk, app } = dependencies;
        try {
          // La mémoire seule évite de restaurer une session persistée implicitement.
          const auth = sdk.initializeAuth(app, { persistence: sdk.inMemoryPersistence });
          return { sdk, auth, app };
        } catch (error) { throw failure(error, "auth/init-failed"); }
      }).catch(error => { pending = null; throw error; });
    }
    return pending;
  }
  async function exclusive(action) {
    if (busy) throw new AuthPreparationError("auth/busy", "Une opération Auth est déjà en cours. Attendez son résultat.");
    busy = true;
    try { return await action(); } catch (error) { throw failure(error); }
    finally { busy = false; }
  }
  return Object.freeze({
    // Aucun envoi ou connexion ; prépare seulement Auth en mémoire sur demande.
    async initialize() { await context(); },
    sendSignInLink(email) {
      return exclusive(async () => {
        const address = emailValue(email);
        const { sdk, auth } = await context();
        await sdk.sendSignInLinkToEmail(auth, address, { url: AUTH_RETURN_URL, handleCodeInApp: true });
        return Object.freeze({ status: "link-requested" });
      });
    },
    completeSignIn(email, link) {
      return exclusive(async () => {
        // Adresse explicitement saisie ; jamais extraite du lien ou du stockage.
        const address = emailValue(email);
        const checkedLink = linkValue(link);
        const { sdk, auth, app } = await context();
        if (new URL(checkedLink).searchParams.get("apiKey") !== app.options.apiKey || !sdk.isSignInWithEmailLink(auth, checkedLink)) {
          throw new AuthPreparationError("auth/invalid-action-code", MESSAGES["auth/invalid-action-code"]);
        }
        const credential = await sdk.signInWithEmailLink(auth, address, checkedLink);
        return identity(credential.user);
      });
    },
    async observe(onChange, onError) {
      if (typeof onChange !== "function" || typeof onError !== "function") {
        throw new AuthPreparationError("auth/invalid-observer", "Deux fonctions d'observation et d'erreur sont requises.");
      }
      const { sdk, auth } = await context();
      // L'appelant doit attendre puis conserver cette fonction de désabonnement.
      return sdk.onAuthStateChanged(auth, user => onChange(identity(user)), error => onError(failure(error)));
    },
    signOut() {
      return exclusive(async () => {
        const { sdk, auth } = await context();
        await sdk.signOut(auth);
      });
    }
  });
}

// Aucun effet réseau, stockage, envoi ou création de compte lors de cet export.
export const authClient = createAuthClient();
