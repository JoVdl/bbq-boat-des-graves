(function () {
  const PRIX = PartenairesRules.PRIX;
  const LIBELLES = {
    'petit-dej': 'Petit déjeuner · 9 h – 10 h 30',
    'midi': 'Déjeuner · 11 h 30 – 14 h 30',
    'apres-midi': 'Après-midi · 15 h 30 – 17 h 30',
    'soiree': 'Soirée · 18 h – 21 h',
    'demi-matin': 'Demi-journée · 10 h – 15 h',
    'demi-soir': 'Demi-journée · 16 h – 20 h',
  };
  const OUVERTURE = '2027-04-01';

  const el = id => document.getElementById(id);
  const form = el('boat-booking-form');
  const retour = el('bf-retour');
  const dateInput = el('bf-date');
  const codeInput = el('bf-code');

  function dateMin() {
    const d = new Date();
    const auj = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return auj > OUVERTURE ? auj : OUVERTURE;
  }
  dateInput.min = dateMin();

  function dateFR(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formuleChoisie() {
    return (document.querySelector('input[name="bformule"]:checked') || {}).value || '';
  }

  function calcul() {
    const formule = formuleChoisie();
    const nb = parseInt(el('bf-nb').value, 10);
    const base = PRIX[formule] || 0;
    const cases = Array.from(document.querySelectorAll('.boat-opt-cb:checked'));
    const options = cases.reduce((s, cb) => {
      const p = parseInt(cb.dataset.price, 10) || 0;
      return s + (cb.dataset.flat === 'true' ? p : p * nb);
    }, 0);
    return { formule, nb, base, options, total: base + options, ids: cases.map(cb => cb.id) };
  }

  function majRecap() {
    const c = calcul();
    const date = dateInput.value;
    el('bsum-formule').textContent = c.formule ? LIBELLES[c.formule] : '—';
    el('bsum-date').textContent = date ? dateFR(date) : '—';
    el('bsum-nb').textContent = `${c.nb} personnes`;
    el('bsum-base').textContent = c.formule ? `${c.base} €` : '—';
    el('bsum-opts').textContent = c.options ? `+${c.options} €` : '—';
    el('bsum-total').textContent = c.formule ? `${c.total} €` : '—';
    el('bsum-par-pers').textContent = c.formule ? `Soit environ ${Math.round(c.total / c.nb)} € par personne.` : '';
  }

  function message(texte, type) {
    retour.innerHTML = '';
    if (!texte) return;
    const div = document.createElement('div');
    div.className = `message message--${type}`;
    div.textContent = texte;
    retour.appendChild(div);
  }

  // Retour immédiat sous le champ « Code partenaire »
  const note = document.createElement('div');
  note.id = 'bf-code-note';
  codeInput.insertAdjacentElement('afterend', note);
  let minuteur = null;
  let sequence = 0;

  async function majCode() {
    const moi = ++sequence;
    const code = PartenairesRules.normalize(codeInput.value);
    note.style.color = '';
    if (!code) { note.textContent = ''; return; }
    note.textContent = 'Vérification du code…';
    const res = await PartenairesRules.check(code);
    if (moi !== sequence) return;
    if (res.status === 'invalid') {
      note.textContent = 'Code non reconnu. Vérifiez la saisie ou laissez le champ vide.';
      note.style.color = 'var(--erreur)';
      return;
    }
    if (res.status === 'unknown') {
      note.textContent = 'Votre code sera vérifié par nos soins avant l\'envoi du lien de paiement.';
      return;
    }
    const formule = formuleChoisie();
    const date = dateInput.value;
    let detail = 'Choisissez une date et une formule pour voir la remise.';
    if (date && formule) {
      const pct = PartenairesRules.remisePct(date, formule);
      const prix = PartenairesRules.prixRemise(formule, pct);
      detail = `Remise de ${pct} % sur la location : ${PartenairesRules.fmtEuro(PRIX[formule])} → ${PartenairesRules.fmtEuro(prix)}.`;
    }
    note.textContent = `Code « ${res.nom} » reconnu. ${detail} Sous réserve d'une preuve d'achat chez ce partenaire.`;
    note.style.color = 'var(--ok)';
  }

  codeInput.addEventListener('input', () => { clearTimeout(minuteur); minuteur = setTimeout(majCode, 350); });
  form.addEventListener('change', () => { majRecap(); if (codeInput.value.trim()) majCode(); });
  majRecap();

  // Boutons « Choisir » des cartes de formules
  document.querySelectorAll('[data-formule]').forEach(lien => {
    lien.addEventListener('click', () => {
      const radio = document.querySelector(`input[name="bformule"][value="${lien.dataset.formule}"]`);
      if (radio) { radio.checked = true; majRecap(); }
    });
  });

  // Menu mobile
  const menu = el('menu');
  el('burger').addEventListener('click', () => menu.classList.toggle('ouvert'));
  menu.addEventListener('click', e => { if (e.target.tagName === 'A') menu.classList.remove('ouvert'); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const c = calcul();
    const prenom = el('bf-prenom').value.trim();
    const nom = el('bf-nom').value.trim();
    const email = el('bf-email').value.trim();
    const tel = el('bf-tel').value.trim();
    const date = dateInput.value;

    if (!prenom || !nom || !email || !tel || !c.formule || !date) {
      message('Merci de remplir tous les champs marqués d\'une étoile, et de choisir une formule.', 'erreur');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message('L\'adresse email ne semble pas valide.', 'erreur');
      return;
    }
    if (date < dateMin()) {
      message(`Les sorties commencent le ${dateFR(dateMin())}. Merci de choisir une date à partir de ce jour.`, 'erreur');
      return;
    }
    if (!db) {
      message('Les pré-réservations en ligne ouvrent très bientôt. En attendant, appelez-nous au 06 72 51 47 14.', 'erreur');
      return;
    }

    const bouton = form.querySelector('[type="submit"]');
    const libelleBouton = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'Envoi en cours…';

    try {
      const codePartenaire = PartenairesRules.normalize(codeInput.value);
      if (codePartenaire && (await PartenairesRules.check(codePartenaire)).status === 'invalid') {
        message('Code partenaire non reconnu. Corrigez-le ou videz le champ.', 'erreur');
        return;
      }
      await db.collection('reservations').add({
        type: 'bateau', status: 'pending',
        prenom, nom, email, tel,
        bateau: el('bf-bateau').value, formule: c.formule, date, nb: c.nb,
        options: c.ids, optionsPrice: c.options, totalPrice: c.total,
        occasion: el('bf-occasion').value, message: el('bf-message').value.trim(),
        codePartenaire,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      form.reset();
      dateInput.min = dateMin();
      note.textContent = '';
      majRecap();
      message(`Demande bien reçue, ${prenom} ! Nous vous confirmons la date par email ou par téléphone sous 24 h.`, 'ok');
    } catch (err) {
      console.error('[Réservation]', err);
      message('L\'envoi n\'a pas abouti. Réessayez dans un instant, ou appelez-nous au 06 72 51 47 14.', 'erreur');
    } finally {
      bouton.disabled = false;
      bouton.textContent = libelleBouton;
    }
  });
})();
