/* 3220089_3220172 */

import { getCart } from "../services/cart";
import { isLoggedIn, waitForAuthReady } from "../services/auth";

export function getCartCount(cart: {
  totalItems?: number;
  items?: Array<{ quantity?: number }>;
}): number {
  if (typeof cart.totalItems === "number") {
    return cart.totalItems;
  }

  if (Array.isArray(cart.items)) {
    return cart.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );
  }

  return 0;
}

export function updateCartBadgeFromCart(cart: {
  totalItems?: number;
  items?: Array<{ quantity?: number }>;
}): void {
  const cartLink =
    document.querySelector<HTMLElement>(
      "[data-cart-link]"
    );

  if (!cartLink) return;

  if (!isLoggedIn()) {
    cartLink.textContent = "Cart";
    return;
  }

  const totalItems =
    getCartCount(cart);

  cartLink.textContent =
    totalItems > 0
      ? `Cart (${totalItems})`
      : "Cart";
}

/**
 * Updates the cart badge in the navigation with the current cart item count.
 */
export async function updateCartBadge(): Promise<void> {
  const cartLink =
    document.querySelector<HTMLElement>(
      "[data-cart-link]"
    );

  if (!cartLink) return;

  try {
    await waitForAuthReady();

    if (!isLoggedIn()) {
      cartLink.textContent = "Cart";
      return;
    }

    const cart = await getCart();
    updateCartBadgeFromCart(cart);
  } catch (error) {
    console.error(
      "Failed to update cart badge:",
      error
    );

    cartLink.textContent = "Cart";
  }
}
