// Firebase configuration for QuantEdge Capital
// This file connects the site to your Firebase project (Auth + Firestore database)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAwHjAcczUg7lA3IWopwn5HQVk0UrNLBMI",
  authDomain: "quantedge-capital.firebaseapp.com",
  projectId: "quantedge-capital",
  storageBucket: "quantedge-capital.firebasestorage.app",
  messagingSenderId: "1097850342072",
  appId: "1:1097850342072:web:fa8e6b36c339883bf4c24d",
  measurementId: "G-XSSFLXV4V1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// The one email address treated as the site owner/admin.
// Anyone logging in with this email sees the Inbox instead of the client dashboard.
export const ADMIN_EMAIL = "addminquantedge@gmail.com";
