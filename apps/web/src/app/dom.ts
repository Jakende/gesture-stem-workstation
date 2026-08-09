export function queryRequired<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required UI element is missing: ${selector}`);
  return element;
}

export function setText(selector: string, text: string, root: ParentNode = document): void {
  queryRequired<HTMLElement>(selector, root).textContent = text;
}

export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`;
}

export function downloadText(filename: string, contents: string, type = "application/json"): void {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([contents], { type }));
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

