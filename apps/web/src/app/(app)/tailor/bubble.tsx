import { cn } from "@/lib/utils";

/** One chat message: yours on the right, tjob's on the left. */
export function Bubble({ from, children }: { from: "you" | "tjob"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", from === "you" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] min-w-0 rounded-2xl px-4 py-3 text-sm sm:max-w-[85%]",
          from === "you" ? "rounded-br-sm bg-muted" : "rounded-bl-sm border bg-background",
        )}
      >
        <span className="sr-only">{from === "you" ? "You: " : "tjob: "}</span>
        {children}
      </div>
    </div>
  );
}
