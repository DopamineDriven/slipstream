import { cn } from "@/lib/utils";
import { baseButtonVariants, ExternalLink, FileText } from "@slipstream/ui";

export function DocumentEmbed({
  src,
  title,
  className
}: {
  src: string;
  title: string;
  className?: string | undefined;
}) {
  return (
    <object
      data={`${src}#toolbar=0&navpanes=0&view=FitH`}
      type="application/pdf"
      aria-label={title}
      className={cn("bg-card block", className)}>
      <div className="flex h-full min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-xl">
          <FileText className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground text-sm">
            This browser can&apos;t preview PDFs inline.
          </p>
        </div>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className={baseButtonVariants({ variant: "outline", size: "sm" })}>
          Open PDF
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </object>
  );
}
