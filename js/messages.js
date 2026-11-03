import { cloud } from './cloud.js';
import { bounded } from './athlete-session.js';

export function createMessagesClient({ load = cloud } = {}) {
  return {
    list(uid, cursor = null) {
      return bounded(async () => {
        const { sdk, db } = await load(), clauses = [sdk.orderBy('createdAt', 'desc'), sdk.limit(50)];
        if (cursor) clauses.push(sdk.startAfter(cursor));
        const rows = await sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'athletes', uid, 'messages'), ...clauses));
        return { messages: rows.docs.map(row => ({ id: row.id, ...row.data() })), cursor: rows.docs.at(-1), hasMore: rows.size === 50 };
      });
    },
    send(user, uid, text, id) {
      text = String(text || '').trim();
      if (!user?.emailVerified || !text || text.length > 2000 || !/^[\w-]{1,128}$/.test(id)) return Promise.reject(new Error('Écrivez un message de 1 à 2000 caractères avec un compte vérifié.'));
      return bounded(async () => {
        const { sdk, db } = await load(), ref = sdk.doc(db, 'athletes', uid, 'messages', id);
        await sdk.runTransaction(db, async tx => {
          const row = await tx.get(ref);
          if (row.exists()) {
            if (row.data().senderUid !== user.uid || row.data().text !== text) throw new Error('Ce message a déjà été envoyé avec un autre contenu. Actualisez la conversation.');
            return;
          }
          tx.set(ref, { senderUid: user.uid, text, createdAt: sdk.serverTimestamp() });
        });
      });
    }
  };
}

export function mountMessages(root, { user, uid, coach = false, client = createMessagesClient() }) {
  const doc = root.ownerDocument;
  let disposed = false, busy = false, cursor = null, draft = null, rows = [];
  root.replaceChildren(); root.hidden = false;
  const heading = doc.createElement('h3'); heading.textContent = coach ? 'Messages avec ce sportif' : 'Messages avec mon coach';
  const list = doc.createElement('ol'), status = doc.createElement('p'); status.setAttribute('role', 'status');
  const input = doc.createElement('textarea'); input.maxLength = 2000; input.rows = 3; input.setAttribute('aria-label', 'Votre message');
  const send = doc.createElement('button'); send.type = 'button'; send.textContent = 'Envoyer';
  const refresh = doc.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Actualiser les messages';
  const older = doc.createElement('button'); older.type = 'button'; older.textContent = 'Messages précédents'; older.hidden = true;
  root.append(heading, list, input, send, refresh, older, status);
  async function run(action) {
    if (busy || disposed) return;
    busy = true; send.disabled = refresh.disabled = older.disabled = true;
    try { await action(); }
    catch (error) {
      if (!disposed) {
        if (['permission-denied', 'firestore/permission-denied'].includes(error?.code)) { list.replaceChildren(); rows = []; status.textContent = 'Messagerie indisponible pour ce compte. Votre accès a pu changer ; contactez votre coach.'; }
        else status.textContent = 'Message non confirmé. Votre texte est conservé. Actualisez la conversation avant de réessayer.';
      }
    } finally { busy = false; if (!disposed) send.disabled = refresh.disabled = older.disabled = false; }
  }
  async function read(previous = false) {
    const result = await client.list(uid, previous ? cursor : null);
    if (disposed) return;
    rows = previous ? [...rows, ...result.messages] : result.messages;
    cursor = result.cursor; older.hidden = !result.hasMore; list.replaceChildren();
    for (const row of rows) {
      const li = doc.createElement('li'), own = row.senderUid === user.uid;
      const time = row.createdAt?.toMillis?.();
      li.textContent = `${own ? 'Vous' : coach ? 'Sportif' : 'Coach'}${time ? ' · ' + new Date(time).toLocaleString('fr-FR') : ''} : ${row.text}`; list.append(li);
    }
    status.textContent = rows.length ? 'Conversation privée actualisée.' : 'Aucun message pour le moment.';
  }
  refresh.onclick = () => run(() => read()); older.onclick = () => run(() => read(true));
  send.onclick = () => run(async () => {
    const text = input.value.trim();
    if (!text) { status.textContent = 'Écrivez votre message avant de l’envoyer.'; return; }
    if (!draft || draft.text !== text) draft = { text, id: crypto.randomUUID() };
    await client.send(user, uid, text, draft.id);
    if (disposed) return;
    // Une saisie effectuée pendant l'envoi reste dans le champ.
    if (input.value.trim() === text) input.value = '';
    draft = null; status.textContent = 'Message envoyé.';
    try { await read(); } catch { if (!disposed) status.textContent = 'Message envoyé. La conversation sera actualisée à votre prochaine demande.'; }
  });
  void run(() => read());
  return () => { disposed = true; root.replaceChildren(); root.hidden = true; };
}
