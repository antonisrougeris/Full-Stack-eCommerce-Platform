import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import { z } from "zod";
import {
  createVerifiedReview,
  getReviewsForProduct,
} from "../services/review.service.js";
import { parseOrThrow } from "../utils/validators.js";

const reviewSchema = z.object({
  name: z.string().trim().min(2).max(80),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(5).max(1000),
});

export const listReviews = asyncHandler(async (req, res) => {
  const reviews = await getReviewsForProduct(req.params.productId);
  return ok(res, { reviews });
});

export const createReview = asyncHandler(async (req, res) => {
  const input = parseOrThrow(reviewSchema, req.body, "Invalid review data");
  const review = await createVerifiedReview(
    req.user.uid,
    req.params.productId,
    input
  );
  return ok(res, { review }, 201);
});