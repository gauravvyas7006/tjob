import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A link to another site, styled as a small button, opening in a new tab. */
export function ExternalButton({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Button asChild size="sm" variant={primary ? "default" : "outline"}>
      <a href={href} target="_blank" rel="noreferrer">
        {children}
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </Button>
  );
}
