(function () {
  // Projet Firebase du site pêche (lecture des réservations pêche, hébergements et canoë)
  const PECHE_CONFIG = {
    apiKey: "AIzaSyAa3VmJepGZa7tcqWZ5Q3-qB-lkumfLmuA",
    authDomain: "lac-de-podensac.firebaseapp.com",
    projectId: "lac-de-podensac",
    appId: "1:467517432972:web:8c073b85fbf3ee2ab9c7a9",
  };
  const PECHE_ADMIN = 'https://jovdl.github.io/lac-de-podensac/admin.html';

  const ACTIVITES = {
    peche:      { nom: 'Pêche',       couleur: '#1f6f8b' },
    campingcar: { nom: 'Camping-car', couleur: '#7a4fa3' },
    tente:      { nom: 'Tente',       couleur: '#3f7d3a' },
    canoe:      { nom: 'Canoë',       couleur: '#b7791f' },
    bateau:     { nom: 'BBQ boat',    couleur: '#e8751a' },
  };
  const HORAIRES_BBQ = {
    'petit-dej': '9 h – 10 h 30', 'midi': '11 h 30 – 14 h 30', 'apres-midi': '15 h 30 – 17 h 30',
    'soiree': '18 h – 21 h', 'demi-matin': '10 h – 14 h', 'demi-soir': '16 h – 20 h', 'journee': '9 h – 17 h',
  };
  const BATEAUX = { 'Martin Pêcheur': 'Martin-Pêcheur', 'Pic Vert': 'Pic Vert' };

  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const court = s => deIso(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

  const appPeche = firebase.initializeApp(PECHE_CONFIG, 'peche');
  const auth = firebase.auth();
  const authPeche = appPeche.auth();
  const dbPeche = appPeche.firestore();

  let bbq = [], peche = [];
  let lundi = debutSemaine(new Date());
  const visibles = new Set(Object.keys(ACTIVITES));
  let arrets = [];
  const avis = {};

  function debutSemaine(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  el('lien-peche').href = PECHE_ADMIN;
  el('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    el('login-err').textContent = '';
    const email = el('l-email').value.trim(), mdp = el('l-mdp').value;
    try {
      await auth.signInWithEmailAndPassword(email, mdp);
    } catch (err) {
      el('login-err').textContent = err.code === 'auth/network-request-failed'
        ? 'Connexion impossible. Vérifiez votre accès à Internet.'
        : 'Email ou mot de passe incorrect.';
      return;
    }
    // Même identifiant côté pêche s'il existe ; sans lui, la lecture reste tentée.
    authPeche.signInWithEmailAndPassword(email, mdp).catch(() => {});
  });
  el('btn-sortir').addEventListener('click', () => { authPeche.signOut(); auth.signOut(); });

  auth.onAuthStateChanged(user => {
    el('login').hidden = !!user;
    el('app').hidden = !user;
    arrets.forEach(f => f()); arrets = [];
    if (!user) { bbq = []; peche = []; return; }
    arrets.push(db.collection('reservations').onSnapshot(snap => {
      bbq = snap.docs.map(d => ({ id: d.id, base: 'bbq', ...d.data(), type: 'bateau' }));
      delete avis.bbq; rendre();
    }, () => { avis.bbq = 'Les réservations BBQ boat n\'ont pas pu être lues.'; rendre(); }));
    ecouterPeche();
  });
  authPeche.onAuthStateChanged(() => { if (auth.currentUser && avis.peche) ecouterPeche(); });

  function ecouterPeche() {
    arrets.push(dbPeche.collection('reservations').onSnapshot(snap => {
      peche = snap.docs.map(d => { const r = d.data(); return { id: d.id, base: 'peche', ...r, status: r.status || r.statut || 'pending' }; });
      delete avis.peche; rendre();
    }, () => { avis.peche = 'Les réservations du site pêche n\'ont pas pu être lues : ce compte doit aussi exister côté pêche, avec le même mot de passe.'; rendre(); }));
  }

  // Jours occupés par une réservation
  function jours(r) {
    if (Array.isArray(r.dates) && r.dates.length) return r.dates;
    const debut = r.dateDebut || r.date;
    if (!debut) return [];
    const fin = r.dateFin && r.dateFin > debut ? r.dateFin : debut;
    const liste = [];
    for (let d = deIso(debut); iso(d) <= fin && liste.length < 60; d.setDate(d.getDate() + 1)) liste.push(iso(d));
    return liste;
  }

  function lieu(r) {
    if (r.type === 'bateau') return BATEAUX[r.bateau] || 'Bateau à attribuer';
    if (r.type === 'peche') return r.posteId === 'zone-carnassier' ? 'Zone carnassier' : (r.posteId != null ? `Poste ${r.posteId}` : '');
    if (r.type === 'campingcar' || r.type === 'tente') return r.emplacement != null && r.emplacement !== '' ? `Emplacement ${r.emplacement}` : '';
    return '';
  }

  function moment(r, jour) {
    if (r.type === 'bateau') return HORAIRES_BBQ[r.formule] || '';
    const d = jours(r);
    const debut = r.dateDebut || r.date || d[0];
    const morceaux = [];
    if (r.formule === 'demi') morceaux.push('Demi-journée');
    else if (r.formule === 'jour') morceaux.push('Journée');
    if (d.length > 1 || (r.dateFin && r.dateFin !== debut)) {
      if (jour === debut) morceaux.push('Arrivée');
      if (r.dateFin && r.dateFin !== jour) morceaux.push(`départ ${court(r.dateFin)}`);
      else if (r.dateFin === jour) morceaux.push('Départ');
    }
    return morceaux.join(' · ');
  }

  function rendre() {
    const fin = new Date(lundi); fin.setDate(fin.getDate() + 6);
    el('sem-titre').textContent = `Du ${lundi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    el('filtres').innerHTML = Object.entries(ACTIVITES).map(([k, a]) =>
      `<button data-act="${k}" class="${visibles.has(k) ? 'actif' : ''}" style="--c:${a.couleur}" aria-pressed="${visibles.has(k)}"><i></i>${a.nom}</button>`).join('');

    const messages = Object.values(avis);
    el('avis').hidden = !messages.length;
    el('avis').textContent = messages.join(' ');

    const toutes = bbq.concat(peche).filter(r => ACTIVITES[r.type] && r.status !== 'cancelled' && visibles.has(r.type));
    const auj = iso(new Date());
    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(lundi); d.setDate(d.getDate() + i);
      const cle = iso(d);
      const ordre = Object.keys(ACTIVITES);
      const duJour = toutes.filter(r => jours(r).includes(cle) || (r.dateFin === cle && r.type !== 'bateau'))
        .sort((a, b) => ordre.indexOf(a.type) - ordre.indexOf(b.type) || lieu(a).localeCompare(lieu(b), 'fr', { numeric: true }) || (HORAIRES_BBQ[a.formule] || '').localeCompare(HORAIRES_BBQ[b.formule] || '', 'fr', { numeric: true }));
      html += `<div class="jour${cle === auj ? ' jour--auj' : ''}">
        <div class="jour__tete"><span>${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
        <div class="jour__corps">${duJour.map(r => {
          const a = ACTIVITES[r.type];
          const url = r.base === 'bbq' ? `admin.html?edit=${encodeURIComponent(r.id)}` : `${PECHE_ADMIN}?edit=${encodeURIComponent(r.id)}`;
          const nom = `${r.prenom || ''} ${(r.nom || '').toUpperCase()}`.trim() || 'Sans nom';
          const m = moment(r, cle);
          return `<a class="resa resa--${esc(r.status || 'pending')}" style="--c:${a.couleur}" href="${esc(url)}">
            <span class="resa__act">${a.nom}${lieu(r) ? ' · ' + esc(lieu(r)) : ''}</span>
            <strong>${esc(nom)}${r.nb ? ' · ' + esc(r.nb) + ' pers.' : ''}</strong>
            ${m ? esc(m) : ''}${(r.status || 'pending') === 'pending' ? `${m ? '<br>' : ''}<span class="badge badge--pending">En attente</span>` : ''}
          </a>`;
        }).join('') || '<div class="jour__vide">Rien de prévu</div>'}</div>
      </div>`;
    }
    el('semaine').innerHTML = html;
  }

  el('filtres').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    visibles.has(b.dataset.act) ? visibles.delete(b.dataset.act) : visibles.add(b.dataset.act);
    rendre();
  });
  el('sem-prec').addEventListener('click', () => { lundi.setDate(lundi.getDate() - 7); rendre(); });
  el('sem-suiv').addEventListener('click', () => { lundi.setDate(lundi.getDate() + 7); rendre(); });
  el('sem-auj').addEventListener('click', () => { lundi = debutSemaine(new Date()); rendre(); });
})();
