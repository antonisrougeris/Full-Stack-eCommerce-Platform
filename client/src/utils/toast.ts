const FLASH_TOAST_KEY = "skanare_flash_toast";

type ToastPlacement = "default" | "cart-reminder";

type ToastOptions = {
  placement?: ToastPlacement;
};

export function showToast(
  message: string,
  options: ToastOptions = {}
): void {
  const isCartReminder = options.placement === "cart-reminder";
  const stackId = isCartReminder
    ? "toastStackCartReminder"
    : "toastStack";

  let stack = document.getElementById(stackId);

  if (!stack) {
    stack = document.createElement("div");
    stack.id = stackId;
    stack.className = isCartReminder
      ? "toast-stack toast-stack--cart-reminder"
      : "toast-stack";
    document.body.appendChild(stack);
  }

  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  stack.appendChild(toast);

  setTimeout(() => {
    toast.remove();
    if (stack && stack.children.length === 0) stack.remove();
  }, 7000);
}

export function setFlashToast(message: string): void {
  sessionStorage.setItem(FLASH_TOAST_KEY, message);
}

export function showFlashToast(): void {
  const message = sessionStorage.getItem(FLASH_TOAST_KEY);
  if (!message) return;

  sessionStorage.removeItem(FLASH_TOAST_KEY);

  setTimeout(() => {
    showToast(message);
  }, 250);
}