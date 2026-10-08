"use client";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, SendHorizontal } from "lucide-react";
import { MAX_TAILOR_REQUEST } from "@/lib/cv/chat";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { refineTailorChatAction, startTailorChatAction } from "./actions";
import { Bubble } from "./bubble";

type Sent = { text: string; kind: "job" | "request" };

const LEARNING_KEY = "tjob.tailor.learning";

/** The saved choice ("1"/"0"), or null when this browser has none. */
function readLearning(): string | null {
  try {
    return localStorage.getItem(LEARNING_KEY);
  } catch {
    return null;
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * The conversation's live parts: the message box, the message being worked on, and errors.
 * Messages already saved are rendered on the server and passed in as `children`.
 * Remount it per conversation (`key`) so nothing carries over between jobs.
 */
export function TailorChat({
  jobId,
  versionCount,
  initialLearning,
  disabledReason,
  footnote,
  children,
}: {
  jobId: string | null;
  versionCount: number;
  /** Whether the latest version lists skills under "Currently learning". */
  initialLearning: boolean;
  disabledReason: string | null;
  footnote: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A per-browser preference; without storage the checkbox still works for this visit.
  const stored = useSyncExternalStore(subscribeStorage, readLearning, () => null);
  const [override, setOverride] = useState<boolean | null>(null);
  // Without a saved choice, follow the conversation's latest version.
  const learning = override ?? (stored === null ? initialLearning : stored === "1");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const toggleLearning = (on: boolean) => {
    setOverride(on);
    try {
      localStorage.setItem(LEARNING_KEY, on ? "1" : "0");
    } catch {}
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [versionCount, sent, error]);

  const run = (message: Sent, call: () => Promise<Awaited<ReturnType<typeof startTailorChatAction>>>, restore = "") => {
    setError(null);
    setSent(message);
    start(async () => {
      const res = await call();
      if (!res.ok) {
        setError(res.message);
        setText(restore);
        setSent(null);
        return;
      }
      if (res.jobId !== jobId) router.push(`/tailor?job=${res.jobId}`);
      else setSent(null);
    });
  };

  const send = () => {
    const value = text.trim();
    if (!value || pending) return;
    const kind = !jobId || value.length > MAX_TAILOR_REQUEST ? "job" : "request";
    if (kind === "job" && value.length < 100) {
      setError("That looks too short for a job description. Paste the whole description.");
      return;
    }
    setText("");
    run(
      { text: value, kind },
      () => (kind === "job" ? startTailorChatAction(value, learning) : refineTailorChatAction(jobId!, value, learning)),
      value,
    );
  };

  const tailorAgain = () => {
    if (!jobId || pending) return;
    run({ text: "Tailor again", kind: "request" }, () => refineTailorChatAction(jobId, "", learning));
  };

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {children}
        {sent && (
          <>
            <Bubble from="you">
              {sent.kind === "job" ? (
                <p className="line-clamp-6 whitespace-pre-wrap">{sent.text}</p>
              ) : (
                <p className="whitespace-pre-wrap">{sent.text}</p>
              )}
            </Bubble>
            <Bubble from="tjob">
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {sent.kind === "job"
                  ? "Reading the job description, rewriting your CV and testing it. This takes 20–40 seconds."
                  : "Rewriting your CV and testing it again. This takes 20–40 seconds."}
              </p>
            </Bubble>
          </>
        )}
        {error && (
          <Bubble from="tjob">
            <p role="alert" className="text-destructive">
              {error}
            </p>
          </Bubble>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={jobId ? 2 : 5}
                className="max-h-60 overflow-y-auto max-sm:field-sizing-fixed"
                aria-label={jobId ? "Ask for a change or paste another job description" : "Paste a job description"}
                placeholder={
                  jobId
                    ? "Ask for a change, like “lead with my Node.js work” or “make the summary shorter”. Or paste another job description."
                    : "Paste the full job description here"
                }
              />
              <Button type="submit" size="icon" disabled={pending || !text.trim()} aria-label="Send">
                <SendHorizontal className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={learning} onCheckedChange={(v) => toggleLearning(v === true)} />
                List skills the job needs that I don&apos;t have yet as &ldquo;Currently learning&rdquo;
              </label>
              {jobId && (
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={tailorAgain}>
                  <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
                  Tailor again
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Ctrl+Enter to send · {footnote}</p>
          </>
        )}
      </form>
    </>
  );
}
