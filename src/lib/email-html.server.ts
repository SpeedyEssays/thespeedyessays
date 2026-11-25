const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}
