import {
  STORE_NAME,
  STORE_SUPPORT_EMAIL,
  STORE_TAGLINE,
} from "../config/store";

export function renderFooter(): void {
  const target = document.getElementById("siteFooter");
  if (!target) return;

  target.innerHTML = `
    <footer class="site-footer">
      <div class="container footer-main">
        <div class="footer-brand">
          <a href="/" class="footer-logo">${STORE_NAME}</a>
          <p class="footer-description">${STORE_TAGLINE}</p>
          <p class="footer-tagline">Built for a smooth, modern shopping experience.</p>
          <a href="mailto:${STORE_SUPPORT_EMAIL}" class="footer-email">${STORE_SUPPORT_EMAIL}</a>
        </div>

        <div class="footer-desktop-nav">
          <div class="footer-column">
            <h4>My Account</h4>
            <ul>
              <li><a href="/login"><span>Sign In</span><span class="footer-arrow">↗</span></a></li>
              <li><a href="/register"><span>Create Account</span><span class="footer-arrow">↗</span></a></li>
              <li><a href="/returns"><span>Returns Center</span><span class="footer-arrow">↗</span></a></li>
            </ul>
          </div>

          <div class="footer-column">
            <h4>Shop</h4>
            <ul>
              <li><a href="/products"><span>All Products</span><span class="footer-arrow">↗</span></a></li>
              <li><a href="/products?featured=true"><span>Featured</span><span class="footer-arrow">↗</span></a></li>
            </ul>
          </div>

          <div class="footer-column">
            <h4>Company</h4>
            <ul>
              <li><a href="/about"><span>About Us</span><span class="footer-arrow">↗</span></a></li>
              <li><a href="/contact"><span>Contact</span><span class="footer-arrow">↗</span></a></li>
              <li><a href="/payment-security"><span>Payment &amp; Security</span><span class="footer-arrow">↗</span></a></li>
            </ul>
          </div>

          <div class="footer-column">
            <h4>Policies</h4>
            <ul>
              <li><a href="/shipping-policy"><span>Shipping Policy</span><span class="footer-arrow">↗</span></a></li>
              <li><a href="/refund-policy"><span>Refund &amp; Returns</span><span class="footer-arrow">↗</span></a></li>
              <li><a href="/privacy-policy"><span>Privacy Policy</span><span class="footer-arrow">↗</span></a></li>
              <li><a href="/terms"><span>Terms of Service</span><span class="footer-arrow">↗</span></a></li>
            </ul>
          </div>
        </div>

        <div class="footer-mobile-nav">
          <details class="footer-mobile-section">
            <summary><span>Shop</span><span class="footer-chevron"></span></summary>
            <div class="footer-mobile-content">
              <a href="/products">All Products</a>
              <a href="/products?featured=true">Featured</a>
            </div>
          </details>
          <details class="footer-mobile-section">
            <summary><span>Account</span><span class="footer-chevron"></span></summary>
            <div class="footer-mobile-content">
              <a href="/login">Sign In</a>
              <a href="/register">Create Account</a>
              <a href="/returns">Returns Center</a>
            </div>
          </details>
          <details class="footer-mobile-section">
            <summary><span>Policies</span><span class="footer-chevron"></span></summary>
            <div class="footer-mobile-content">
              <a href="/privacy-policy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
              <a href="/cookie-policy">Cookie Policy</a>
            </div>
          </details>
        </div>
      </div>

      <div class="container footer-bottom">
        <small>© 2026 ${STORE_NAME}. All rights reserved.</small>
        <div class="footer-bottom-links">
          <a href="/privacy-policy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/cookie-policy">Cookies</a>
        </div>
      </div>
    </footer>
  `;
}
