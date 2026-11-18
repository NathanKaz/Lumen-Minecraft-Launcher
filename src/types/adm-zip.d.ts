declare module 'adm-zip' {
  interface AdmZipEntry {
    entryName: string
    getData(): Buffer
    isDirectory: boolean
  }

  class AdmZip {
    constructor(input?: string | Buffer)
    getEntries(): AdmZipEntry[]
    getEntry(name: string): AdmZipEntry | null
    readAsText(name: string): string
    extractEntryTo(entry: AdmZipEntry, targetPath: string, maintainEntryPath?: boolean, overwrite?: boolean): boolean
    extractAllTo(targetPath: string, overwrite?: boolean): void
  }

  export = AdmZip
}
