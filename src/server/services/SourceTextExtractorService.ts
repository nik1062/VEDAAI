import { PDFParse } from "pdf-parse";
import { AppError } from "../errors/AppError.js";

export interface UploadedBufferSource {
  readonly originalName: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

export class SourceTextExtractorService {
  async extractText(file: UploadedBufferSource): Promise<string> {
    if (file.mimeType === "text/plain") {
      return this.normalizeExtractedText(file.buffer.toString("utf8"));
    }

    if (file.mimeType === "application/pdf") {
      const parser = new PDFParse({ data: file.buffer });

      try {
        const parsedPdf = await parser.getText();
        return this.normalizeExtractedText(parsedPdf.text);
      } catch (error: unknown) {
        console.error("PDF Extraction Error:", error);
        throw new AppError(
          500,
          "PDF_EXTRACTION_FAILED",
          "Failed to extract text from the PDF file.",
        );
      } finally {
        await (parser as any).destroy?.();
      }
    }

    throw new AppError(
      415,
      "UNSUPPORTED_SOURCE_TYPE",
      "Only PDF and plain text source files are supported.",
    );
  }

  private normalizeExtractedText(text: string): string {
    const normalizedText = text.replace(/\u0000/gu, "").replace(/\s+/gu, " ").trim();

    if (normalizedText.length < 80) {
      throw new AppError(
        422,
        "SOURCE_TEXT_TOO_SHORT",
        "The uploaded source must contain at least 80 extractable characters.",
      );
    }

    if (normalizedText.length > 120_000) {
      throw new AppError(
        413,
        "SOURCE_TEXT_TOO_LARGE",
        "The uploaded source cannot exceed 120,000 extracted characters.",
      );
    }

    return normalizedText;
  }
}
