import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyC00IrM2gzA97hZZvt-ulnKE90SlmttIBs',
  authDomain: 'knapsak-app-887fc.firebaseapp.com',
  projectId: 'knapsak-app-887fc',
  storageBucket: 'knapsak-app-887fc.firebasestorage.app',
  messagingSenderId: '77819801145',
  appId: '1:77819801145:web:963773e36c2d7cb8e8a7e8',
  measurementId: 'G-LJV7SN2JTB',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
