/*  3220089_3220172   2025 */

// Initializes a responsive mobile navigation menu (hamburger button).
// Handles accessibility (ARIA), closing behavior, and optional scroll locking.

interface MenuOptions {
  toggleSelector?: string;
  navSelector?: string;
  openClass?: string;
  lockScroll?: boolean;
}

export function initMobileMenu(options: MenuOptions = {}) {
  const {
    toggleSelector = "#menuToggle", // Button that opens/closes the menu
    navSelector = "#mainNav", // Nav container
    openClass = "nav-open", // Class placed on <html> when menu is open
  } = options;

  // Grab DOM elements
  const toggleBtn = document.querySelector(
    toggleSelector
  ) as HTMLButtonElement | null;
  const nav = document.querySelector(navSelector) as HTMLElement | null;

  // If elements are missing on this page, do nothing (safe module)
  if (!toggleBtn || !nav) return;

  // Prevent duplicate listener binding (even if this module is imported twice)
  if (toggleBtn.dataset.mobileMenuInitialized === "true") return;
  toggleBtn.dataset.mobileMenuInitialized = "true";

  // --- Accessibility defaults ---
  // aria-expanded tells screen readers if the menu is open
  if (!toggleBtn.hasAttribute("aria-expanded"))
    toggleBtn.setAttribute("aria-expanded", "false");
  // aria-controls points to the nav id this button controls
  if (!toggleBtn.hasAttribute("aria-controls"))
    toggleBtn.setAttribute("aria-controls", nav.id || "mainNav");
  // Ensure button type is set (prevents accidental form submit)
  if (!toggleBtn.hasAttribute("type")) toggleBtn.setAttribute("type", "button");

  // Ensure nav has an id for aria-controls to work
  if (!nav.id) nav.id = "mainNav";

  // We toggle a class on <html> so CSS can show/hide the nav
  const root = document.documentElement;

  // Helper: check open state
  const isOpen = () => root.classList.contains(openClass);

  // Helper: apply open/close state
  const setOpen = (open: boolean) => {
    root.classList.toggle(openClass, open);
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");

    // Μην κλειδώνεις scroll στο mobile menu
    document.body.style.overflow = "";
  };

  const toggle = () => setOpen(!isOpen());

  // Click on the hamburger button toggles menu
  toggleBtn.addEventListener("click", toggle);

  // Pressing ESC closes the menu
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) setOpen(false);
  });

  // Clicking a link inside the nav closes the menu (mobile UX)
  nav.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest("a");
    if (link && isOpen()) setOpen(false);
  });

  console.log("Mobile menu initialized successfully");

  // Αν ο χρήστης αρχίσει scroll/touch, κλείσε το menu
  window.addEventListener(
    "scroll",
    () => {
      if (isOpen()) setOpen(false);
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    () => {
      if (isOpen()) setOpen(false);
    },
    { passive: true }
  );
}
