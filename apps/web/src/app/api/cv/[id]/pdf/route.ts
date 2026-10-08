import { unauthorized, userIdFromRequest } from "@/lib/api-auth";
import { renderCvPdf } from "@/lib/cv/render";
import { cvFileName, getCvVersion, getMasterCv } from "@/lib/cv/service";

/** PDF of a tailored CV version, or of the master CV with id "master". ?inline=1 to view in the browser. */
export async function GET(request: Request, ctx: RouteContext<"/api/cv/[id]/pdf">) {
  const userId = await userIdFromRequest(request);
  if (!userId) return unauthorized();
  const { id } = await ctx.params;

  let cv;
  let title;
  if (id === "master") {
    const master = await getMasterCv(userId);
    if (!master) return Response.json({ error: "No CV uploaded" }, { status: 404 });
    cv = master.data;
    title = master.data.headline || "CV";
  } else {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
    const version = await getCvVersion(userId, id);
    if (!version) return Response.json({ error: "Not found" }, { status: 404 });
    cv = version.data;
    title = version.title;
  }

  const pdf = await renderCvPdf(cv, title);
  const fileName = cvFileName(cv, title);
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
