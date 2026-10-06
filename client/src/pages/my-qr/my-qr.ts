import "../../i18n/auto";
import {
  firebaseAuth,
} from "../../services/firebase";

import {
  getMyQrCodes,
  updateQrCode,
  type QrCode,
} from "../../services/qr";

import {
  initNav,
} from "../../components/initNav";

import {
  initMobileMenu,
} from "../../components/menu";

import {
  updateCartBadge,
} from "../../utils/cart-badge";

import QRCode from "qrcode";


/* =========================================================
   INITIAL UI
   ========================================================= */

initNav();

initMobileMenu();

void updateCartBadge();


/* =========================================================
   ELEMENTS
   ========================================================= */

const loadingSection =
  document.getElementById(
    "myQrLoading"
  );

const signedOutSection =
  document.getElementById(
    "myQrSignedOut"
  );

const emptySection =
  document.getElementById(
    "myQrEmpty"
  );

const accountSection =
  document.getElementById(
    "myQrAccount"
  );

const grid =
  document.getElementById(
    "myQrGrid"
  ) as HTMLElement | null;


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(
  value: unknown
): string {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


function hideStates(): void {

  loadingSection?.classList.add(
    "hidden"
  );

  signedOutSection?.classList.add(
    "hidden"
  );

  emptySection?.classList.add(
    "hidden"
  );

  accountSection?.classList.add(
    "hidden"
  );
}


/* =========================================================
   QR CARDS
   ========================================================= */

async function renderQrCodes(
  qrCodes: QrCode[]
): Promise<void> {

  if (!grid) {
    return;
  }


  const redirectBase =
    import.meta.env
      .VITE_QR_REDIRECT_BASE_URL ||
    "https://go.skanare.com";


  const cards =
    await Promise.all(

      qrCodes.map(
        async (qr) => {

          const publicId =
            qr.shortId ||
            qr.id;


          const qrUrl =
            `${redirectBase}/${encodeURIComponent(
              publicId
            )}`;


          const qrImage =
            await QRCode.toDataURL(
              qrUrl,
              {
                width: 500,

                margin: 1,

                errorCorrectionLevel:
                  "H",

                color: {
                  dark:
                    "#000000",

                  light:
                    "#00000000",
                },
              }
            );


          const title =
            escapeHtml(
              qr.productTitle ||
              "Skanare QR Product"
            );


          const destination =
            escapeHtml(
              qr.targetUrl ||
              ""
            );


          return `
            <article class="my-qr-card">

              <div class="my-qr-card__visual">

                <img
                  src="${qrImage}"
                  alt="QR code for ${title}"
                  class="my-qr-card__qr"
                />

              </div>


              <div class="my-qr-card__content">

                <div
                  class="my-qr-card__heading"
                >

                  <div>

                    <span
                      class="my-qr-eyebrow"
                    >
                      Dynamic QR
                    </span>

                    <h3>
                      ${title}
                    </h3>

                  </div>


                  <span
                    class="my-qr-card__scans"
                  >
                    ${Number(
                      qr.scans || 0
                    )} scans
                  </span>

                </div>


                <div
                  class="my-qr-card__public"
                >

                  <span>
                    Your QR link
                  </span>

                  <a
                    href="${escapeHtml(
                      qrUrl
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ${escapeHtml(
                      qrUrl
                    )}
                  </a>

                </div>


                <label
                  class="my-qr-card__label"
                  for="my-qr-input-${escapeHtml(
                    qr.id
                  )}"
                >
                  Current destination
                </label>


                <div
                  class="my-qr-card__edit"
                >

                  <input
                    id="my-qr-input-${escapeHtml(
                      qr.id
                    )}"
                    type="url"
                    value="${destination}"
                    placeholder="https://example.com"
                  />


                  <button
                    type="button"
                    data-my-qr-save="${escapeHtml(
                      qr.id
                    )}"
                  >
                    Save
                  </button>

                </div>


                <p
                  id="my-qr-status-${escapeHtml(
                    qr.id
                  )}"
                  class="my-qr-card__status"
                  aria-live="polite"
                ></p>

              </div>

            </article>
          `;
        }
      )
    );


  grid.innerHTML =
    cards.join("");


  grid
    .querySelectorAll<HTMLButtonElement>(
      "[data-my-qr-save]"
    )
    .forEach(
      (button) => {

        button.addEventListener(
          "click",
          async () => {

            const qrId =
              button.dataset
                .myQrSave;

            if (!qrId) {
              return;
            }


            const input =
              document.getElementById(
                `my-qr-input-${qrId}`
              ) as
                HTMLInputElement |
                null;


            const status =
              document.getElementById(
                `my-qr-status-${qrId}`
              );


            const targetUrl =
              input?.value.trim() ||
              "";


            if (!targetUrl) {

              if (status) {
                status.textContent =
                  "Enter a destination URL.";
              }

              return;
            }


            button.disabled = true;

            button.textContent =
              "Saving…";


            if (status) {
              status.textContent =
                "";
            }


            try {

              await updateQrCode(
                qrId,
                targetUrl
              );


              button.textContent =
                "Saved";


              if (status) {

                status.textContent =
                  "Destination updated successfully.";

                status.classList.add(
                  "is-success"
                );
              }


              setTimeout(
                () => {

                  button.textContent =
                    "Save";

                  button.disabled =
                    false;

                },
                1300
              );

            } catch (error) {

              console.error(
                "QR update failed:",
                error
              );


              button.textContent =
                "Save";

              button.disabled =
                false;


              if (status) {

                status.textContent =
                  error instanceof Error
                    ? error.message
                    : "Could not update QR destination.";

                status.classList.remove(
                  "is-success"
                );
              }
            }
          }
        );
      }
    );
}


/* =========================================================
   AUTH STATE
   ========================================================= */

firebaseAuth.onAuthStateChanged(
  async (user) => {

    hideStates();


    /*
     * NOT LOGGED IN
     */

    if (!user) {

      signedOutSection
        ?.classList.remove(
          "hidden"
        );

      return;
    }


    /*
     * LOGGED IN
     */

    loadingSection
      ?.classList.remove(
        "hidden"
      );


    try {

      const qrCodes =
        await getMyQrCodes();


      loadingSection
        ?.classList.add(
          "hidden"
        );


      if (
        !Array.isArray(
          qrCodes
        ) ||
        qrCodes.length === 0
      ) {

        emptySection
          ?.classList.remove(
            "hidden"
          );

        return;
      }


      accountSection
        ?.classList.remove(
          "hidden"
        );


      await renderQrCodes(
        qrCodes
      );

    } catch (error) {

      console.error(
        "Failed to load My QR:",
        error
      );


      loadingSection
        ?.classList.add(
          "hidden"
        );


      if (emptySection) {

        emptySection.classList.remove(
          "hidden"
        );


        const paragraph =
          emptySection.querySelector(
            "p"
          );


        if (paragraph) {

          paragraph.textContent =
            "We couldn't load your QR codes right now. Please try again.";
        }
      }
    }
  }
);