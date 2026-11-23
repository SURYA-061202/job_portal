declare module 'pdf-parse' {
  interface PDFInfo {
    PDFFormatVersion: string;
    IsAcroFormPresent: boolean;
    IsXFAPresent: boolean;
    [key: string]: unknown;
  }

  interface PDFData {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata: unknown;
    text: string;
    version: string;
  }

  function parse(dataBuffer: Buffer, options?: {
    pagerender?: (pageData: unknown) => string;
    max?: number;
    version?: string;
  }): Promise<PDFData>;

  export = parse;
} 