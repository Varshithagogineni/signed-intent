import "server-only";
import { env } from "@/lib/env";
import { type Cents, toCents } from "@/lib/money";

const API_BASE = "https://api.trychannel3.com/v1";

interface Channel3Offer {
  url: string;
  domain: string;
  price: { price: number; currency: string };
  availability?: string;
}

interface Channel3Product {
  id: string;
  title: string;
  description?: string;
  brands?: { name: string }[];
  images?: { url: string; is_main_image?: boolean }[];
  category?: { title: string };
  key_features?: string[];
  ratings?: { value: number; count: number };
  offers?: Channel3Offer[];
}

/** A product with one purchasable offer, normalized for the agent and the UI. */
export interface Product {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  retailer: string;
  url: string;
  priceCents: Cents;
  inStock: boolean;
  rating: { value: number; count: number } | null;
  highlights: string[];
}

async function channel3<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "x-api-key": env().CHANNEL3_API_KEY, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Channel3 ${path} failed with status ${res.status}`);
  return res.json();
}

/** Picks the cheapest in-stock USD offer, falling back to the cheapest USD offer. */
function bestOffer(offers: Channel3Offer[] = []): Channel3Offer | undefined {
  const usd = offers.filter((o) => o.price.currency === "USD").sort((a, b) => a.price.price - b.price.price);
  return usd.find((o) => o.availability === "InStock") ?? usd[0];
}

function normalize(product: Channel3Product): Product | null {
  const offer = bestOffer(product.offers);
  if (!offer) return null;
  const image = product.images?.find((i) => i.is_main_image) ?? product.images?.[0];
  return {
    id: product.id,
    title: product.title,
    brand: product.brands?.[0]?.name ?? null,
    category: product.category?.title ?? null,
    imageUrl: image?.url ?? null,
    retailer: offer.domain,
    url: offer.url,
    priceCents: toCents(offer.price.price),
    inStock: offer.availability === "InStock",
    rating: product.ratings ? { value: product.ratings.value, count: product.ratings.count } : null,
    highlights: (product.key_features ?? []).slice(0, 3),
  };
}

export async function searchProducts(input: { query: string; maxPriceCents?: Cents; limit?: number }): Promise<Product[]> {
  const { products } = await channel3<{ products: Channel3Product[] }>("/search", {
    method: "POST",
    body: JSON.stringify({
      query: input.query,
      limit: input.limit ?? 6,
      ...(input.maxPriceCents !== undefined && { filters: { price: { max_price: input.maxPriceCents / 100 } } }),
    }),
  });
  return products.map(normalize).filter((p): p is Product => p !== null);
}

/**
 * Fetches the authoritative price for a product. Purchases always use this server-side
 * lookup, never a price the model claims, so the agent cannot misstate what it pays.
 */
export async function getProduct(productId: string): Promise<Product | null> {
  const product = await channel3<Channel3Product>(`/products/${encodeURIComponent(productId)}`);
  return normalize(product);
}
