import { unauthorized, userIdFromRequest } from "@/lib/api-auth";
import { renderCvDocx } from "@/lib/cv/docx";
import { cvFileName, cvForDownload } from "@/lib/cv/service";

/** Word (.docx) copy of a tailored CV version, or of the master CV with id "master". */
export async function GET(request: Request, ctx: RouteContext<"/api/cv/[id]/docx">) {
  const userId = await userIdFromRequest(request);
  if (!userId) return unauthorized();
  const found = await cvForDownload(userId, (await ctx.params).id);
  if (!found) return Response.json({ error: "Not found" }, { status: 404 });

  const docx = await renderCvDocx(found.cv, found.title);
  return new Response(new Uint8Array(docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${cvFileName(found.cv, found.title, "docx")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
