import dotenv from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

let db = null;
let auth = null;

function normalizePrivateKey(privateKey) {
  const value = String(privateKey || "").trim();
  if (!value) return "";
  return value.replace(/\\n/g, "\n");
}

function createFirebaseCredentials() {
  const serviceAccountJson = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ""
  ).trim();

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    return cert(parsed);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }

  return cert({
    projectId,
    clientEmail,
    privateKey,
  });
}

export async function connectDB() {
  if (db) return db;

  if (!getApps().length) {
    initializeApp({
  credential: createFirebaseCredentials(),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // 👈 ADD THIS
});
  }

  db = getFirestore();
  auth = getAdminAuth();

  console.log("Firebase initialized");
  return db;
}

export function getDB() {
  if (!db) throw new Error("DB not initialized. Call connectDB() first.");
  return db;
}

export function getAuthService() {
  if (!auth) throw new Error("Auth not initialized. Call connectDB() first.");
  return auth;
}

export async function closeDB() {
  db = null;
  auth = null;
}

export function toPlainDoc(snapshot) {
  if (!snapshot || !snapshot.exists) return null;
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export function toPlainDocs(snapshot) {
  if (!snapshot?.docs) return [];
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
