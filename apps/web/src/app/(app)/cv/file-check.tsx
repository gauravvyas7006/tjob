"use client";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { FileReadability } from "@/lib/cv/ats-test";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { testCvFilesAction } from "./actions";

type Result = { fileName: string; uploaded: FileReadability | null; tjob: FileReadability };

const ICON = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle };
const COLOR = { pass: "text-good", warn: "text-warning", fail: "text-critical" };
const LABEL = { pass: "Passed", warn: "Could be better", fail: "Failed" };

function FileResult({ title, r, note }: { title: string; r: FileReadability | null; note?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      {r ? (
        <>
          <div className="text-xl font-semibold tabular-nums">
            {r.score} <span className="text-sm font-normal text-muted-foreground">/ 100 readable</span>
          </div>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {r.items.map((i) => {
              const Icon = ICON[i.status];
              return (
                <li key={i.id} className="flex gap-2">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", COLOR[i.status])} aria-hidden />
                  <span>
                    {i.label}
                    <span className="sr-only"> ({LABEL[i.status]})</span>
                    {i.status !== "pass" && <span className="block text-muted-foreground">{i.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{note}</p>
      )}
    </div>
  );
}

/** Shows how an ATS reads the CV file the user uploaded, next to tjob's PDF. */
export function CvFileCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await testCvFilesAction();
              if (res.ok) setResult(res);
              else toast.error(res.message);
            })
          }
        >
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {pending ? "Reading your files…" : result ? "Test again" : "Test how an ATS reads my files"}
        </Button>
      </div>
      {result && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FileResult
              title={result.fileName ? `Your uploaded file (${result.fileName})` : "Your uploaded file"}
              r={result.uploaded}
              note="You typed your CV in, so there's no uploaded file to test."
            />
            <FileResult title="tjob's PDF of the same CV" r={result.tjob} />
          </div>
          <p className="text-xs text-muted-foreground">
            {result.uploaded && result.uploaded.score < result.tjob.score
              ? "An ATS reads tjob's PDF better than your own file. Upload tjob's PDF (or a tailored one) to job sites."
              : "Both files read well. tjob's tailored PDFs also add the job's keywords."}
          </p>
        </>
      )}
    </div>
  );
}
