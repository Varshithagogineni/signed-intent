/**
 * Money is stored and compared as integer cents to avoid floating-point drift.
 * PayPal expects decimal strings, so conversion happens only at the API boundary.
 */

export type Cents = number;

export function toCents(amount: number | string): Cents {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid amount: ${amount}`);
  return Math.round(value * 100);
}

export function toPayPalValue(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

export function formatUsd(cents: Cents): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
