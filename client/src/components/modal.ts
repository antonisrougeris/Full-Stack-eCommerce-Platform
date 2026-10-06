/*  3220089_3220172   2025 */

/**
 * Ensures the modal overlay exists in the DOM.
 * If it's missing, it creates it and appends to <body>.
 */
function ensureModal() {
  // Try to find an existing overlay
  let overlay = document.getElementById("appModalOverlay");
  if (overlay) return overlay;

  // Create overlay container (covers the full viewport)
  overlay = document.createElement("div");
  overlay.id = "appModalOverlay";
  overlay.className = "modal-overlay";

  // Inner modal markup: dialog container, close button, title and body
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="appModalTitle">
      <button type="button" class="modal-close" aria-label="Close modal">×</button>
      <h2 id="appModalTitle" class="modal-title"></h2>
      <div class="modal-body"></div>
    </div>
  `;

  // Add to DOM
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Opens the overlay: shows it and locks page scroll.
 */
function openOverlay(overlay: HTMLElement) {
  overlay.classList.add("is-open");
  document.documentElement.classList.add("modal-open");
  document.body.style.overflow = "hidden";
}

/**
 * Closes the overlay: hides it, unlocks scroll, and clears modal content.
 * Clearing content is important to stop video playback and free memory.
 */
function closeOverlay(overlay: HTMLElement) {
  overlay.classList.remove("is-open");
  document.documentElement.classList.remove("modal-open");
  document.body.style.overflow = "";

  // Stop any playing video by removing modal body contents
  const body = overlay.querySelector(".modal-body");
  if (body) body.innerHTML = "";
}

/**
 * Updates the modal title text.
 */
function setTitle(overlay: HTMLElement, title: string) {
  const titleEl = overlay.querySelector(".modal-title");
  if (titleEl) titleEl.textContent = title || "";
}

/**
 * Replaces modal body content with a given DOM node.
 */
function setBodyNode(overlay: HTMLElement, node: HTMLElement) {
  const body = overlay.querySelector(".modal-body");
  if (!body) return;
  body.innerHTML = "";
  body.appendChild(node);
}

/**
 * Opens an image modal.
 * @param {string} src - image URL
 * @param {string} alt - alt text for accessibility
 * @param {string} title - modal title
 */
export function openImageModal(src: string, alt = "", title = "") {
  const overlay = ensureModal();

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.className = "modal-media";

  setTitle(overlay, title);
  setBodyNode(overlay, img);
  openOverlay(overlay);
}

/**
 * Opens a video modal (local file).
 * @param {string} src - video URL
 * @param {string} title - modal title
 */
export function openVideoModal(src: string, title = "") {
  const overlay = ensureModal();

  const video = document.createElement("video");
  video.className = "modal-media modal-video";
  video.src = src;
  video.controls = true;
  video.playsInline = true;

  setTitle(overlay, title);
  setBodyNode(overlay, video);
  openOverlay(overlay);

  // Attempt autoplay (may be blocked by some browsers)
  video.play().catch(() => {});
}

/**
 * Optional: opens an embedded iframe (YouTube/Vimeo, etc.)
 * @param {string} url - embed URL
 * @param {string} title - modal title
 */
export function openEmbedModal(url: string, title = "") {
  const overlay = ensureModal();

  const iframe = document.createElement("iframe");
  iframe.className = "modal-media";
  iframe.src = url;
  iframe.title = title || "Embedded video";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;

  setTitle(overlay, title);
  setBodyNode(overlay, iframe);
  openOverlay(overlay);
}

/**
 * Initializes modal behavior and click handlers.
 * Uses event delegation for any element with [data-modal] attributes.
 *
 * Supported triggers:
 *  data-modal="image" data-src="..." data-title="..." data-alt="..."
 *  data-modal="video" data-src="..." data-title="..."
 *  data-modal="embed" data-src="..." data-title="..."
 */
export function initModalUI() {
  const overlay = ensureModal();
  const modal = overlay.querySelector(".modal");
  const closeBtn = overlay.querySelector(".modal-close");

  // Reusable close function
  const close = () => closeOverlay(overlay);

  // Close button handler
  if (closeBtn) closeBtn.addEventListener("click", close);

  // Clicking outside the modal (on overlay) closes it
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Prevent clicks inside modal from bubbling to overlay
  if (modal) {
    modal.addEventListener("click", (e) => e.stopPropagation());
  }

  // ESC closes modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  // Event delegation: one listener handles all modal trigger elements
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const trigger = target.closest("[data-modal]");
    if (!trigger) return;

    e.preventDefault();

    const type = trigger.getAttribute("data-modal");
    const src = trigger.getAttribute("data-src");
    const title = trigger.getAttribute("data-title") || "";
    const alt = trigger.getAttribute("data-alt") || "";

    if (!src) return;

    if (type === "image") openImageModal(src, alt, title);
    if (type === "video") openVideoModal(src, title);
    if (type === "embed") openEmbedModal(src, title);
  });
}
