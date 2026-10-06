import catalog from "./catalog.json";

export type Locale = "en" | "el";

type RouteMeta = {
  title?: string;
  description?: string;
};

const supportedLocales = new Set<Locale>(["en", "el"]);
const TRANSLATED_ATTRIBUTE_NAMES = [
  "placeholder",
  "aria-label",
  "title",
] as const;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function getLocale(): Locale {
  const pathname = window.location.pathname;

  if (
    pathname === "/el" ||
    pathname.startsWith("/el/")
  ) {
    return "el";
  }

  const queryLocale =
    new URLSearchParams(
      window.location.search
    ).get("lang");

  if (
    queryLocale &&
    supportedLocales.has(
      queryLocale as Locale
    )
  ) {
    return queryLocale as Locale;
  }

  return "en";
}

export const locale: Locale = getLocale();

export function isGreek(): boolean {
  return locale === "el";
}

export function t(
  key: string,
  fallback?: string
): string {
  if (locale === "en") {
    return fallback ?? key;
  }

  const messages =
    catalog.messages?.el as
      | Record<string, string>
      | undefined;

  return (
    messages?.[key] ??
    fallback ??
    key
  );
}

export function translatePhrase(
  value: string
): string {
  if (locale !== "el") {
    return value;
  }

  const key = normalizeWhitespace(value);

  if (!key) {
    return value;
  }

  const phrases =
    catalog.phrases as Record<
      string,
      string
    >;

  return phrases[key] ?? value;
}

export function normalizePublicPath(
  rawPath: string
): string {
  let path = String(rawPath || "/")
    .split("?")[0]
    .split("#")[0];

  if (
    path === "/el" ||
    path.startsWith("/el/")
  ) {
    path =
      path.slice(3) || "/";
  }

  const legacyMap: Record<string, string> = {
    "/index.html": "/",
    "/src/pages/products/products.html":
      "/products",
    "/src/pages/product-details/product-details.html":
      "/product",
    "/src/pages/cart/cart.html":
      "/cart",
    "/src/pages/checkout/checkout.html":
      "/checkout",
    "/src/pages/login/login.html":
      "/login",
    "/src/pages/register/register.html":
      "/register",
    "/src/pages/forgot-password/forgot-password.html":
      "/forgot-password",
    "/src/pages/verify-email/verify-email.html":
      "/verify-email",
    "/src/pages/my-qr/my-qr.html":
      "/my-qr",
    "/src/pages/contact/contact.html":
      "/contact",
    "/src/pages/about/about.html":
      "/about",
    "/src/pages/returns/returns.html":
      "/returns",
    "/src/pages/payment/payment_success.html":
      "/payment/success",
    "/src/pages/payment/payment_failure.html":
      "/payment/failure",
    "/src/pages/payment-security/payment-security.html":
      "/payment-security",
    "/src/pages/shipping-policy/shipping-policy.html":
      "/shipping-policy",
    "/src/pages/refund-policy/refund-policy.html":
      "/refund-policy",
    "/src/pages/privacy-policy/privacy-policy.html":
      "/privacy-policy",
    "/src/pages/terms/terms.html":
      "/terms",
    "/src/pages/cookie-policy/cookie-policy.html":
      "/cookie-policy",
  };

  return legacyMap[path] ?? path;
}

function isProductDetailPath(
  path: string
): boolean {
  return /^\/product\/[^/]+\/?$/.test(
    path
  );
}

export function localizedPath(
  rawPath: string,
  targetLocale: Locale
): string {
  const url = new URL(
    rawPath,
    window.location.origin
  );

  let cleanPath =
    normalizePublicPath(url.pathname);

  if (cleanPath.length > 1) {
    cleanPath =
      cleanPath.replace(/\/+$/, "");
  }

  const params =
    new URLSearchParams(url.search);

  /*
   * Product detail pages intentionally stay on /product/:slug.
   * Production Nginx already routes that path to the Express SEO
   * handler. The Greek locale travels in the query instead.
   */
  params.delete("lang");

  let localized: string;

  if (
    targetLocale === "el" &&
    isProductDetailPath(cleanPath)
  ) {
    localized = cleanPath;
    params.set("lang", "el");
  } else {
    localized =
      targetLocale === "el"
        ? cleanPath === "/"
          ? "/el/"
          : `/el${cleanPath}`
        : cleanPath;
  }

  const query = params.toString();

  return (
    localized +
    (query ? `?${query}` : "") +
    url.hash
  );
}

export function productPath(
  identifier: string
): string {
  const base =
    `/product/${encodeURIComponent(identifier)}`;

  return localizedPath(
    base,
    locale
  );
}

export function localizedHref(
  href: string
): string {
  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("//") ||
    href.startsWith("/api/")
  ) {
    return href;
  }

  return localizedPath(
    href,
    locale
  );
}

function translateTextNode(
  node: Text
): void {
  if (locale !== "el") return;

  const parent =
    node.parentElement;

  if (
    !parent ||
    parent.closest(
      "[data-no-i18n], script, style, pre, code"
    )
  ) {
    return;
  }

  const original = node.nodeValue ?? "";
  const trimmed =
    normalizeWhitespace(original);

  if (!trimmed) return;

  const translated =
    translatePhrase(trimmed);

  if (translated === trimmed) {
    return;
  }

  const leading =
    original.match(/^\s*/)?.[0] ?? "";

  const trailing =
    original.match(/\s*$/)?.[0] ?? "";

  node.nodeValue =
    leading +
    translated +
    trailing;
}

function translateElementAttributes(
  element: Element
): void {
  if (
    locale !== "el" ||
    element.closest(
      "[data-no-i18n]"
    )
  ) {
    return;
  }

  for (
    const attribute of
    TRANSLATED_ATTRIBUTE_NAMES
  ) {
    const value =
      element.getAttribute(
        attribute
      );

    if (!value) continue;

    const translated =
      translatePhrase(value);

    if (translated !== value) {
      element.setAttribute(
        attribute,
        translated
      );
    }
  }
}

function localizeInternalLink(
  element: HTMLAnchorElement
): void {
  const href =
    element.getAttribute("href");

  if (!href) return;

  const localized =
    localizedHref(href);

  if (localized !== href) {
    element.setAttribute(
      "href",
      localized
    );
  }
}

export function translateSubtree(
  root: ParentNode = document
): void {
  if (locale === "el") {
    const walker =
      document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT
      );

    let current =
      walker.nextNode();

    while (current) {
      translateTextNode(
        current as Text
      );

      current =
        walker.nextNode();
    }

    const elements =
      root instanceof Element
        ? [root, ...root.querySelectorAll("*")]
        : Array.from(
            root.querySelectorAll("*")
          );

    elements.forEach(
      translateElementAttributes
    );
  }

  const anchors =
    root instanceof HTMLAnchorElement
      ? [
          root,
          ...root.querySelectorAll<HTMLAnchorElement>(
            "a[href]"
          ),
        ]
      : Array.from(
          root.querySelectorAll<HTMLAnchorElement>(
            "a[href]"
          )
        );

  anchors.forEach(
    localizeInternalLink
  );
}

function currentRouteKey(): string {
  const path =
    normalizePublicPath(
      window.location.pathname
    );

  if (
    path.startsWith(
      "/product/"
    )
  ) {
    return "/product";
  }

  return path;
}

function upsertMeta(
  name: string,
  content: string
): void {
  let meta =
    document.querySelector<HTMLMetaElement>(
      `meta[name="${name}"]`
    );

  if (!meta) {
    meta =
      document.createElement(
        "meta"
      );

    meta.name = name;

    document.head.appendChild(
      meta
    );
  }

  meta.content = content;
}

function upsertAlternate(
  hreflang: string,
  href: string
): void {
  let link =
    document.querySelector<HTMLLinkElement>(
      `link[rel="alternate"][hreflang="${hreflang}"]`
    );

  if (!link) {
    link =
      document.createElement(
        "link"
      );

    link.rel = "alternate";
    link.hreflang =
      hreflang;

    document.head.appendChild(
      link
    );
  }

  link.href = href;
}

function applyMetadata(): void {
  document.documentElement.lang =
    locale;

  const route =
    currentRouteKey();

  if (locale === "el") {
    const meta =
      (
        catalog.routeMeta as
          Record<
            string,
            { el?: RouteMeta }
          >
      )[route]?.el;

    if (meta?.title) {
      document.title =
        meta.title;
    }

    if (meta?.description) {
      upsertMeta(
        "description",
        meta.description
      );
    }
  }

  const englishUrl =
    new URL(
      localizedPath(
        window.location.href,
        "en"
      ),
      window.location.origin
    ).href;

  const greekUrl =
    new URL(
      localizedPath(
        window.location.href,
        "el"
      ),
      window.location.origin
    ).href;

  upsertAlternate(
    "en",
    englishUrl
  );

  upsertAlternate(
    "el",
    greekUrl
  );

  upsertAlternate(
    "x-default",
    englishUrl
  );
}

function createLanguageSelector(): HTMLElement {
  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.className =
    "language-switcher";

  wrapper.setAttribute(
    "aria-label",
    locale === "el"
      ? "Επιλογή γλώσσας"
      : "Language selector"
  );

  const englishHref =
    localizedPath(
      window.location.href,
      "en"
    );

  const greekHref =
    localizedPath(
      window.location.href,
      "el"
    );

  wrapper.innerHTML = `
    <a
      href="${englishHref}"
      lang="en"
      hreflang="en"
      class="${locale === "en" ? "is-active" : ""}"
      aria-current="${locale === "en" ? "page" : "false"}"
    >EN</a>
    <span aria-hidden="true">/</span>
    <a
      href="${greekHref}"
      lang="el"
      hreflang="el"
      class="${locale === "el" ? "is-active" : ""}"
      aria-current="${locale === "el" ? "page" : "false"}"
    >ΕΛ</a>
  `;

  return wrapper;
}

function ensureLanguageSelector(): void {
  if (
    document.querySelector(
      ".language-switcher"
    )
  ) {
    return;
  }

  /*
   * Keep language choice away from account/cart icons.
   * Desktop: left navigation group.
   * Mobile: the same group lives inside the hamburger menu, so the
   * selector no longer crowds the logo or header icons.
   */
  const target =
    document.querySelector(
      ".nav-left"
    ) ||
    document.querySelector(
      ".main-nav"
    );

  if (!target) return;

  target.insertBefore(
    createLanguageSelector(),
    target.firstChild
  );
}

let observer:
  | MutationObserver
  | null = null;

export function initLocalization(): void {
  applyMetadata();

  translateSubtree(
    document
  );

  ensureLanguageSelector();

  if (observer) return;

  observer =
    new MutationObserver(
      (mutations) => {
        observer?.disconnect();

        for (
          const mutation of
          mutations
        ) {
          mutation.addedNodes.forEach(
            (node) => {
              if (
                node instanceof
                Element
              ) {
                translateSubtree(
                  node
                );
              } else if (
                node instanceof
                Text
              ) {
                translateTextNode(
                  node
                );
              }
            }
          );
        }

        ensureLanguageSelector();

        observer?.observe(
          document.body,
          {
            childList: true,
            subtree: true,
          }
        );
      }
    );

  if (document.body) {
    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
      }
    );
  }
}
