export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
