import "../../i18n/auto";
import { apiRequest } from "../../services/api";
import { t } from "../../i18n/locale";

const form =
  document.getElementById("contactForm") as HTMLFormElement | null;

const status =
  document.getElementById("formStatus") as HTMLElement | null;

const submitButton =
  form?.querySelector<HTMLButtonElement>('button[type="submit"]') || null;

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form || !status || !submitButton) return;

  const data = new FormData(form);

  const payload = {
    name: String(data.get("name") || "").trim(),
    email: String(data.get("email") || "").trim(),
    message: String(data.get("message") || "").trim(),
  };

  try {
    submitButton.disabled = true;
    submitButton.textContent =
      t("contact.sending", "Sending...");
    status.textContent =
      t("contact.sending", "Sending...");

    await apiRequest("/contact", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    status.textContent =
      t(
        "contact.sent",
        "Message sent successfully!"
      );
    status.classList.add("is-success");
    form.reset();
  } catch (error) {
    console.error("Contact form failed:", error);
    status.classList.remove("is-success");
    status.textContent =
      error instanceof Error
        ? error.message
        : t(
            "contact.failed",
            "Failed to send message."
          );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent =
      t(
        "contact.send",
        "Send message"
      );
  }
});
