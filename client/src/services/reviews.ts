import { apiRequest } from "./api";
import type { ProductReview } from "./products";

export async function getProductReviews(productId: string): Promise<ProductReview[]> {
  const response = await apiRequest<{ reviews?: ProductReview[] }>(
    `/reviews/${encodeURIComponent(productId)}`
  );
  return response.reviews || [];
}

export async function createProductReview(
  productId: string,
  payload: { name: string; rating: number; comment: string }
): Promise<ProductReview> {
  const response = await apiRequest<{ review: ProductReview }>(
    `/reviews/${encodeURIComponent(productId)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return response.review;
}