declare module 'adm-zip' {
  interface AdmZipEntry {
    entryName: string
    getData(): Buffer
    isDirectory: boolean
  }

  interface ZipEntryData {
    entryName: string
    data: Buffer
    attr?: number
    comment?: string
    date?: Date
  }

  class AdmZip {
    constructor(input?: string | Buffer)
    getEntries(): AdmZipEntry[]
    getEntry(name: string): AdmZipEntry | null
    readAsText(name: string): string
    extractEntryTo(entry: AdmZipEntry, targetPath: string, maintainEntryPath?: boolean, overwrite?: boolean): boolean
    extractAllTo(targetPath: string, overwrite?: boolean): void
    addFile(entry: ZipEntryData | string, data?: Buffer | string, comment?: string, attr?: number, date?: Date): void
    addLocalFolder(localPath: string, zipPath?: string, filter?: (entry: string) => boolean): void
    toBuffer(): Buffer
    writeZip(targetPath: string, callback?: (error: Error | null) => void): boolean
  }

  export = AdmZip
}
