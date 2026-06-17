declare module 'pdf-parse' {
  function pdfParse(buffer: Buffer): Promise<{ text?: string }>
  export = pdfParse
}

declare module 'mammoth' {
  export function extractRawText(input: { buffer: Buffer }): Promise<{ value?: string }>
}

declare module 'pdf-to-img' {
  export function pdf(input: string | Buffer, options?: { scale?: number }): Promise<{
    length: number
    getPage(pageNumber: number): Promise<Buffer>
    destroy(): Promise<void>
  }>
}

declare module '@foliojs-fork/pdfkit' {
  export default class PDFDocument {
    constructor(options?: { size?: string; margin?: number })
    on(event: 'data', listener: (chunk: Buffer) => void): this
    on(event: 'end', listener: () => void): this
    fontSize(size: number): this
    text(text: string): this
    end(): void
  }
}
