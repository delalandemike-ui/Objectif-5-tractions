// Module indépendant : ne pas l'intégrer à index.html avant validation.
// Paramètres Web officiels fournis pour Objectif-5-tractions-web (mission 3B).
// Configuration publique uniquement : jamais de clé Admin ou de compte de service.
export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyBReeDylRA4uBhuEG24uKvlgaysEnWSzq0",
  authDomain: "objectif-5-tractions.firebaseapp.com",
  projectId: "objectif-5-tractions",
  storageBucket: "objectif-5-tractions.firebasestorage.app",
  messagingSenderId: "90002170931",
  appId: "1:90002170931:web:07ca95c598402824dc6f46"
});

export const FIREBASE_SDK_VERSION = "13.1.0";
export const FIREBASE_APP_SDK_URL =
  `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
const APP_NAME = "objectif-5-tractions-web";
const REQUIRED_FIELDS = ["apiKey", "authDomain", "projectId", "appId"];

export class FirebasePreparationError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "FirebasePreparationError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

// Import dynamique : aucun accès CDN lors du simple import de ce module.
async function loadAppSdk() {
  let timer;
  try {
    return await Promise.race([
      import(FIREBASE_APP_SDK_URL),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new FirebasePreparationError(
          "firebase/sdk-timeout", "Le chargement Firebase a dépassé le délai de 12 secondes."
        )), 12000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// La fabrique permet de vérifier les erreurs avec un SDK simulé, sans réseau.
export function createFirebaseInitializer({ config = firebaseConfig, loadSdk = loadAppSdk } = {}) {
  const options = Object.freeze({ ...config });
  let pending = null;

  return function initialize() {
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      if (REQUIRED_FIELDS.some(key => typeof options[key] !== "string" || !options[key].trim())
          || options.projectId !== "objectif-5-tractions") {
        throw new FirebasePreparationError(
          "firebase/config-incomplete",
          "Configuration Firebase absente, incomplète ou destinée à un autre projet."
        );
      }

      let sdk;
      try {
        sdk = await loadSdk();
        if (typeof sdk?.initializeApp !== "function" || typeof sdk?.getApps !== "function") {
          throw new Error("Interface du SDK Firebase inattendue.");
        }
      } catch (cause) {
        if (cause instanceof FirebasePreparationError) throw cause;
        throw new FirebasePreparationError(
          "firebase/sdk-load-failed",
          "Impossible de charger Firebase. Vérifiez le réseau, le CDN et les restrictions du navigateur.",
          cause
        );
      }

      try {
        const existing = sdk.getApps().find(app => app.name === APP_NAME);
        if (existing) {
          if (Object.keys(options).some(key => existing.options[key] !== options[key])) {
            throw new FirebasePreparationError(
              "firebase/config-conflict", "Une application Firebase de même nom utilise une autre configuration."
            );
          }
          return existing;
        }
        return sdk.initializeApp(options, APP_NAME);
      } catch (cause) {
        if (cause instanceof FirebasePreparationError) throw cause;
        throw new FirebasePreparationError(
          "firebase/init-failed", "L'initialisation de Firebase a échoué.", cause
        );
      }
    }).catch(error => {
      // Nouvelle tentative possible sur un prochain appel volontaire, jamais en boucle.
      pending = null;
      throw error;
    });
    return pending;
  };
}

// Crée seulement une fonction : ni chargement SDK, ni initialisation à cet endroit.
export const initializeFirebase = createFirebaseInitializer();
