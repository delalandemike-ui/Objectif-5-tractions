import { initializeFirebase, FIREBASE_SDK_VERSION } from './firebase-config.js';
let pending;
export function cloud() {
  return pending ||= (async () => {
    const app = await initializeFirebase();
    const sdk = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`);
    return { sdk, db: sdk.getFirestore(app) };
  })().catch(error => { pending = null; throw error; });
}
