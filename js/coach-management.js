import { accessAction } from './invitations.js';
import { createAthleteData } from './athlete-data.js';

export function createCoachManagement(root) {
  let generation = 0;
  const doc = root.ownerDocument, data = createAthleteData();
  return (user, athletes) => {
    const current = ++generation;
    root.replaceChildren(); root.hidden = !user;
    if (!user) return;
    const callAccess = (action, input) => accessAction(user, action, input);
    const invitationUrl = id => { const url = new URL('athlete.html', doc.baseURI); url.searchParams.set('invitation', id); return url.href; };
    const heading = doc.createElement('h2'); heading.textContent = 'Invitations et suivi'; root.append(heading);
    const status = doc.createElement('p'); status.setAttribute('role', 'status');
    const email = doc.createElement('input'); email.type = 'email'; email.placeholder = 'sportif@exemple.fr'; email.setAttribute('aria-label', 'E-mail du sportif');
    const invitations = doc.createElement('ul'), details = doc.createElement('div');
    function button(label, action, target = root) {
      const control = doc.createElement('button'); control.textContent = label; control.type = 'button';
      control.onclick = async () => {
        control.disabled = true; status.textContent = 'Opération en cours…';
        try { await action(); } catch (error) { if (current === generation) status.textContent = error.message || 'Service indisponible.'; }
        finally { control.disabled = false; }
      }; target.append(control); return control;
    }
    async function refreshInvitations() {
      const result = await callAccess('listInvitations', {});
      if (current !== generation) return;
      invitations.replaceChildren();
      const labels = { pending: 'à transmettre', requested: 'admission à confirmer', accepted: 'admise', cancelled: 'annulée', expired: 'expirée' };
      for (const invite of result.invitations) {
        const li = doc.createElement('li'), text = doc.createElement('span'); text.textContent = `${invite.email} · ${labels[invite.status] || invite.status} `; li.append(text);
        if (['pending', 'requested'].includes(invite.status)) {
          const link = doc.createElement('input'); link.readOnly = true; link.value = invitationUrl(invite.id); link.setAttribute('aria-label', 'Lien à transmettre à ' + invite.email); li.append(link);
          button('Copier le lien', async () => { try { await doc.defaultView.navigator.clipboard.writeText(link.value); status.textContent = 'Lien copié. Transmettez-le au destinataire indiqué.'; } catch { link.select(); status.textContent = 'Sélectionnez et copiez le lien affiché.'; } }, li);
          const mail = doc.createElement('a'); mail.textContent = 'Préparer mon e-mail'; mail.href = `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent('Invitation Objectif 5 tractions')}&body=${encodeURIComponent('Votre invitation : ' + link.value + '\nCréez votre compte, vérifiez votre adresse puis demandez votre admission. Je confirmerai ensuite votre accès.')}`; li.append(mail);
        }
        if (invite.status === 'requested') button('Confirmer l’admission de ' + invite.email, async () => { await callAccess('approveInvitation', { id: invite.id }); await refreshInvitations(); }, li);
        if (['pending', 'requested', 'expired'].includes(invite.status)) button('Annuler', async () => { await callAccess('manageAccess', { action: 'cancel', id: invite.id }); await refreshInvitations(); }, li);
        invitations.append(li);
      }
      status.textContent = result.invitations.length ? 'Invitations actualisées.' : 'Aucune invitation.';
    }
    root.append(email);
    button('Créer une invitation à transmettre', async () => {
      if (!email.reportValidity() || !email.value) return;
      await callAccess('createInvitation', { email: email.value }); email.value = ''; await refreshInvitations();
    });
    button('Actualiser les invitations', refreshInvitations);
    root.append(invitations);
    for (const athlete of athletes) {
      const line = doc.createElement('p'), name = doc.createElement('span'); name.textContent = athlete.displayName + ' '; line.append(name);
      button('Voir les performances', async () => {
        const rows = await data.readAthlete(athlete.uid);
        if (current !== generation) return;
        details.replaceChildren();
        const title = doc.createElement('h3'); title.textContent = athlete.displayName; details.append(title);
        const general = rows.program.value, summary = doc.createElement('p');
        summary.textContent = `${Object.entries(rows).filter(([id, row]) => id !== 'program' && row.value?.completed).length}/12 séances réalisées · meilleur score : ${general?.score ?? 'non renseigné'} · notes : ${general?.notes || '—'}`; details.append(summary);
        const list = doc.createElement('ol');
        for (let id = 1; id <= 12; id++) {
          const session = rows[id].value, li = doc.createElement('li');
          li.textContent = `Séance ${id} · ${session?.completed ? 'réalisée' : 'à faire'}${session?.completedAt ? ' le ' + new Date(session.completedAt).toLocaleDateString('fr-FR') : ''} · tractions : ${session?.performance ?? '—'} · ${session?.comments || 'aucun commentaire'}`; list.append(li);
        }
        details.append(list); status.textContent = 'Résultats lus sur le serveur. Actualisez pour voir les dernières modifications.';
      }, line);
      button('Révoquer l’accès', async () => {
        if (!globalThis.confirm(`Révoquer l’accès de ${athlete.displayName} ? Ses résultats seront conservés.`)) return;
        await callAccess('manageAccess', { action: 'revoke', id: athlete.uid }); details.replaceChildren(); status.textContent = 'Accès révoqué. Les résultats sont conservés.';
      }, line);
      root.append(line);
    }
    root.append(details, status);
  };
}
