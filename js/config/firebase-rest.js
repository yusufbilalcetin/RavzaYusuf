// Firebase projesinin kimliği — SDK yüklemeden (REST ile) erişmek isteyen yerler için.
// firebase-config.js de bunu kullanır: tek doğruluk kaynağı, iki dosyanın ayrışması engellenir.
// apiKey gizli bir bilgi değildir; erişimi Firestore kuralları belirler.
export const FIREBASE_PROJECT_ID = "ravzayusufders";
export const FIREBASE_API_KEY = "AIzaSyDZeqnBWLicZ7wj2-O3NMNAnUFAkTkl5HA";

/** Firestore REST belge adresi: firestoreDocUrl("admin_meta/couples-wheel") */
export function firestoreDocUrl(path) {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}`
    + `/databases/(default)/documents/${path}?key=${FIREBASE_API_KEY}`;
}
