const EYE_OPEN = `
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle
      cx="12"
      cy="12"
      r="2.6"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    />
  </svg>
`;

const EYE_CLOSED = `
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M3 3l18 18"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
    />
    <path
      d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16.7 16.7 0 0 1-2.4 3.1M6.1 7.2C3.7 9.1 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3-.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
`;

function ensureStyles(): void {
  if (
    document.getElementById(
      "passwordVisibilityStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "passwordVisibilityStyles";

  style.textContent = `
    .password-visibility {
      position: relative;
      width: 100%;
      min-width: 0;
    }

    .password-visibility > input {
      width: 100% !important;
      padding-right: 48px !important;
      box-sizing: border-box;
    }

    /*
     * Edge/Windows can add its own password reveal icon only after
     * the user starts typing. Hide native reveal/clear controls so
     * the field always shows a single Skanare toggle.
     */
    .password-visibility > input::-ms-reveal,
    .password-visibility > input::-ms-clear {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }

    .password-visibility > input::-webkit-credentials-auto-fill-button {
      visibility: hidden;
      display: none !important;
      pointer-events: none;
      position: absolute;
      right: 0;
    }

    .password-visibility__toggle {
      position: absolute;
      top: 50%;
      right: 12px;
      transform: translateY(-50%);
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: #222;
      cursor: pointer;
      z-index: 2;
    }

    .password-visibility__toggle:hover {
      background: rgba(0, 0, 0, 0.055);
    }

    .password-visibility__toggle:focus-visible {
      outline: 2px solid #111;
      outline-offset: 2px;
    }

    .password-visibility__toggle svg {
      width: 21px;
      height: 21px;
      display: block;
    }
  `;

  document.head.appendChild(
    style
  );
}

export function initPasswordVisibility(
  root: ParentNode = document
): void {
  ensureStyles();

  root
    .querySelectorAll<HTMLInputElement>(
      'input[type="password"]'
    )
    .forEach((input) => {
      if (
        input.dataset
          .passwordVisibilityInitialized ===
        "true"
      ) {
        return;
      }

      input.dataset
        .passwordVisibilityInitialized =
        "true";

      const wrapper =
        document.createElement(
          "span"
        );

      wrapper.className =
        "password-visibility";

      input.parentNode?.insertBefore(
        wrapper,
        input
      );

      wrapper.appendChild(input);

      const button =
        document.createElement(
          "button"
        );

      button.type = "button";
      button.className =
        "password-visibility__toggle";

      button.setAttribute(
        "aria-label",
        "Show password"
      );

      button.setAttribute(
        "aria-pressed",
        "false"
      );

      button.innerHTML =
        EYE_OPEN;

      button.addEventListener(
        "click",
        () => {
          const show =
            input.type === "password";

          input.type =
            show
              ? "text"
              : "password";

          button.setAttribute(
            "aria-label",
            show
              ? "Hide password"
              : "Show password"
          );

          button.setAttribute(
            "aria-pressed",
            String(show)
          );

          button.innerHTML =
            show
              ? EYE_CLOSED
              : EYE_OPEN;

          input.focus({
            preventScroll: true,
          });

          const end =
            input.value.length;

          try {
            input.setSelectionRange(
              end,
              end
            );
          } catch {
            // Some input types/browsers do not expose a selection range.
          }
        }
      );

      wrapper.appendChild(
        button
      );
    });
}
