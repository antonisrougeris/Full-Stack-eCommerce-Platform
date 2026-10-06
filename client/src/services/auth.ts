/* 3220089_3220172 */

import { firebaseAuth } from "./firebase";

/**
 * Firebase owns authentication persistence. We deliberately do not copy
 * Firebase ID tokens into localStorage, where any successful XSS could read
 * them directly.
 */
export function isLoggedIn(): boolean {
  return Boolean(firebaseAuth.currentUser);
}

export async function waitForAuthReady(): Promise<void> {
  await firebaseAuth.authStateReady();
}
