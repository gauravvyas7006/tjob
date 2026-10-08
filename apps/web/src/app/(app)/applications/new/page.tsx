import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/session";
import { NewApplicationForm } from "./form";

export const metadata = { title: "Add application" };
export const maxDuration = 120;

export default async function NewApplicationPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add application"
        description="For jobs you found outside the extension. Paste the job description to get requirements, Insights data and a tailored CV."
      />
      <NewApplicationForm />
    </div>
  );
}
