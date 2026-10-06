const COOKIE_CONSENT_KEY = "skanare_cookie_consent";

type CookieConsent = "accepted" | "rejected";

function loadGoogleAnalytics(): void {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;

  if (!measurementId) {
    console.warn("VITE_GA_MEASUREMENT_ID is missing");
    return;
  }

  if (document.querySelector('script[data-skanare-ga="true"]')) {
    return;
  }

  const script = document.createElement("script");

  script.async = true;
  script.src =
    `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;

  script.dataset.skanareGa = "true";

  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];

  function gtag(...args: any[]) {
    window.dataLayer.push(args);
  }

  window.gtag = gtag;

  gtag("js", new Date());

  gtag("config", measurementId, {
    anonymize_ip: true,
  });

  console.log("Google Analytics loaded");
}

function saveConsent(value: CookieConsent): void {
  localStorage.setItem(
    COOKIE_CONSENT_KEY,
    value
  );
}

function getConsent(): CookieConsent | null {
  const value = localStorage.getItem(
    COOKIE_CONSENT_KEY
  );

  if (
    value === "accepted" ||
    value === "rejected"
  ) {
    return value;
  }

  return null;
}

export function initCookieConsent(): void {
  const existingConsent = getConsent();

  if (existingConsent === "accepted") {
    loadGoogleAnalytics();
    return;
  }

  if (existingConsent === "rejected") {
    return;
  }

  const banner = document.createElement("div");

  banner.className = "cookie-banner";

  banner.innerHTML = `
    <div class="cookie-banner-inner">

      <div class="cookie-banner-icon">
        🍪
      </div>

      <div class="cookie-banner-content">

        <strong>
          Your privacy matters
        </strong>

        <p>
  We use essential cookies and optional analytics
  to improve Skanare.
</p>

        <a
          href="/cookie-policy"
          class="cookie-policy-link"
        >
          Cookie Policy
        </a>

      </div>

      <div class="cookie-banner-actions">

        <button
          type="button"
          class="cookie-btn cookie-reject"
        >
          Reject
        </button>

        <button
          type="button"
          class="cookie-btn cookie-accept"
        >
          Accept
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(banner);

  requestAnimationFrame(() => {
    banner.classList.add("cookie-banner-visible");
  });

  const acceptButton =
    banner.querySelector<HTMLButtonElement>(
      ".cookie-accept"
    );

  const rejectButton =
    banner.querySelector<HTMLButtonElement>(
      ".cookie-reject"
    );

  function closeBanner(): void {
    banner.classList.remove(
      "cookie-banner-visible"
    );

    setTimeout(() => {
      banner.remove();
    }, 300);
  }

  acceptButton?.addEventListener(
    "click",
    () => {
      saveConsent("accepted");

      loadGoogleAnalytics();

      closeBanner();
    }
  );

  rejectButton?.addEventListener(
    "click",
    () => {
      saveConsent("rejected");

      closeBanner();
    }
  );
}

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}