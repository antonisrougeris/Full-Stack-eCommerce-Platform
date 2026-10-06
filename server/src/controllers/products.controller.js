import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import {
  listProductsService,
  getProductByIdOrSlug,
} from "../services/product.service.js";

export const listProducts = asyncHandler(async (req, res) => {
  const products = await listProductsService(req.query || {});
  return ok(res, { products });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await getProductByIdOrSlug(
    req.params.id,
    {
      locale:
        req.query?.locale || "en",
    }
  );
  return ok(res, { product });
});
