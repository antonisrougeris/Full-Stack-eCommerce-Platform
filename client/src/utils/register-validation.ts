/* 3220089_3220172  2025 */

export const MIN_AGE = 16;

// Email format
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
// Password requirements
export function passwordIssues(password: string): string[] {
  const issues = [];
  if (password.length < 8) issues.push("at least 8 characters");
  if (!/[A-Z]/.test(password)) issues.push("1 uppercase letter");
  if (!/[a-z]/.test(password)) issues.push("1 lowercase letter");
  if (!/[0-9]/.test(password)) issues.push("1 number");
  return issues;
}
// Calculate age from birthdate
export function calcAge(birthdate: string): number | null {
  const d = new Date(birthdate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
// Read form data into an object
export function readData(form: HTMLFormElement): any {
  const formData = new FormData(form);

  return {
    firstName: formData.get("firstName")?.toString().trim() || "",
    lastName: formData.get("lastName")?.toString().trim() || "",
    email: formData.get("email")?.toString().trim() || "",
    phone: formData.get("phone")?.toString().trim() || "",
    password: formData.get("password")?.toString() || "",
    confirmPassword: formData.get("confirmPassword")?.toString() || "",
    birthdate: formData.get("birthdate")?.toString() || "",
    gender: formData.get("gender")?.toString() || "",
    interests: formData.getAll("interests") as string[],
    experience: formData.get("experience")?.toString() || "",
    goals: formData.get("goals")?.toString() || "",
    newsletter: formData.get("newsletter") === "on",
  };
}
// Validate data and show errors on the form
export function validateAndShowErrors(form: HTMLFormElement, data: any): boolean {
  let ok = true;

  const get = (id: string) => form.querySelector(`#${id}`) as HTMLElement & { value: string };

  const setError = (el: HTMLElement | null, msg = "") => {
    if (!el) return;
    const container = el.closest(".form-field") || el.parentElement;
    let msgEl = container?.querySelector(".error-message");
    if (!msgEl) {
      msgEl = document.createElement("p");
      msgEl.className = "error-message";
      container?.appendChild(msgEl);
    }
    msgEl.textContent = msg;
    el.classList.toggle("error", !!msg);
  };
// For grouped inputs like checkboxes/radios
  const setGroupError = (fieldName: string, msg = "") => {
    const first = form.querySelector(`[name="${fieldName}"]`) as HTMLElement | null;
    if (!first) return;
    const container = first.closest("fieldset") || first.closest(".form-field") || first.parentElement;
    if (!container) return;

    let msgEl = container.querySelector(".error-message");
    if (!msgEl) {
      msgEl = document.createElement("p");
      msgEl.className = "error-message";
      container.appendChild(msgEl);
    }

    msgEl.textContent = msg;
    first.classList.toggle("error", !!msg);
  };

  setError(get("firstName"), data.firstName.length >= 2 ? "" : "Enter a valid first name");
  setError(get("lastName"), data.lastName.length >= 2 ? "" : "Enter a valid last name");
  setError(get("email"), isValidEmail(data.email) ? "" : "Enter a valid email");
  setError(get("phone"), data.phone.replace(/\D/g, "").length >= 10 ? "" : "Enter valid phone number");

  const pwIssues = passwordIssues(data.password);
  setError(get("password"), pwIssues.length ? `Password needs: ${pwIssues.join(", ")}` : "");
  setError(get("confirmPassword"), data.password === data.confirmPassword ? "" : "Passwords do not match");

  const age = calcAge(data.birthdate);
  setError(get("birthdate"), age !== null && age >= MIN_AGE ? "" : `Must be at least ${MIN_AGE} years old`);

  setError(get("gender"), data.gender ? "" : "Select gender");

  setGroupError(
    "interests",
    data.interests.length === 0 ? "Select at least one area of interest" : ""
  );
  if (data.interests.length === 0) ok = false;

// Experience level
  setGroupError(
    "experience",
    !data.experience ? "Select your experience level" : ""
  );
  if (!data.experience) ok = false;

  return ok && pwIssues.length === 0 && data.password === data.confirmPassword;
}
