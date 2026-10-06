export function renderFooter(): void {
  const target = document.getElementById("siteFooter");

  if (!target) return;

  target.innerHTML = `
    <footer class="site-footer">

      <div class="container footer-main">

        <!-- BRAND -->

        <div class="footer-brand">

          <a
            href="/index.html"
            class="footer-logo"
          >
            Skanare
          </a>

          <p class="footer-description">
            QR clothing and accessories that connect
            what you wear with your digital world.
          </p>

          <p class="footer-tagline">
            Dynamic QR. Your link. Your story.
          </p>

          <a
            href="mailto:hello@skanare.com"
            class="footer-email"
          >
            hello@skanare.com
          </a>

        </div>


        <!-- ===============================
             DESKTOP FOOTER
        ================================ -->

        <div class="footer-desktop-nav">

          <!-- MY ACCOUNT -->

          <div class="footer-column">

            <h4>
              My Account
            </h4>

            <ul>

              <li>
                <a href="/my-qr">
                  <span>My QR Codes</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/returns">
                  <span>Returns Center</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/login">
                  <span>Sign In</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/register">
                  <span>Create Account</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

            </ul>

          </div>


          <!-- SHOP -->

          <div class="footer-column">

            <h4>
              Shop
            </h4>

            <ul>

              <li>
                <a href="/products?category=tshirt">
                  <span>QR Clothing</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/products?category=accessory">
                  <span>QR Accessories</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/index.html#how">
                  <span>How it works</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

            </ul>

          </div>


          <!-- COMPANY -->

          <div class="footer-column">

            <h4>
              Company
            </h4>

            <ul>

              <li>
                <a href="/about">
                  <span>About Us</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/contact">
                  <span>Contact</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/index.html#faq">
                  <span>FAQ</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/payment-security">
                  <span>Payment &amp; Security</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

            </ul>

          </div>


          <!-- POLICIES -->

          <div class="footer-column">

            <h4>
              Policies
            </h4>

            <ul>

              <li>
                <a href="/shipping-policy">
                  <span>Shipping Policy</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/refund-policy">
                  <span>Refund &amp; Returns</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/privacy-policy">
                  <span>Privacy Policy</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/terms">
                  <span>Terms of Service</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

              <li>
                <a href="/cookie-policy">
                  <span>Cookie Policy</span>
                  <span class="footer-arrow">↗</span>
                </a>
              </li>

            </ul>

          </div>

        </div>


        <!-- ===============================
             MOBILE FOOTER ACCORDION
        ================================ -->

        <div class="footer-mobile-nav">

          <!-- MY ACCOUNT -->

          <details class="footer-mobile-section">

            <summary>
              <span>My Account</span>
              <span class="footer-chevron"></span>
            </summary>

            <div class="footer-mobile-content">

              <a href="/my-qr">
                My QR Codes
              </a>

              <a href="/returns">
                Returns Center
              </a>

              <a href="/login">
                Sign In
              </a>

              <a href="/register">
                Create Account
              </a>

            </div>

          </details>


          <!-- SHOP -->

          <details class="footer-mobile-section">

            <summary>
              <span>Shop</span>
              <span class="footer-chevron"></span>
            </summary>

            <div class="footer-mobile-content">

              <a href="/products?category=tshirt">
                QR Clothing
              </a>

              <a href="/products?category=accessory">
                QR Accessories
              </a>

              <a href="/index.html#how">
                How it works
              </a>

            </div>

          </details>


          <!-- COMPANY -->

          <details class="footer-mobile-section">

            <summary>
              <span>Company</span>
              <span class="footer-chevron"></span>
            </summary>

            <div class="footer-mobile-content">

              <a href="/about">
                About Us
              </a>

              <a href="/contact">
                Contact
              </a>

              <a href="/index.html#faq">
                FAQ
              </a>

              <a href="/payment-security">
                Payment &amp; Security
              </a>

            </div>

          </details>


          <!-- POLICIES -->

          <details class="footer-mobile-section">

            <summary>
              <span>Policies</span>
              <span class="footer-chevron"></span>
            </summary>

            <div class="footer-mobile-content">

              <a href="/shipping-policy">
                Shipping Policy
              </a>

              <a href="/refund-policy">
                Refund &amp; Returns
              </a>

              <a href="/privacy-policy">
                Privacy Policy
              </a>

              <a href="/terms">
                Terms of Service
              </a>

              <a href="/cookie-policy">
                Cookie Policy
              </a>

            </div>

          </details>

        </div>

      </div>


      <!-- ===============================
           FOOTER BOTTOM
      ================================ -->

      <div class="container footer-bottom">

        <small>
          © 2026 Skanare. All rights reserved.
        </small>

        <div class="footer-bottom-links">

          <a href="/privacy-policy">
            Privacy
          </a>

          <a href="/terms">
            Terms
          </a>

          <a href="/cookie-policy">
            Cookies
          </a>

        </div>

      </div>

    </footer>
  `;
}