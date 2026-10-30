export function rdbg(tag: string, data?: Record<string, unknown>): void {
  console.log(`[RDBG] ${tag}`, data ? JSON.stringify(data) : "");
}
