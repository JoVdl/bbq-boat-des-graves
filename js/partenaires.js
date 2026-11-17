// ================================================================
// Offre partenaires — règles de remise + vérification du code
// Utilisé par le formulaire de pré-réservation.
//
// Collection Firestore "partenaires" : un document par partenaire,
// l'identifiant du document EST le code (ex. "CHATEAUXXX27").
//   { nom, code, actif, note, createdAt }
//
// Règles Firestore à ajouter dans la console Firebase :
//   match /partenaires/{code} {
//     allow get: if true;                      // le site vérifie un code précis
//     allow list, create, update, delete: if request.auth != null;  // admin seulement
//   }
// ================================================================

const PartenairesRules = {
  // Prix plein tarif par bateau
  PRIX: { 'petit-dej': 70, 'midi': 210, 'apres-midi': 110, 'soiree': 210, 'demi-matin': 270, 'demi-soir': 270 },

  // Formules du vendredi soir (remise réduite)
  FORMULES_SOIR: ['soiree', 'demi-soir'],

  // Code propre : majuscules, lettres/chiffres/tirets uniquement
  normalize(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30);
  },

  // Dimanche de Pâques (algorithme grégorien)
  _easter(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  },

  // Jours fériés français (métropole) d'une année : ensemble de "YYYY-MM-DD"
  holidays(year) {
    const pad = n => String(n).padStart(2, '0');
    const fixed = [[1, 1], [5, 1], [5, 8], [7, 14], [8, 15], [11, 1], [11, 11], [12, 25]]
      .map(([m, d]) => `${year}-${pad(m)}-${pad(d)}`);
    const easter = this._easter(year);
    const plus = n => {
      const t = new Date(easter.getTime() + n * 86400000);
      return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    };
    return new Set([...fixed, plus(1), plus(39), plus(50)]); // lundi de Pâques, Ascension, lundi de Pentecôte
  },

  // Pourcentage de remise pour une date "YYYY-MM-DD" et une formule.
  // 15 % : week-end, jours fériés, vendredi soir (formules soirée), juillet-août.
  // 25 % : lundi-vendredi, septembre à juin.
  remisePct(dateStr, formule) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
    if (m === 7 || m === 8) return 15;
    if (dow === 0 || dow === 6) return 15;
    if (this.holidays(y).has(dateStr)) return 15;
    if (dow === 5 && this.FORMULES_SOIR.includes(formule)) return 15;
    return 25;
  },

  prixRemise(formule, pct) {
    const base = this.PRIX[formule];
    if (base == null || pct == null) return null;
    return Math.round(base * (100 - pct)) / 100;
  },

  fmtEuro(n) {
    return (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  },

  // Vérifie un code auprès de Firestore. Retourne :
  //   { status: 'valid', nom }  | { status: 'invalid' } | { status: 'unknown' } (vérification impossible)
  async check(code) {
    const c = this.normalize(code);
    if (!c) return { status: 'empty' };
    if (!db) return { status: 'unknown' };
    try {
      const snap = await db.collection('partenaires').doc(c).get();
      if (!snap.exists) return { status: 'invalid' };
      const p = snap.data() || {};
      if (p.actif === false) return { status: 'invalid' };
      return { status: 'valid', nom: p.nom || c };
    } catch (err) {
      console.warn('[Partenaires] vérification impossible :', err.message);
      return { status: 'unknown' };
    }
  },
};

window.PartenairesRules = PartenairesRules;
