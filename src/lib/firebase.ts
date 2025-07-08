import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDie1gthf0EGD0ok9sbLzoLbVDe42jy_y8",
  authDomain: "recruitment-portal-7b629.firebaseapp.com",
  projectId: "recruitment-portal-7b629",
  storageBucket: "recruitment-portal-7b629.firebasestorage.app",
  messagingSenderId: "46109245906",
  appId: "1:46109245906:web:f618473d43abbe44d3480b",
  measurementId: "G-LEY4Y8K52G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app; 