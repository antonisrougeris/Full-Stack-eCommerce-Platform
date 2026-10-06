/* Marketplace-ready catalog model with variants, colors, stock and reviews. */
import { apiFetch } from "./api";
import { locale } from "../i18n/locale";

export interface ProductVariant {
  size?: string;
  color?: string;
  stock?: number;
  sku?: string;
}
export interface ProductColorOption {
  name: string;
  hex?: string;
  images: string[];
}
export interface ProductReview {
  id?: string;
  name: string;
  rating: number;
  comment: string;
  verifiedPurchase?: boolean;
  createdAt?: string;
}
export interface Product {
  _id?: string;
  id: string;
  slug?: string;
  title: string;
  shortDescription?: string;
  description?: string;
  category: string;
  price: number;
  priceEUR?: number;
  originalPrice?: number;
  discountPercent?: number;
  onSale?: boolean;
  image?: string;
  images?: string[];
  defaultColor?: string;
  colorOptions?: ProductColorOption[];
  stock?: number;
  featured?: boolean;
  active?: boolean;
  merchandisingTag?: "none" | "new" | "featured" | "best_seller" | "limited" | string;
  badge?: string;
  createdAt?: string;
  updatedAt?: string;
  variants?: ProductVariant[];
  reviews?: ProductReview[];
}
export interface GetProductsOptions {
  category?: string;
  featured?: boolean;
  active?: boolean;
  limit?: number;
}
interface ProductsResponse {
  success?: boolean;
  products?: any[];
  data?: any[];
  items?: any[];
}
interface ProductResponse {
  success?: boolean;
  product?: any;
  data?: any;
}
export function getColorImages(product: Product, color?: string): string[] {
  const option = product.colorOptions?.find(
    item => item.name.toLocaleLowerCase() === String(color || product.defaultColor || "").toLocaleLowerCase()
  );
  const images = option?.images?.filter(Boolean) || [];
  return images.length ? images : (product.images?.filter(Boolean) || (product.image ? [product.image] : []));
}
export function normalizeProduct(raw: any): Product {
  const price = typeof raw?.price === "number" ? raw.price :
    typeof raw?.priceEUR === "number" ? raw.priceEUR : 0;
  const rawImages = Array.isArray(raw?.images) ? raw.images.filter((x: unknown) => typeof x === "string") :
    raw?.image ? [raw.image] : [];
  const colors: ProductColorOption[] = Array.isArray(raw?.colorOptions) ? raw.colorOptions
    .filter((x: any) => x && typeof x.name === "string" && x.name.trim())
    .map((x: any) => ({ name: x.name.trim(), hex: typeof x.hex === "string" ? x.hex : undefined,
      images: Array.isArray(x.images) ? x.images.filter((p: unknown) => typeof p === "string") : [] })) : [];
  const preferred = colors.find(x => x.name.toLowerCase() === String(raw?.defaultColor || "").toLowerCase()) || colors[0];
  const cover = preferred?.images?.[0] || rawImages[0] || raw?.image || "";
  return {
    _id: raw?._id,
    id: raw?.id || raw?._id || "",
    slug: raw?.slug || raw?.id || raw?._id || "",
    title: raw?.title || "",
    shortDescription: raw?.shortDescription || "",
    description: raw?.description || "",
    category: raw?.category || "",
    price,
    priceEUR: typeof raw?.priceEUR === "number" ? raw.priceEUR : price,
    originalPrice: typeof raw?.originalPrice === "number" ? raw.originalPrice : price,
    discountPercent: typeof raw?.discountPercent === "number" ? raw.discountPercent : 0,
    onSale: Boolean(raw?.onSale),
    image: cover,
    images: rawImages,
    defaultColor: preferred?.name || raw?.defaultColor || "",
    colorOptions: colors,
    stock: typeof raw?.stock === "number" ? raw.stock : 0,
    featured: raw?.featured === true,
    active: raw?.active !== false,
    merchandisingTag: raw?.merchandisingTag || "none",
    badge: raw?.badge || "",
    createdAt: raw?.createdAt || "",
    updatedAt: raw?.updatedAt || "",
    variants: Array.isArray(raw?.variants) ? raw.variants : [],
    reviews: Array.isArray(raw?.reviews) ? raw.reviews : [],
  };
}
function extractProducts(payload: ProductsResponse | Product[]): Product[] {
  if (Array.isArray(payload)) return payload.map(normalizeProduct);
  if (Array.isArray(payload?.products)) return payload.products.map(normalizeProduct);
  if (Array.isArray(payload?.data)) return payload.data.map(normalizeProduct);
  if (Array.isArray(payload?.items)) return payload.items.map(normalizeProduct);
  return [];
}
export async function getProducts(options: GetProductsOptions = {}): Promise<Product[]> {
  const params = new URLSearchParams();
  if (options.category) params.set("category", options.category);
  if (typeof options.featured === "boolean") params.set("featured", String(options.featured));
  if (typeof options.active === "boolean") params.set("active", String(options.active));
  if (typeof options.limit === "number") params.set("limit", String(options.limit));
  params.set("locale", locale);
  const query = params.toString();
  const payload = await apiFetch<ProductsResponse>(`/products${query ? `?${query}` : ""}`);
  let products = extractProducts(payload);
  if (typeof options.active === "boolean") products = products.filter(p => options.active ? p.active !== false : p.active === false);
  if (typeof options.featured === "boolean") products = products.filter(p => options.featured ? p.featured === true : p.featured !== true);
  if (options.category) products = products.filter(p => p.category?.toLowerCase() === options.category!.toLowerCase());
  if (typeof options.limit === "number") products = products.slice(0, options.limit);
  return products;
}
export async function getFeaturedProducts(): Promise<Product[]> { return getProducts({ featured:true, active:true }); }
export async function getProductsByCategory(category:string): Promise<Product[]> { return getProducts({category, active:true}); }
export async function getProductById(idOrSlug:string): Promise<Product|null> {
  const payload = await apiFetch<ProductResponse>(`/products/${encodeURIComponent(idOrSlug)}?locale=${encodeURIComponent(locale)}`);
  const raw = payload?.product || payload?.data || payload;
  if (!raw || typeof raw !== "object") return null;
  return normalizeProduct(raw);
}
