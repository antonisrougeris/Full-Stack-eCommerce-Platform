import {
  initLocalization,
} from "./locale";

function start(): void {
  initLocalization();
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    start,
    { once: true }
  );
} else {
  start();
}
