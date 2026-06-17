export type ResumeDocumentRole = 'resume' | 'education_proof' | 'employment_proof' | 'certificate' | 'other'

export interface GroupedResumeArchiveFile {
  relativePath: string
  fileName: string
  documentRole: ResumeDocumentRole
}

export interface GroupedResumeArchiveCandidate {
  candidateKey: string
  files: GroupedResumeArchiveFile[]
}

export function normalizeArchiveEntryName(entryName: string): string {
  let normalized = entryName
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .trim()

  while (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1)
  }

  const parts = normalized.split('/').filter(Boolean)
  const unsafe =
    !normalized ||
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    parts.some((part) => part === '..' || part === '.')

  if (unsafe) {
    throw new Error(`Unsafe archive entry: ${entryName}`)
  }

  return parts.join('/')
}

export function groupResumeArchiveEntries(entryNames: string[]): GroupedResumeArchiveCandidate[] {
  const groups = new Map<string, GroupedResumeArchiveFile[]>()

  for (const rawEntryName of entryNames) {
    const relativePath = normalizeArchiveEntryName(rawEntryName)
    if (!relativePath.includes('.')) {
      continue
    }

    const parts = relativePath.split('/')
    const fileName = parts[parts.length - 1] ?? relativePath
    const candidateKey = resolveCandidateKey(parts, fileName)
    const files = groups.get(candidateKey) ?? []
    files.push({
      relativePath,
      fileName,
      documentRole: inferResumeDocumentRole(fileName)
    })
    groups.set(candidateKey, files)
  }

  return Array.from(groups.entries()).map(([candidateKey, files]) => ({
    candidateKey,
    files
  }))
}

function resolveCandidateKey(parts: string[], fileName: string) {
  if (parts.length > 1) {
    return parts[0] ?? fileName
  }

  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  const [prefix] = withoutExt.split(/[_\-—\s]+/)
  return prefix || withoutExt
}

export function inferResumeDocumentRole(fileName: string): ResumeDocumentRole {
  const normalized = fileName.toLowerCase()

  if (/简历|resume|cv/.test(normalized)) {
    return 'resume'
  }
  if (/学历|学位|毕业|education|degree/.test(normalized)) {
    return 'education_proof'
  }
  if (/离职|在职|工作证明|employment|resignation|work-proof/.test(normalized)) {
    return 'employment_proof'
  }
  if (/证书|资格|certificate|cert/.test(normalized)) {
    return 'certificate'
  }

  return 'other'
}
