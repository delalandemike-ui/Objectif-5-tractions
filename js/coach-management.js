import { accessAction } from './invitations.js';
import { createAthleteData } from './athlete-data.js';
import { mountMessages } from './messages.js';
import { bounded } from './athlete-session.js';

const date = stamp => stamp?.toMillis?.() ? new Date(stamp.toMillis()).toLocaleString('fr-FR') : 'Date non renseignée';
export function createCoachManagement(root, { access = accessAction, data = createAthleteData(), messaging = mountMessages } = {}) {
  let generation = 0, cleanup = () => {};
  const doc = root.ownerDocument, view = doc.defaultView;
  return (user, athletes) => {
    cleanup(); const current = ++generation;
    root.replaceChildren(); root.hidden = !user;
    if (!user) return;
    let busy = false, timer, stopMessages = () => {}, invitationRows = [];
    const active = () => current === generation;
    const node = (tag, text, target = root) => { const item = doc.createElement(tag); if (text) item.textContent = text; target.append(item); return item; };
    node('h2', 'Inviter un sportif');
    const email = node('input'); email.type = 'email'; email.required = true; email.maxLength = 254; email.placeholder = 'sportif@exemple.fr'; email.setAttribute('aria-label', 'Adresse e-mail du sportif');
    const status = doc.createElement('p'); status.setAttribute('role', 'status');
    const call = (action, input = {}) => access(user, action, input);
    const message = text => { if (active()) status.textContent = text; };
    async function run(action) {
      if (busy || !active()) return;
      busy = true; root.querySelectorAll('button').forEach(control => { control.disabled = true; }); message('Opération en cours…');
      try { await action(); if (active() && status.textContent === 'Opération en cours…') message('Opération terminée.'); }
      catch (error) { message(['permission-denied', 'firestore/permission-denied'].includes(error?.code) ? 'Accès refusé. Actualisez votre accès coach avant de réessayer.' : error.message || 'Service indisponible. Réessayez.'); }
      finally { busy = false; if (active()) root.querySelectorAll('button').forEach(control => { control.disabled = false; }); }
    }
    const button = (label, action, target = root) => { const control = node('button', label, target); control.type = 'button'; control.onclick = () => run(action); return control; };
    button('Inviter un sportif', async () => {
      email.value = email.value.trim();
      if (!email.reportValidity()) { message('Saisissez une adresse e-mail valide.'); return; }
      await call('createInvitation', { email: email.value });
      if (!active()) return;
      email.value = '';
      try { await refreshInvitations(); message('Invitation créée. Vous pouvez transmettre le lien au sportif.'); }
      catch (error) { throw new Error('Invitation créée, mais liste non actualisée. Ne la recréez pas. ' + error.message); }
    });
    button('Actualiser', () => refreshInvitations());
    node('h3', 'Invitations en attente'); const invitations = node('ul');
    node('h3', 'Demandes à valider'); const requests = node('ul');
    node('h3', 'Mes sportifs'); const people = node('div'), details = node('section'); details.hidden = true;
    function url(invite) {
      const link = new URL('athlete.html', doc.baseURI); link.searchParams.set('invitation', invite.id);
      link.hash = new URLSearchParams({ email: invite.email }).toString(); return link.href;
    }
    function renderPeople() {
      people.replaceChildren();
      if (!athletes.length) node('p', 'Aucun sportif accepté pour le moment.', people);
      for (const athlete of athletes) {
        const invite = invitationRows.find(row => row.athleteUid === athlete.uid && row.status === 'accepted');
        const person = { ...athlete, email: invite?.email || athlete.email || '', displayName: invite?.displayName || athlete.displayName || 'Sportif', acceptedAt: invite?.acceptedAt };
        const line = node('p', `${person.displayName}${person.email ? ' · ' + person.email : ''} · Actif `, people);
        button('Ouvrir la fiche', () => showAthlete(person), line);
      }
    }
    async function refreshInvitations() {
      const result = await call('listInvitations');
      if (!active()) return;
      invitationRows = result.invitations; invitations.replaceChildren(); requests.replaceChildren();
      for (const invite of invitationRows) {
        if (invite.status === 'requested') {
          const li = node('li', `${invite.displayName || 'Sportif'} · ${invite.email} · Demande du ${date(invite.requestedAt)} `, requests);
          button('Accepter', async () => { await call('approveInvitation', { id: invite.id }); await refreshInvitations(); message('Sportif accepté. Sa fiche apparaît dans Mes sportifs.'); }, li);
          button('Refuser', async () => { if (!view.confirm('Refuser cette demande ?')) return; await call('manageAccess', { action: 'cancel', id: invite.id }); await refreshInvitations(); message('Demande refusée.'); }, li);
        } else if (invite.status === 'pending') {
          const li = node('li', `${invite.email} · En attente d’inscription `, invitations), link = url(invite);
          button('Copier le lien', async () => {
            try { await bounded(() => view.navigator.clipboard.writeText(link)); message('Lien copié. Vous pouvez le transmettre au sportif.'); }
            catch { const fallback = node('a', 'Ouvrir la page d’inscription à partager', li); fallback.href = link; message('Copie indisponible. Faites un appui long sur le lien pour le partager.'); }
          }, li);
          const mail = node('a', 'Envoyer par e-mail', li);
          mail.href = `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent('Votre programme Objectif 5 tractions')}&body=${encodeURIComponent('Bonjour, créez votre compte avec votre invitation personnelle : ' + link + '\nJe validerai ensuite votre inscription. À bientôt !')}`;
          button('Annuler', async () => { await call('manageAccess', { action: 'cancel', id: invite.id }); await refreshInvitations(); }, li);
        }
      }
      if (!invitations.children.length) node('li', 'Aucune invitation en attente.', invitations);
      if (!requests.children.length) node('li', 'Aucune demande à valider.', requests);
      renderPeople(); message(invitationRows.length ? 'Invitations et demandes actualisées.' : 'Aucune invitation.');
    }
    async function showAthlete(athlete) {
      const rows = await bounded(() => data.readAthlete(athlete.uid));
      if (!active()) return;
      stopMessages(); details.replaceChildren(); details.hidden = false;
      node('h3', athlete.displayName, details);
      node('p', `${athlete.email || 'Adresse non disponible pour cet ancien compte'} · Actif${athlete.acceptedAt ? ' · Admission du ' + date(athlete.acceptedAt) : ''}`, details);
      const general = rows.program.value;
      node('p', `${Object.entries(rows).filter(([id,row]) => id !== 'program' && row.value?.completed).length}/12 séances réalisées · Meilleur score : ${general?.score ?? 'non renseigné'}`, details);
      node('p', 'Notes du sportif : ' + (general?.notes || 'Aucune note.'), details);
      const list = node('ol', '', details);
      for (let id = 1; id <= 12; id++) {
        const session = rows[id].value;
        node('li', `Séance ${id} · ${session?.completed ? 'Réalisée' : 'À faire'}${session?.completedAt ? ' le ' + new Date(session.completedAt).toLocaleDateString('fr-FR') : ''} · Tractions : ${session?.performance ?? '—'} · ${session?.comments || 'Aucun commentaire'}`, list);
      }
      node('h4', 'Historique de suivi et évolution', details);
      node('p', 'Les nouveaux enregistrements alimentent cet historique. Les résultats antérieurs sont conservés ci-dessus.', details);
      const evolution = node('p', '', details), history = node('ol', '', details), historyStatus = node('p', '', details);
      let entries = [], cursor = null;
      const loadHistory = async () => {
        const result = await bounded(() => data.readHistory(athlete.uid, cursor));
        if (!active() || !details.contains(history)) return;
        entries.push(...result.entries); cursor = result.cursor; history.replaceChildren(); older.hidden = !result.hasMore;
        for (const entry of entries) node('li', `${date(entry.recordedAt)} · ${entry.documentId === 'program' ? 'Suivi général · Score : ' + (entry.value.score ?? '—') + ' · ' + entry.value.notes : 'Séance ' + entry.documentId + ' · ' + (entry.value.completed ? 'Réalisée' : 'À faire') + ' · Tractions : ' + (entry.value.performance ?? '—') + ' · ' + (entry.value.comments || '')}`, history);
        const scores = entries.filter(entry => entry.documentId === 'program' && entry.value.score !== null).reverse();
        evolution.textContent = scores.length ? 'Évolution du meilleur score : ' + scores.map(entry => `${entry.value.score} (${date(entry.recordedAt)})`).join(' → ') : 'Pas encore d’évolution enregistrée.';
        historyStatus.textContent = entries.length ? '' : 'Aucun nouvel enregistrement dans l’historique.';
      };
      const older = button('Historique précédent', loadHistory, details); older.hidden = true;
      const conversation = node('div', '', details); stopMessages = messaging(conversation, { user, uid: athlete.uid, coach: true });
      button('Révoquer l’accès', async () => {
        if (!view.confirm(`Révoquer l’accès de ${athlete.displayName} ? Ses résultats seront conservés.`)) return;
        await call('manageAccess', { action: 'revoke', id: athlete.uid }); stopMessages(); details.replaceChildren(); details.hidden = true; message('Accès révoqué. Les résultats et les messages restent conservés.');
      }, details);
      try { await loadHistory(); } catch { if (active()) historyStatus.textContent = 'Historique momentanément indisponible. Les résultats restent consultables.'; }
      message('Fiche actualisée.');
    }
    root.append(status); renderPeople();
    const poll = () => { clearTimeout(timer); if (active()) timer = setTimeout(async () => { if (active() && !doc.hidden && view.navigator.onLine) await run(refreshInvitations); poll(); }, 30000); };
    const focus = () => { if (active() && view.navigator.onLine) void run(refreshInvitations); };
    view.addEventListener('focus', focus); poll(); void run(refreshInvitations);
    cleanup = () => { clearTimeout(timer); stopMessages(); view.removeEventListener('focus', focus); };
  };
}
