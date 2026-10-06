import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { createId, nowIso } from "../utils/ids.js";
import { getProductByIdOrSlug } from "./product.service.js";

function orderContainsProduct(order, productId) {
  return (
    order.paymentStatus === "paid" &&
    Array.isArray(order.items) &&
    order.items.some((item) => String(item.productId || item.id) === String(productId))
  );
}

export async function getReviewsForProduct(productId) {
  if (!productId) throw new ApiError(400, "Missing product id");

  const db = getDB();
  const product = await getProductByIdOrSlug(productId);
  const snapshot = await db
    .collection(COLLECTIONS.REVIEWS)
    .where("productId", "==", String(product.id))
    .get();

  const storedReviews = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const productReviews = Array.isArray(product.reviews) ? product.reviews : [];
  const merged = [...productReviews, ...storedReviews];
  const seen = new Set();

  return merged
    .filter((review) => {
      const key = review.id || `${review.name}|${review.rating}|${review.comment}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export async function createVerifiedReview(userId, productId, input) {
  if (!userId) throw new ApiError(401, "You must be signed in to review");
  if (!productId) throw new ApiError(400, "Missing product id");

  const db = getDB();
  const product = await getProductByIdOrSlug(productId);
  const ordersSnapshot = await db
    .collection(COLLECTIONS.ORDERS)
    .where("ownerId", "==", userId)
    .where("ownerType", "==", "user")
    .get();

  const purchased = ordersSnapshot.docs.some((doc) =>
    orderContainsProduct(doc.data(), productId)
  );

  if (!purchased) {
    throw new ApiError(403, "You can review products only after a completed purchase.");
  }

  const existing = await db
    .collection(COLLECTIONS.REVIEWS)
    .where("productId", "==", String(productId))
    .get();

  if (existing.docs.some((doc) => doc.data().userId === userId)) {
    throw new ApiError(409, "You have already reviewed this product.");
  }

  const review = {
    id: createId("review"),
    productId: String(productId),
    userId,
    name: input.name,
    rating: input.rating,
    comment: input.comment,
    verifiedPurchase: true,
    createdAt: nowIso(),
  };

  const productRef = db.collection(COLLECTIONS.PRODUCTS).doc(product.id);
  await db.runTransaction(async (transaction) => {
    const productSnapshot = await transaction.get(productRef);
    if (!productSnapshot.exists) {
      throw new ApiError(404, "Product not found");
    }

    const currentReviews = Array.isArray(productSnapshot.data().reviews)
      ? productSnapshot.data().reviews
      : [];

    transaction.set(
      db.collection(COLLECTIONS.REVIEWS).doc(review.id),
      review
    );
    transaction.update(productRef, {
      reviews: [...currentReviews, review],
    });
  });

  return review;
}