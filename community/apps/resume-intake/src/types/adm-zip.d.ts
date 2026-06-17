declare module 'adm-zip' {
  export interface IZipEntry {
    entryName: string
    rawEntryName: Buffer
    isDirectory: boolean
    header: {
      size: number
    }
    getData(): Buffer
  }

  export default class AdmZip {
    constructor(input?: Buffer | { decoder?: unknown })
    getEntries(): IZipEntry[]
    addFile(entryName: string, data: Buffer): void
    toBuffer(): Buffer
  }
}
