// Lecture seule ; aucune configuration d'accès n'est exposée au navigateur.
async function loadDependencies() {
  const config = await import('./firebase-config.js');
  let timer;
  try {
    const sdk = await Promise.race([
      import(`https://www.gstatic.com/firebasejs/${config.FIREBASE_SDK_VERSION}/firebase-firestore.js`),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('SDK unavailable')), 12000); })
    ]);
    const app = await config.initializeFirebase();
    return { sdk, db: sdk.initializeFirestore(app, { localCache: sdk.memoryLocalCache() }) };
  } finally { clearTimeout(timer); }
}

export function createCoachDataClient({ load = loadDependencies } = {}) {
  let pending;
  const context = () => pending ||= Promise.resolve().then(load).catch(error => { pending = null; throw error; });
  return Object.freeze({
    async watch(user, onState, onError) {
      if (!user?.uid || user.emailVerified !== true) throw Object.assign(new Error('Verified account required'), { code: 'coach/unverified' });
      const { sdk, db } = await context();
      let closed = false, generation = 0, unsubscribe;
      let timer;
      const stop = () => { closed = true; generation++; clearTimeout(timer); unsubscribe?.(); };
      const fail = error => { if (!closed) { stop(); onError(error); } };
      timer = setTimeout(() => fail({ code: 'unavailable' }), 15000);
      // La permission list exige coach(), qui consulte settings/access côté règles.
      const relations = sdk.query(sdk.collection(db, 'coaches', user.uid, 'athletes'), sdk.where('status', '==', 'active'));
      unsubscribe = sdk.onSnapshot(relations, { includeMetadataChanges: true }, snapshot => {
        const current = ++generation;
        if (snapshot.metadata.fromCache) { onState({ authorized: false, athletes: [] }); return; }
        clearTimeout(timer);
        onState({ authorized: false, athletes: [], loading: true });
        timer = setTimeout(() => fail({ code: 'unavailable' }), 15000);
        Promise.all(snapshot.docs.map(async relation => {
          try {
            // Une relation seule ne suffit pas : les règles exigent aussi l'admission.
            const admission = await sdk.getDocFromServer(sdk.doc(db, 'athletes', relation.id));
            if (!admission.exists() || admission.data().enrolled !== true) return null;
            const profile = await sdk.getDocFromServer(sdk.doc(db, 'users', relation.id));
            const name = profile.exists() && typeof profile.data().displayName === 'string' ? profile.data().displayName : '';
            return { uid: relation.id, displayName: name || relation.data?.().displayName || 'Sportif' };
          } catch (error) {
            if (error.code === 'permission-denied') return null;
            throw error;
          }
        })).then(rows => {
          if (closed || current !== generation) return;
          clearTimeout(timer);
          onState({ authorized: true, athletes: rows.filter(Boolean) });
        }).catch(error => { if (current === generation) fail(error); });
      }, fail);
      if (closed) unsubscribe();
      return stop;
    }
  });
}
