(function () {
  const FORMULES = {
    'petit-dej':  { nom: 'Petit déjeuner',     debut: 9,    fin: 10.5, prix: 70 },
    'midi':       { nom: 'Déjeuner',           debut: 11.5, fin: 14.5, prix: 210 },
    'apres-midi': { nom: 'Après-midi',         debut: 15.5, fin: 17.5, prix: 110 },
    'soiree':     { nom: 'Soirée',             debut: 18,   fin: 21,   prix: 210 },
    'demi-matin': { nom: 'Demi-journée matin', debut: 10,   fin: 15,   prix: 270 },
    'demi-soir':  { nom: 'Demi-journée soir',  debut: 16,   fin: 20,   prix: 270 },
  };
  const OPTIONS = {
    'bopt-petit-dej': { nom: 'Petit déjeuner', prix: 12 },
    'bopt-apero':     { nom: 'Plateau apéro', prix: 12 },
    'bopt-viande':    { nom: 'Plateau viande', prix: 20 },
    'bopt-roses':     { nom: 'Pétales de rose', prix: 30, forfait: true },
    'bopt-champagne': { nom: 'Champagne', prix: 40, forfait: true },
  };
  const STATUTS = { pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée' };
  const BATEAUX = { 'Martin Pêcheur': 'Martin-Pêcheur', 'Pic Vert': 'Pic Vert' };
  const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euro = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const heure = h => `${Math.floor(h)} h${h % 1 ? ' 30' : ''}`;
  const horaire = r => FORMULES[r.formule] ? `${heure(FORMULES[r.formule].debut)} – ${heure(FORMULES[r.formule].fin)}` : '';
  const nomClient = r => `${r.prenom || ''} ${(r.nom || '').toUpperCase()}`.trim() || 'Sans nom';
  const prix = r => Number(r.totalPrice) || 0;
  const paye = r => Number(r.acompte) || 0;
  const classeBateau = r => r.bateau === 'Martin Pêcheur' ? 'resa--martin' : r.bateau === 'Pic Vert' ? 'resa--pic' : '';

  const auth = firebase.auth();
  let reservations = [];
  let lundi = debutSemaine(new Date());
  let filtreExtra = null;
  let enCours = null;
  let arretEcoute = null;
  let dejaOuvert = false;

  function debutSemaine(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  function toast(texte) {
    const t = el('toast');
    t.textContent = texte;
    t.classList.add('visible');
    clearTimeout(toast.minuteur);
    toast.minuteur = setTimeout(() => t.classList.remove('visible'), 2600);
  }

  // ── Connexion ──
  el('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    el('login-err').textContent = '';
    try {
      await auth.signInWithEmailAndPassword(el('l-email').value.trim(), el('l-mdp').value);
    } catch (err) {
      el('login-err').textContent = err.code === 'auth/network-request-failed'
        ? 'Connexion impossible. Vérifiez votre accès à Internet.'
        : 'Email ou mot de passe incorrect.';
    }
  });
  el('btn-sortir').addEventListener('click', () => auth.signOut());

  auth.onAuthStateChanged(user => {
    el('login').hidden = !!user;
    el('app').hidden = !user;
    if (arretEcoute) { arretEcoute(); arretEcoute = null; }
    if (!user) { reservations = []; return; }
    arretEcoute = db.collection('reservations').onSnapshot(snap => {
      reservations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rendre();
      const aOuvrir = new URLSearchParams(location.search).get('edit');
      if (aOuvrir && !dejaOuvert) { dejaOuvert = true; ouvrir(aOuvrir); }
    }, err => toast('Lecture des réservations impossible : ' + err.message));
  });

  // ── Onglets ──
  el('onglets').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) montrer(b.dataset.vue);
  });
  function montrer(vue) {
    document.querySelectorAll('#onglets button').forEach(b => b.classList.toggle('actif', b.dataset.vue === vue));
    ['planning', 'liste', 'stats'].forEach(v => { el('vue-' + v).hidden = v !== vue; });
  }

  function rendre() { rendrePlanning(); rendreListe(); rendreStats(); }

  // Deux réservations actives du même bateau, le même jour, dont les horaires se chevauchent
  function conflits() {
    const ids = new Set();
    const actives = reservations.filter(r => r.status !== 'cancelled' && BATEAUX[r.bateau] && FORMULES[r.formule]);
    actives.forEach((a, i) => actives.slice(i + 1).forEach(b => {
      if (a.date !== b.date || a.bateau !== b.bateau) return;
      const fa = FORMULES[a.formule], fb = FORMULES[b.formule];
      if (fa.debut < fb.fin && fb.debut < fa.fin) { ids.add(a.id); ids.add(b.id); }
    }));
    return ids;
  }

  // ── Planning ──
  function rendrePlanning() {
    const fin = new Date(lundi); fin.setDate(fin.getDate() + 6);
    el('sem-titre').textContent = `Du ${lundi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    const enConflit = conflits();
    const auj = iso(new Date());
    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(lundi); d.setDate(d.getDate() + i);
      const cle = iso(d);
      const duJour = reservations.filter(r => r.date === cle)
        .sort((a, b) => ((FORMULES[a.formule] || {}).debut || 0) - ((FORMULES[b.formule] || {}).debut || 0));
      html += `<div class="jour${cle === auj ? ' jour--auj' : ''}">
        <div class="jour__tete"><span>${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span><button data-ajout="${cle}" aria-label="Ajouter une réservation ce jour">＋</button></div>
        <div class="jour__corps">${duJour.map(r => `<button class="resa ${classeBateau(r)} resa--${esc(r.status || 'pending')}" data-id="${esc(r.id)}">
          <strong>${esc(horaire(r))}</strong>${esc(nomClient(r))} · ${esc(r.nb || '?')} pers.<br>
          ${esc((FORMULES[r.formule] || {}).nom || r.formule || '')} · ${esc(BATEAUX[r.bateau] || 'Bateau à attribuer')}
          ${r.status === 'pending' ? '<br><span class="badge badge--pending">En attente</span>' : ''}
          ${enConflit.has(r.id) ? '<br><span class="resa__conflit">⚠ Bateau déjà pris sur ce créneau</span>' : ''}
        </button>`).join('') || '<div class="jour__vide">Aucune sortie</div>'}</div>
      </div>`;
    }
    el('semaine').innerHTML = html;

    const attente = reservations.filter(r => (r.status || 'pending') === 'pending' && r.date >= auj);
    el('attente').hidden = !attente.length;
    el('attente').textContent = `${attente.length} demande${attente.length > 1 ? 's' : ''} en attente de confirmation. Voir la liste →`;
  }
  el('semaine').addEventListener('click', e => {
    const ajout = e.target.closest('[data-ajout]');
    const resa = e.target.closest('[data-id]');
    if (ajout) ouvrir(null, ajout.dataset.ajout);
    else if (resa) ouvrir(resa.dataset.id);
  });
  el('attente').addEventListener('click', () => {
    el('f-statut').value = 'pending'; el('f-quand').value = 'avenir'; el('f-rech').value = '';
    filtreExtra = null; rendreListe(); montrer('liste');
  });
  el('sem-prec').addEventListener('click', () => { lundi.setDate(lundi.getDate() - 7); rendrePlanning(); });
  el('sem-suiv').addEventListener('click', () => { lundi.setDate(lundi.getDate() + 7); rendrePlanning(); });
  el('sem-auj').addEventListener('click', () => { lundi = debutSemaine(new Date()); rendrePlanning(); });

  // ── Liste ──
  function rendreListe() {
    const q = el('f-rech').value.trim().toLowerCase();
    const statut = el('f-statut').value;
    const quand = el('f-quand').value;
    const auj = iso(new Date());
    el('f-extra').hidden = !filtreExtra;
    if (filtreExtra) el('f-extra').textContent = filtreExtra.libelle + ' ✕';
    let liste = reservations.filter(r => {
      if (filtreExtra) return filtreExtra.test(r);
      if (statut && (r.status || 'pending') !== statut) return false;
      if (quand === 'avenir' && (r.date || '') < auj) return false;
      if (quand === 'passe' && (r.date || '') >= auj) return false;
      return true;
    });
    if (q) liste = liste.filter(r => [r.prenom, r.nom, r.tel, r.email].join(' ').toLowerCase().includes(q));
    const versPasse = quand === 'passe' && !filtreExtra;
    liste.sort((a, b) => (a.date || '').localeCompare(b.date || '') * (versPasse ? -1 : 1));
    el('liste').innerHTML = liste.map(r => {
      const reste = prix(r) - paye(r);
      return `<button class="ligne" data-id="${esc(r.id)}">
        <span><strong>${esc(nomClient(r))}</strong><small>${esc(r.tel || r.email || '')}</small></span>
        <span>${r.date ? esc(deIso(r.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })) : 'Sans date'}<small>${esc((FORMULES[r.formule] || {}).nom || '')} · ${esc(horaire(r))} · ${esc(r.nb || '?')} pers. · ${esc(BATEAUX[r.bateau] || 'bateau à attribuer')}</small></span>
        <span><span class="badge badge--${esc(r.status || 'pending')}">${esc(STATUTS[r.status || 'pending'] || '')}</span></span>
        <span class="ligne__prix">${euro(prix(r))}<small>${r.status === 'cancelled' ? '' : reste > 0 ? 'reste ' + euro(reste) : 'soldé'}</small></span>
      </button>`;
    }).join('') || '<div class="vide">Aucune réservation ne correspond.</div>';
  }
  ['f-rech', 'f-statut', 'f-quand'].forEach(id => el(id).addEventListener('input', () => { filtreExtra = null; rendreListe(); }));
  el('f-extra').addEventListener('click', () => { filtreExtra = null; rendreListe(); });
  el('liste').addEventListener('click', e => { const l = e.target.closest('[data-id]'); if (l) ouvrir(l.dataset.id); });

  // ── Statistiques ──
  function rendreStats() {
    const annees = [...new Set(reservations.map(r => (r.date || '').slice(0, 4)).filter(Boolean).concat(String(new Date().getFullYear())))].sort();
    const choix = el('s-annee');
    const anCivil = String(new Date().getFullYear());
    const avecResa = annees.filter(a => reservations.some(r => (r.date || '').startsWith(a)));
    const courante = annees.includes(choix.value) ? choix.value : (avecResa.find(a => a >= anCivil) || anCivil);
    choix.innerHTML = annees.map(a => `<option${a === courante ? ' selected' : ''}>${a}</option>`).join('');
    const an = reservations.filter(r => (r.date || '').startsWith(courante) && r.status !== 'cancelled');
    const somme = (l, f) => l.reduce((s, r) => s + f(r), 0);
    const ca = somme(an, prix), encaisse = somme(an, paye);

    const kpis = [
      ['Réservations', an.length, () => true],
      ['Chiffre d\'affaires', euro(ca), () => true],
      ['Déjà encaissé', euro(encaisse), r => paye(r) > 0],
      ['Reste à encaisser', euro(ca - encaisse), r => prix(r) - paye(r) > 0],
    ];
    el('kpis').innerHTML = kpis.map((k, i) => `<button class="kpi" data-kpi="${i}"><strong>${esc(k[1])}</strong><span>${esc(k[0])}</span></button>`).join('');
    el('kpis').onclick = e => {
      const b = e.target.closest('[data-kpi]'); if (!b) return;
      const k = kpis[b.dataset.kpi];
      detail(`${k[0]} ${courante}`, r => (r.date || '').startsWith(courante) && r.status !== 'cancelled' && k[2](r));
    };

    const parMois = MOIS.map((_, i) => an.filter(r => Number(r.date.slice(5, 7)) === i + 1));
    const maxMois = Math.max(1, ...parMois.map(l => somme(l, prix)));
    el('mois').innerHTML = parMois.map((l, i) => `<button class="rang" data-mois="${i}">
      <span>${MOIS[i]}</span><span class="rang__barre"><i style="width:${somme(l, prix) / maxMois * 100}%"></i></span>
      <span class="rang__val">${euro(somme(l, prix))} <small>· ${l.length} rés.</small></span></button>`).join('');
    el('mois').onclick = e => {
      const b = e.target.closest('[data-mois]'); if (!b) return;
      const m = String(Number(b.dataset.mois) + 1).padStart(2, '0');
      detail(`${MOIS[b.dataset.mois]} ${courante}`, r => (r.date || '').startsWith(`${courante}-${m}`) && r.status !== 'cancelled');
    };

    const maxF = Math.max(1, ...Object.keys(FORMULES).map(f => somme(an.filter(r => r.formule === f), prix)));
    el('formules').innerHTML = Object.entries(FORMULES).map(([f, def]) => {
      const l = an.filter(r => r.formule === f);
      return `<button class="rang rang--large" data-formule="${f}"><span>${def.nom}</span><span class="rang__barre"><i style="width:${somme(l, prix) / maxF * 100}%"></i></span>
        <span class="rang__val">${euro(somme(l, prix))} <small>· ${l.length} rés.</small></span></button>`;
    }).join('');
    el('formules').onclick = e => {
      const b = e.target.closest('[data-formule]'); if (!b) return;
      detail(`${FORMULES[b.dataset.formule].nom} ${courante}`, r => (r.date || '').startsWith(courante) && r.status !== 'cancelled' && r.formule === b.dataset.formule);
    };
  }
  el('s-annee').addEventListener('change', rendreStats);
  function detail(libelle, test) {
    filtreExtra = { libelle, test };
    el('f-rech').value = '';
    rendreListe();
    montrer('liste');
  }

  // ── Fiche ──
  el('r-formule').innerHTML = Object.entries(FORMULES).map(([v, f]) => `<option value="${v}">${f.nom} · ${heure(f.debut)} – ${heure(f.fin)} · ${f.prix} €</option>`).join('');
  el('r-options').innerHTML = Object.entries(OPTIONS).map(([id, o]) => `<label><input type="checkbox" value="${id}">${o.nom} (+${o.prix} €${o.forfait ? '' : ' / pers.'})</label>`).join('');

  function choisir(groupe, valeur) {
    el(groupe).querySelectorAll('button').forEach(b => b.classList.toggle('actif', b.dataset.v === valeur));
  }
  const choisi = groupe => (el(groupe).querySelector('button.actif') || {}).dataset?.v || '';
  el('r-moyen').addEventListener('click', e => { const b = e.target.closest('button'); if (b) choisir('r-moyen', choisi('r-moyen') === b.dataset.v ? '' : b.dataset.v); });
  el('r-statut').addEventListener('click', e => { const b = e.target.closest('button'); if (b) choisir('r-statut', b.dataset.v); });

  function calculFiche() {
    const nb = Number(el('r-nb').value) || 1;
    const ids = [...el('r-options').querySelectorAll('input:checked')].map(c => c.value);
    const options = ids.reduce((s, id) => s + OPTIONS[id].prix * (OPTIONS[id].forfait ? 1 : nb), 0);
    const calc = (FORMULES[el('r-formule').value] || {}).prix + options;
    const saisi = el('r-prix').value.trim();
    const total = saisi === '' ? calc : Number(saisi) || 0;
    el('r-calc').textContent = euro(calc);
    el('r-reste').textContent = euro(total - (Number(el('r-acompte').value) || 0));
    return { ids, options, calc, total };
  }
  el('fiche').addEventListener('input', calculFiche);

  function ouvrir(id, date) {
    const r = id ? reservations.find(x => x.id === id) : { status: 'confirmed', date: date || '', nb: 4, formule: 'soiree', bateau: 'indifferent', options: [] };
    if (!r) return;
    enCours = id || null;
    el('fiche-titre').textContent = id ? 'Modifier la réservation' : 'Nouvelle réservation';
    el('fiche-suppr').hidden = !id;
    el('r-prenom').value = r.prenom || ''; el('r-nom').value = r.nom || '';
    el('r-tel').value = r.tel || ''; el('r-email').value = r.email || '';
    el('r-date').value = r.date || ''; el('r-formule').value = FORMULES[r.formule] ? r.formule : 'soiree';
    el('r-bateau').value = BATEAUX[r.bateau] ? r.bateau : 'indifferent';
    el('r-nb').value = r.nb || 4;
    el('r-options').querySelectorAll('input').forEach(c => { c.checked = (r.options || []).includes(c.value); });
    el('r-acompte').value = paye(r);
    el('r-note').value = r.noteInterne || '';
    choisir('r-moyen', r.moyenPaiement || '');
    choisir('r-statut', r.status || 'pending');
    el('r-prix').value = '';
    const { calc } = calculFiche();
    if (id && r.totalPrice != null && Number(r.totalPrice) !== calc) { el('r-prix').value = r.totalPrice; calculFiche(); }
    el('r-infos').textContent = [
      r.occasion && `Occasion : ${r.occasion}`,
      r.codePartenaire && `Code partenaire : ${r.codePartenaire}`,
      r.message && `Message du client : ${r.message}`,
    ].filter(Boolean).join('\n');
    el('fond').hidden = false;
  }
  function fermer() { el('fond').hidden = true; enCours = null; }
  el('btn-nouveau').addEventListener('click', () => ouvrir(null));
  el('fiche-fermer').addEventListener('click', fermer);
  el('fond').addEventListener('mousedown', e => { if (e.target === el('fond')) fermer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el('fond').hidden) fermer(); });

  el('fiche').addEventListener('submit', async e => {
    e.preventDefault();
    const c = calculFiche();
    const data = {
      type: 'bateau',
      prenom: el('r-prenom').value.trim(), nom: el('r-nom').value.trim(),
      tel: el('r-tel').value.trim(), email: el('r-email').value.trim(),
      date: el('r-date').value, formule: el('r-formule').value, bateau: el('r-bateau').value,
      nb: Number(el('r-nb').value) || 1,
      options: c.ids, optionsPrice: c.options, totalPrice: c.total,
      acompte: Number(el('r-acompte').value) || 0,
      moyenPaiement: choisi('r-moyen'), status: choisi('r-statut') || 'pending',
      noteInterne: el('r-note').value.trim(),
    };
    const bouton = el('fiche-ok');
    bouton.disabled = true;
    try {
      if (enCours) await db.collection('reservations').doc(enCours).update(data);
      else await db.collection('reservations').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      toast(enCours ? 'Réservation modifiée' : 'Réservation créée');
      fermer();
    } catch (err) {
      toast('Enregistrement impossible : ' + err.message);
    } finally {
      bouton.disabled = false;
    }
  });

  el('fiche-suppr').addEventListener('click', async () => {
    if (!enCours || !confirm('Supprimer définitivement cette réservation ? Pour garder une trace, passez-la plutôt en « Annulée ».')) return;
    try {
      await db.collection('reservations').doc(enCours).delete();
      toast('Réservation supprimée');
      fermer();
    } catch (err) {
      toast('Suppression impossible : ' + err.message);
    }
  });
})();
