import Image from "next/image";
import { Reveal } from "@/ui/reveal";

export function SiteFooter() {
  return (
    <footer className="border-border border-t px-6 py-20 md:px-10 lg:px-16">
      <div className="grid gap-12 md:grid-cols-2 md:items-center">
        <Reveal>
          <Image
            src="/ac-drip.png"
            alt="The AI Coalesce mark, dripping ink against rose and violet smoke"
            width={280}
            height={280}
            className="rounded-lg"
          />
        </Reveal>
        <Reveal delay={0.1}>
          <dl className="space-y-6 text-sm">
            <div>
              <dt className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
                Company
              </dt>
              <dd className="mt-1.5 text-base">AI Coalesce LLC</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
                Founder
              </dt>
              <dd className="mt-1.5 text-base">Andrew Ross</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
                Contact
              </dt>
              <dd className="mt-1.5">
                <a
                  href="mailto:andrew@aicoalesce.com"
                  className="hover:text-accent text-base transition-colors">
                  andrew@aicoalesce.com
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
                Platform
              </dt>
              <dd className="mt-1.5">
                <a
                  href="https://chat.aicoalesce.com"
                  className="hover:text-accent text-base transition-colors">
                  chat.aicoalesce.com
                </a>
              </dd>
            </div>
          </dl>
        </Reveal>
      </div>
      <p className="text-muted-foreground mt-16 text-xs">
        © {new Date().getFullYear()} AI Coalesce LLC. All rights reserved.
      </p>
    </footer>
  );
}
