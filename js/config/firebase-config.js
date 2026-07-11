import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { FIREBASE_API_KEY, FIREBASE_PROJECT_ID } from "./firebase-rest.js";

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: "ravzayusufders.firebaseapp.com",
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: "ravzayusufders.firebasestorage.app",
  messagingSenderId: "1053035399131",
  appId: "1:1053035399131:web:2eeed2e41a3b9ef19709fe",
  measurementId: "G-5JPX2XCDH5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };