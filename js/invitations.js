import { cloud } from './cloud.js';
// Le lien localise l'invitation ; l'identité vérifiée et le coach décident de l'accès.
export async function accessAction(user, action, input = {}) {
  if (!user?.uid || !user.emailVerified) throw new Error('Adresse vérifiée requise.');
  const { sdk, db } = await cloud();
  const invitation = id => {
    if (typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)) throw new Error('Invitation invalide.');
    return sdk.doc(db, 'invitations', id);
  };
  if (action === 'createInvitation') {
    const email = String(input.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse invalide.');
    const ref = sdk.doc(sdk.collection(db, 'invitations'));
    await sdk.setDoc(ref, { email, coachUid: user.uid, status: 'pending', createdAt: sdk.serverTimestamp(), expiresAt: sdk.Timestamp.fromMillis(Date.now() + 7 * 86400000) });
    return { id: ref.id };
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
