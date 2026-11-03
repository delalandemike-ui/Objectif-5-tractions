import { createAuthClient } from './auth.js';
import { cloud } from './cloud.js';

export const athleteAuth = createAuthClient({ persistence: 'local' });
const KEY = 'tractions-active-athlete-v1';
// Sélection locale uniquement : les règles et le serveur décident de l'admission.
export function selectedAthlete(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(KEY));
    return value && /^[\w-]{1,128}$/.test(value.uid) ? { uid: value.uid } : null;
  } catch { return null; }
}
export function selectAthlete(uid, storage = localStorage) {
  if (uid === null) storage.removeItem(KEY);
  else {
    if (typeof uid !== 'string' || !/^[\w-]{1,128}$/.test(uid)) throw new Error('Identité invalide.');
    storage.setItem(KEY, JSON.stringify({ uid }));
  }
}
export function rememberAthlete(user, storage = localStorage) {
  selectAthlete(user.uid, storage);
  storage.setItem(`tractions-profile-v1:${user.uid}`, JSON.stringify({ displayName: user.displayName || '', email: user.email || '' }));
}
export function athleteLabel(uid, storage = localStorage) {
  try { const profile = JSON.parse(storage.getItem(`tractions-profile-v1:${uid}`)); return profile?.displayName || profile?.email || 'Mon suivi sportif'; }
  catch { return 'Mon suivi sportif'; }
}
export async function bounded(action, timeoutMs = 15000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Firebase ne répond pas. Vos résultats locaux sont conservés. Actualisez avant de réessayer.'), { code: 'athlete/timeout' })), timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}
export function athleteError(error) {
  if (['permission-denied', 'firestore/permission-denied', 'athlete/not-admitted'].includes(error?.code)) return 'Admission non confirmée ou accès retiré par le coach. Vos résultats restent sur cet appareil. Vérifiez votre compte avant de synchroniser.';
  if (error?.code === 'resource-exhausted') return 'Le service a atteint sa limite gratuite temporaire. Vos résultats restent sur cet appareil. Réessayez plus tard.';
  if (['unavailable', 'deadline-exceeded', 'auth/network-request-failed'].includes(error?.code)) return 'Connexion momentanément indisponible. Vos résultats restent sur cet appareil. Réessayez avec Internet.';
  return error?.message || 'Service indisponible. Vos résultats locaux sont conservés.';
}
export async function checkAdmission(user, load = cloud) {
  if (!user?.uid || !user.emailVerified) throw new Error('Connectez-vous avec une adresse vérifiée.');
  return bounded(async () => {
    const { sdk, db } = await load();
    const row = await sdk.getDocFromServer(sdk.doc(db, 'athletes', user.uid));
    if (!row.exists() || row.data().enrolled !== true) throw Object.assign(new Error('Admission non confirmée.'), { code: 'athlete/not-admitted' });
    return true;
  });
}
