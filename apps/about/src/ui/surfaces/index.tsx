import { cn } from "@/lib/utils";
import { Reveal } from "@/ui/reveal";

const surfaces = [
  {
    id: "web",
    name: "Web",
    status: "Live",
    live: true,
    description:
      "Real-time conversations across every provider, backed by a WebSocket Server on ECS Fargate.",
    href: "https://chat.aicoalesce.com",
    label: "chat.aicoalesce.com"
  },
  {
    id: "cli",
    name: "CLI",
    status: "Coming Soon",
    live: false,
    description:
      "The same conversation fabric for the terminal, for people who live there.",
    href: "#cli",
    label: null
  },
  {
    id: "mobile",
    name: "iOS & Android",
    status: "Coming Soon",
    live: false,
    description: "Native mobile clients via React Native.",
    href: "#mobile",
    label: null
  }
];

export function Surfaces() {
  return (
    <section
      aria-labelledby="surfaces-heading"
      className="border-border border-t px-6 py-24 md:px-10 lg:px-16">
      <Reveal>
        <h2
          id="surfaces-heading"
          className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Surfaces
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {surfaces.map((surface, i) => (
          <Reveal key={surface.name} delay={i * 0.1}>
            <article
              id={surface.id}
              className="group border-border bg-card hover:border-foreground/25 relative flex h-full flex-col rounded-lg border p-6 transition-colors">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{surface.name}</h3>
                <span
                  className={cn(
                    `rounded-full border px-2.5 py-0.5 font-mono text-xs`,
                    surface.live
                      ? "border-accent/40 text-accent"
                      : "border-border text-muted-foreground"
                  )}>
                  {surface.status}
                </span>
              </div>
              <p className="text-muted-foreground mt-4 flex-1 text-sm leading-relaxed text-pretty">
                {surface.description}
              </p>
              {surface.label && (
                <p
                  aria-hidden="true"
                  className="text-foreground/80 group-hover:text-foreground mt-6 font-mono text-sm transition-colors">
                  {surface.label + " "}
                  <span className="inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </p>
              )}
              <a
                href={surface.href}
                aria-label={
                  surface.label
                    ? `${surface.name} — ${surface.label}`
                    : `${surface.name} — ${surface.status}`
                }
                className="absolute inset-0 rounded-lg"
              />
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
