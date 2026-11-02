import { cloud } from './cloud.js';
import { PROGRAM } from './athlete-store.js';
const path = (uid, id) => `athletes/${uid}/programs/${PROGRAM}${id === 'program' ? '' : '/sessions/' + id}`;
function decoded(snap) {
  if (!snap.exists()) return { value: null, revision: 0 };
  const { revision, updatedAt, ...value } = snap.data();
  if (value.completedAt) value.completedAt = value.completedAt.toMillis();
  return { value, revision };
}
export function createAthleteData() {
  return {
    async exchange(uid, id, local) {
      const { sdk, db } = await cloud();
      const ref = sdk.doc(db, path(uid, id));
      if (!local?.dirty) return { remote: decoded(await sdk.getDocFromServer(ref)) };
      return sdk.runTransaction(db, async tx => {
        const remote = decoded(await tx.get(ref));
        if (remote.revision !== local.base) return { conflict: true, remote };
        const value = { ...local.value };
        if (value.completedAt !== undefined && value.completedAt !== null) value.completedAt = sdk.Timestamp.fromMillis(value.completedAt);
        const revision = remote.revision + 1;
        tx.set(ref, { ...value, revision, updatedAt: sdk.serverTimestamp() });
        return { revision };
      });
    },
    async readAthlete(uid) {
      const { sdk, db } = await cloud();
      const docs = await Promise.all(['program', ...Array.from({ length: 12 }, (_, i) => String(i + 1))].map(async id => [id, decoded(await sdk.getDocFromServer(sdk.doc(db, path(uid, id))))]));
      return Object.fromEntries(docs);
    }
  };
}
