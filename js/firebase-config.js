// Projet Firebase « bbq-boat-des-graves ». Les règles d'accès sont dans firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyDCAYly2k46L8vtFsKvAx451uzkcjPPuRY",
  authDomain: "bbq-boat-des-graves.firebaseapp.com",
  projectId: "bbq-boat-des-graves",
  storageBucket: "bbq-boat-des-graves.firebasestorage.app",
  messagingSenderId: "155820712785",
  appId: "1:155820712785:web:f064b9f7284eac2b44a970",
  measurementId: "G-VK0DW4FFQ2"
};

let db;
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
}
