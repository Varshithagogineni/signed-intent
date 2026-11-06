import Link from "next/link";

const NAV = [
  { href: "/", label: "Agent", section: "agent" },
  { href: "/disputes", label: "Disputes", section: "disputes" },
  { href: "/how-it-works", label: "How it works", section: "how" },
] as const;

export type Section = (typeof NAV)[number]["section"];

/** Each page names its section, so the header stays static and prerenders on dynamic routes. */
export function SiteHeader({ active }: { active: Section }) {

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 sm:px-8">
      <div className="flex min-w-0 items-center gap-3 sm:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-sm font-bold text-white">S</span>
          <span className="hidden font-semibold sm:inline">Signed Intent</span>
        </Link>
        <nav className="flex gap-0.5 text-sm sm:gap-1">
          {NAV.map(({ href, label, section }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-2 py-1.5 whitespace-nowrap transition sm:px-2.5 ${
                section === active ? "bg-surface-muted font-medium text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <span className="hidden shrink-0 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning sm:inline">PayPal sandbox</span>
    </header>
  );
}
