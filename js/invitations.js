import { cloud } from './cloud.js';
// Réutiliser une écriture encore en attente après un délai dépassé.
const pendingCreations = new Map();
// Le lien localise l'invitation ; l'identité vérifiée et le coach décident de l'accès.
export async function accessAction(user, action, input = {}, { load = cloud, timeoutMs = 15000 } = {}) {
  let timer, operation = 'initialisation Firebase';
  const work = executeAccessAction(user, action, input, async () => {
    const context = await load();
    operation = action === 'createInvitation' ? 'création de l’invitation (setDoc)'
      : action === 'listInvitations' ? 'lecture des invitations (getDocsFromServer)' : action;
    return context;
  });
  try {
    return await Promise.race([work, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(
        `Firebase ne répond pas : ${operation}. Vérifiez votre connexion puis actualisez les invitations.${action === 'createInvitation' ? ' La création peut encore aboutir : vérifiez la liste avant de recréer une invitation.' : ''}`
      ), { code: 'access/timeout', operation })), timeoutMs);
    })]);
  } catch (error) {
    if (['permission-denied', 'firestore/permission-denied'].includes(error?.code)) {
      throw Object.assign(new Error(`Accès refusé par Firebase : ${operation}. Vérifiez que le compte coach est toujours autorisé.`), { code: error.code, operation, cause: error });
    }
    if (['unavailable', 'deadline-exceeded'].includes(error?.code)) {
      throw Object.assign(new Error(`Firebase indisponible : ${operation}. Vérifiez votre connexion puis actualisez les invitations avant de réessayer.`), { code: error.code, operation, cause: error });
    }
    throw error;
  } finally { clearTimeout(timer); }
}

async function executeAccessAction(user, action, input, load) {
  if (!user?.uid || !user.emailVerified) throw new Error('Adresse vérifiée requise.');
  const { sdk, db } = await load();
  const invitation = id => {
    if (typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)) throw new Error('Invitation invalide.');
    return sdk.doc(db, 'invitations', id);
  };
  if (action === 'createInvitation') {
    const email = String(input.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse invalide.');
    const key = `${user.uid}:${email}`;
    if (pendingCreations.has(key)) return pendingCreations.get(key);
    const ref = sdk.doc(sdk.collection(db, 'invitations'));
    const write = (async () => {
      await sdk.setDoc(ref, { email, coachUid: user.uid, status: 'pending', createdAt: sdk.serverTimestamp(), expiresAt: sdk.Timestamp.fromMillis(Date.now() + 7 * 86400000) });
      return { id: ref.id };
    })();
    pendingCreations.set(key, write);
    try { return await write; }
    finally { if (pendingCreations.get(key) === write) pendingCreations.delete(key); }
  }
  if (action === 'listInvitations') {
    const rows = await sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'invitations'), sdk.where('coachUid', '==', user.uid)));
    return { invitations: rows.docs.map(row => ({ id: row.id, ...row.data(), status: ['pending', 'requested'].includes(row.data().status) && row.data().expiresAt.toMillis() <= Date.now() ? 'expired' : row.data().status })) };
  }
  if (action === 'acceptInvitation') {
    await sdk.runTransaction(db, async tx => {
      const ref = invitation(input.id), row = await tx.get(ref);
      if (!row.exists()) throw new Error('Invitation inconnue.');
      if (row.data().status === 'requested' && row.data().athleteUid === user.uid) return;
      tx.update(ref, { status: 'requested', athleteUid: user.uid, displayName: String(input.displayName || '').trim(), requestedAt: sdk.serverTimestamp() });
    }); return;
  }
  if (action === 'approveInvitation') {
    await sdk.runTransaction(db, async tx => {
      const ref = invitation(input.id), row = await tx.get(ref), invite = row.data();
      if (!invite || invite.status !== 'requested') throw new Error('Aucune demande à approuver.');
      const athlete = sdk.doc(db, 'athletes', invite.athleteUid);
      tx.update(ref, { status: 'accepted', acceptedAt: sdk.serverTimestamp() });
      tx.set(athlete, { enrolled: true, invitedBy: user.uid, invitationId: ref.id, acceptedAt: sdk.serverTimestamp() });
      tx.set(sdk.doc(db, 'coaches', user.uid, 'athletes', invite.athleteUid), { status: 'active', invitationId: ref.id, displayName: invite.displayName, acceptedAt: sdk.serverTimestamp() });
    }); return;
  }
  if (action === 'manageAccess' && input.action === 'cancel') {
    await sdk.updateDoc(invitation(input.id), { status: 'cancelled' }); return;
  }
  if (action === 'manageAccess' && input.action === 'revoke') {
    const batch = sdk.writeBatch(db);
    batch.update(sdk.doc(db, 'athletes', input.id), { enrolled: false, revokedAt: sdk.serverTimestamp() });
    batch.update(sdk.doc(db, 'coaches', user.uid, 'athletes', input.id), { status: 'revoked', revokedAt: sdk.serverTimestamp() });
    await batch.commit(); return;
  }
  throw new Error('Action inconnue.');
}
