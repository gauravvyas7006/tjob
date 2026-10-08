import { unauthorized, userIdFromRequest } from "@/lib/api-auth";
import { renderCvPdf } from "@/lib/cv/render";
import { cvFileName, cvForDownload } from "@/lib/cv/service";

/** PDF of a tailored CV version, or of the master CV with id "master". ?inline=1 to view in the browser. */
export async function GET(request: Request, ctx: RouteContext<"/api/cv/[id]/pdf">) {
  const userId = await userIdFromRequest(request);
  if (!userId) return unauthorized();
  const found = await cvForDownload(userId, (await ctx.params).id);
  if (!found) return Response.json({ error: "Not found" }, { status: 404 });

  const pdf = await renderCvPdf(found.cv, found.title);
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${cvFileName(found.cv, found.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
