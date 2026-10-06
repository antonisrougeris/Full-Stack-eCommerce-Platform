import { apiRequest } from "./api";
import type { ProductVariant } from "./products";

export interface CartItem {
  selectedVariant: ProductVariant | null | undefined;
  priceEUR: any;
  id: string;
  productId: string;
  title: string;
  slug?: string;
  price: number;
  currency?: string;
  quantity: number;
  image?: string;
  variant?: ProductVariant | null;
  qrDestination?: string;
}
export type GiftTier = "none" | "simple" | "premium";

export interface GiftOptions {
  tier: GiftTier;
  giftBox?: boolean;
  personalNote: string;
}

export interface Cart {
  id?: string;
  userId?: string;
  items: CartItem[];
  subtotal?: number;
  totalItems?: number;
  currency?: string;
  giftOptions?: GiftOptions;
}
export interface AddToCartPayload {
  productId: string;
  quantity?: number;
  variant?: ProductVariant | null;
  qrDestination?: string;
}
export async function getCart():Promise<Cart> {
  const res=await apiRequest<{cart:Cart}>("/cart"); return res.cart;
}
export async function addCartItem(payload:AddToCartPayload):Promise<Cart> {
  const res=await apiRequest<{cart:Cart}>("/cart/items",{method:"POST",body:JSON.stringify(payload)}); return res.cart;
}
export async function updateCartItem(itemId:string,payload:{quantity?:number;qrDestination?:string}):Promise<Cart> {
  const res=await apiRequest<{cart:Cart}>(`/cart/items/${encodeURIComponent(itemId)}`,{method:"PATCH",body:JSON.stringify(payload)});return res.cart;
}
export async function removeCartItem(itemId:string):Promise<Cart> {
  const res=await apiRequest<{cart:Cart}>(`/cart/items/${encodeURIComponent(itemId)}`,{method:"DELETE"});return res.cart;
}
export async function transferCartToGuest():Promise<Cart> {
  const res=await apiRequest<{cart:Cart}>("/cart/transfer-to-guest",{method:"POST"});return res.cart;
}

export async function updateCartGiftOptions(
  payload: GiftOptions
): Promise<Cart> {
  const res = await apiRequest<{cart:Cart}>("/cart/gift-options", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return res.cart;
}
