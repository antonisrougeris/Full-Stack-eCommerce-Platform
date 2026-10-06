export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix = "id") {
  return `${prefix}_${Math.random()
    .toString(36)
    .slice(2, 10)}${Date.now().toString(36)}`;
}
