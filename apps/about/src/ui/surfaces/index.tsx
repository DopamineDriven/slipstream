import { Reveal } from "@/ui/reveal";

const surfaces = [
  {
    name: "Web",
    status: "Live",
    live: true,
    description:
      "Real-time conversations across every provider, backed by a WebSocket Server on ECS Fargate.",
    href: "https://chat.aicoalesce.com",
    label: "chat.aicoalesce.com"
  },
  {
    name: "CLI",
    status: "Coming Soon",
    live: false,
    description:
      "The same conversation fabric for the terminal, for people who live there.",
    href: null,
    label: null
  },
  {
    name: "iOS & Android",
    status: "Coming Soon",
    live: false,
    description: "Native mobile clients via React Native.",
    href: null,
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
            <article className="border-border bg-card flex h-full flex-col rounded-lg border p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{surface.name}</h3>
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${
                    surface.live
                      ? "border-accent/40 text-accent"
                      : "border-border text-muted-foreground"
                  }`}>
                  {surface.status}
                </span>
              </div>
              <p className="text-muted-foreground mt-4 flex-1 text-sm leading-relaxed text-pretty">
                {surface.description}
              </p>
              {surface.href && (
                <a
                  href={surface.href}
                  className="text-foreground/80 hover:text-foreground mt-6 font-mono text-sm transition-colors">
                  {surface.label} →
                </a>
              )}
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
