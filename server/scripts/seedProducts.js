import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// φορτώνει env από server/.env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function buildServiceAccountFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase env vars. Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  // Αν το private key είναι αποθηκευμένο με \n στο env
  privateKey = privateKey.replace(/\\n/g, "\n");

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

async function initFirebase() {
  if (admin.apps.length) {
    return admin.firestore();
  }

  const serviceAccount = buildServiceAccountFromEnv();

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin.firestore();
}

async function readProductsFile() {
  const productsPath = path.resolve(__dirname, "../products.json");
  const raw = await fs.readFile(productsPath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("products.json must contain an array of products");
  }

  return parsed;
}

function normalizeProduct(product) {
  const id = String(product.id || "").trim();

  if (!id) {
    throw new Error("Every product must have a non-empty id");
  }

  const slug =
    product.slug ||
    id
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

  const price =
    typeof product.price === "number"
      ? product.price
      : typeof product.priceEUR === "number"
      ? product.priceEUR
      : 0;

  const images = Array.isArray(product.images)
    ? product.images.filter(Boolean)
    : [];

  const stock =
    typeof product.stock === "number"
      ? product.stock
      : Array.isArray(product.variants)
      ? product.variants.reduce(
          (sum, variant) => sum + Number(variant?.stock || 0),
          0
        )
      : 0;

return {
  id,
  slug,
  title: product.title || "",
  shortDescription: product.shortDescription || "",
  description: product.description || "",
  translations: {
    el: {
      title:
        String(product?.translations?.el?.title || "").trim(),
      shortDescription:
        String(product?.translations?.el?.shortDescription || "").trim(),
      description:
        String(product?.translations?.el?.description || "").trim(),
    },
  },
  category: product.category || "general",
  price,
  priceEUR: typeof product.priceEUR === "number" ? product.priceEUR : price,
  images,
  image: product.image || images[0] || "",
  stock,
  featured: product.featured === true,
  active: product.active !== false,
  badge: product.badge || "",
  customQr: Boolean(product.customQr),

  // ✅ NEW FIELD
qrConfig: {
  textPrint: product?.qrConfig?.textPrint ?? "",
  textPosition: product?.qrConfig?.textPosition || "bottom",
  qrColor: product?.qrConfig?.qrColor || product?.qrConfig?.color || "#000000",
  textColor: product?.qrConfig?.textColor || product?.qrConfig?.qrColor || product?.qrConfig?.color || "#000000",
  size: product?.qrConfig?.size || 3540,
},

  variants: Array.isArray(product.variants) ? product.variants : [],
  reviews: Array.isArray(product.reviews) ? product.reviews : [],

  createdAt: product.createdAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
}

async function seedProducts() {
  const db = await initFirebase();
  const products = await readProductsFile();

  console.log(`Found ${products.length} products in products.json`);

  const batch = db.batch();
  const collectionRef = db.collection("products");

  for (const rawProduct of products) {
    const product = normalizeProduct(rawProduct);
    const docRef = collectionRef.doc(product.id);

    batch.set(docRef, product, { merge: true });
  }

  await batch.commit();

  console.log(
    `Seed completed successfully. Inserted/updated ${products.length} products.`
  );
}

seedProducts()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
