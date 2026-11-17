// Configuration du projet Firebase « bbq-boat-des-graves ».
// À remplacer par le bloc firebaseConfig de la console Firebase
// (Paramètres du projet > Vos applications > Application web).
const firebaseConfig = null;

let db;
if (firebaseConfig && typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
}
