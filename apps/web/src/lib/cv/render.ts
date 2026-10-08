import "server-only";
import { createElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { Cv } from "@tjob/shared";
import { CvDocument } from "./pdf-template";

export async function renderCvPdf(cv: Cv, title: string): Promise<Buffer> {
  const doc = createElement(CvDocument, { cv, title }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(doc);
}
