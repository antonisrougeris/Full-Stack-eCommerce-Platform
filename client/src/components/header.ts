export function renderHeader(): void {
  const target = document.getElementById("siteHeader");

  if (!target) return;

  target.innerHTML = `
    <header class="site-header">
      <div class="container header-content">

        <button
          id="menuToggle"
          class="menu-toggle"
          type="button"
          aria-label="Toggle menu"
          aria-expanded="false"
          aria-controls="mainNav"
        >
          ☰
        </button>

        <nav
          id="mainNav"
          class="main-nav"
          aria-label="Main navigation"
        >
          <div class="nav-left">
            <a href="/index.html#tshirts">
              QR Clothing
            </a>

            <a href="/index.html#accessories">
              QR Accessories
            </a>
          </div>

          <div class="nav-right">
            <a href="/contact">
              Contact
            </a>

            <a href="/index.html#how">
              How it works
            </a>
          </div>
        </nav>

        <a
          href="/index.html"
          class="logo"
          aria-label="Skanare home"
        >
          <img
            class="logo-img"
            src="/assets/img/logo_Image.png"
            alt="Skanare logo"
          />

          <span class="logo-text">
            Skanare
          </span>
        </a>

        <div class="header-actions">

          <div class="account-menu">

            <button
              class="header-icon-link account-btn"
              type="button"
              aria-label="Account menu"
              aria-expanded="false"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="8" r="4"></circle>

                <path
                  d="M4 21c0-4 3.5-7 8-7s8 3 8 7"
                ></path>
              </svg>
            </button>

            <div class="account-dropdown hidden"></div>

          </div>

          <a
            href="/cart"
            class="header-icon-link cart-link"
            aria-label="Cart"
          >
            <svg
              viewBox="0 0 22 22"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path
                d="M14.666 7.333a3.666 3.666 0 1 1-7.333 0M3.33 6.785l-.642 7.7c-.137 1.654-.206 2.48.073 3.119a2.75 2.75 0 0 0 1.21 1.314c.612.332 1.442.332 3.102.332h7.853c1.66 0 2.49 0 3.103-.332a2.75 2.75 0 0 0 1.21-1.314c.279-.638.21-1.465.072-3.12l-.642-7.7c-.118-1.423-.178-2.134-.493-2.673A2.75 2.75 0 0 0 16.99 3.02c-.563-.269-1.277-.269-2.705-.269h-6.57c-1.428 0-2.142 0-2.705.27A2.75 2.75 0 0 0 3.823 4.11c-.315.539-.374 1.25-.493 2.674Z"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </a>

        </div>

      </div>
    </header>
  `;
}