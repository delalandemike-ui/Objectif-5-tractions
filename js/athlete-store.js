export const PROGRAM = 'tractions-12-v1';
export const emptySession = () => ({ completed: false, completedAt: null, performance: null, comments: '' });
export const emptyProgram = () => ({ schemaVersion: 1, score: null, notes: '' });
export function createAthleteStore(uid, storage = localStorage) {
  if (typeof uid !== 'string' || !/^[\w-]{1,128}$/.test(uid)) throw new Error('Identité invalide.');
  const key = `tractions-athlete-v1:${uid}`;
  let raw = storage.getItem(key);
  let state = raw === null ? { uid, documents: {}, history: [], imported: false } : JSON.parse(raw);
  if (state.uid !== uid || !state.documents || !Array.isArray(state.history)) throw new Error('Suivi local illisible : données conservées.');
  function commit(change) {
    if (storage.getItem(key) !== raw) throw new Error('Suivi modifié dans un autre onglet. Rechargez avant de continuer.');
    const next = structuredClone(state); change(next);
    const encoded = JSON.stringify(next); storage.setItem(key, encoded); state = next; raw = encoded;
  }
  function edit(id, value) {
    editMany({ [id]: value });
  }
  function editMany(values) {
    for (const id of Object.keys(values)) if (id !== 'program' && !/^(?:[1-9]|1[0-2])$/.test(id)) throw new Error('Séance invalide.');
    commit(next => {
      for (const [id, value] of Object.entries(values)) {
        const old = next.documents[id];
        next.documents[id] = { ...old, base: old?.base || 0, value: structuredClone(value), dirty: true, version: (old?.version || 0) + 1 };
      }
    });
  }
  return {
    uid, read: () => structuredClone(state), edit, editMany,
    importLegacy() {
      const legacy = storage.getItem('tractions-v2');
      if (!legacy) throw new Error('Aucun suivi tractions-v2 sur cet appareil.');
      const data = JSON.parse(legacy);
      if (!Array.isArray(data.done) || data.done.some(id => !Number.isInteger(id) || id < 1 || id > 12) || typeof data.notes !== 'string' || typeof data.score !== 'string' || (data.score !== '' && (!/^\d+$/.test(data.score) || +data.score > 30))) throw new Error('Anciennes données invalides : import bloqué, original conservé.');
      if (state.imported || Object.keys(state.documents).length) throw new Error('Import réservé à un espace local vide. Exportez les suivis avant une fusion manuelle.');
      commit(next => {
        next.history.push({ kind: 'legacy', raw: legacy, at: Date.now() }); next.imported = true;
        const put = (id, value) => { next.documents[id] = { base: 0, value, dirty: true, version: 1 }; };
        put('program', { schemaVersion: 1, score: data.score === '' ? null : +data.score, notes: data.notes });
        for (let id = 1; id <= 12; id++) {
          const session = data.sessions?.[id];
          if (session && (!Number.isInteger(session.performance) && session.performance !== null || session.performance < 0 || session.performance > 10000 || typeof session.comments !== 'string' || session.comments.length > 5000)) throw new Error('Résultat historique invalide : original conservé.');
          put(String(id), { ...emptySession(), performance: session?.performance ?? null, comments: session?.comments || '', completed: data.done.includes(id) });
        }
      });
    },
    async sync(remote, { signal } = {}) {
      for (const id of ['program', ...Array.from({ length: 12 }, (_, i) => String(i + 1))]) {
        if (signal?.aborted) return;
        const sent = structuredClone(state.documents[id]);
        if (sent?.conflict) continue;
        const result = await remote.exchange(uid, id, sent);
        if (signal?.aborted) return;
        commit(next => {
          const current = next.documents[id];
          if (result.conflict) {
            if (current) current.conflict = result.remote;
          } else if (sent?.dirty) {
            if (current) { current.base = result.revision; current.dirty = current.version !== sent.version; }
          } else if (result.remote?.value && !current?.dirty) {
            next.documents[id] = { value: result.remote.value, base: result.remote.revision, dirty: false, version: current?.version || 0 };
          }
        });
      }
    },
    resolve(id, useLocal) {
      commit(next => {
        const entry = next.documents[id];
        if (!entry?.conflict) return;
        next.history.push({ kind: 'conflict', id, local: entry.value, remote: entry.conflict, at: Date.now() });
        const remote = entry.conflict;
        entry.base = remote.revision;
        if (!useLocal) entry.value = remote.value || (id === 'program' ? emptyProgram() : emptySession());
        entry.dirty = useLocal; entry.version++; delete entry.conflict;
      });
    }
  };
}
