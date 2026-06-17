import assert from 'node:assert/strict'
import { groupResumeArchiveEntries, normalizeArchiveEntryName } from './resume-file-grouping.js'

const entries = [
  '张三/',
  '张三/张三-简历.pdf',
  '张三/学历证明.jpg',
  '张三/离职证明.png',
  '李四/',
  '李四/李四简历.docx',
  '李四/证书.pdf'
]

const grouped = groupResumeArchiveEntries(entries)
assert.equal(grouped.length, 2)
assert.deepEqual(
  grouped.map((item) => item.candidateKey),
  ['张三', '李四']
)
assert.deepEqual(
  grouped[0].files.map((file) => file.relativePath),
  ['张三/张三-简历.pdf', '张三/学历证明.jpg', '张三/离职证明.png']
)
assert.equal(grouped[0].files[0].documentRole, 'resume')
assert.equal(grouped[0].files[1].documentRole, 'education_proof')
assert.equal(grouped[0].files[2].documentRole, 'employment_proof')
assert.equal(grouped[1].files[0].documentRole, 'resume')
assert.equal(grouped[1].files[1].documentRole, 'certificate')

assert.equal(normalizeArchiveEntryName('\\u5f20\\u4e09\\\\\\u7b80\\u5386.pdf'), '张三/简历.pdf')
assert.throws(() => normalizeArchiveEntryName('../evil.pdf'), /Unsafe archive entry/)
assert.throws(() => normalizeArchiveEntryName('/absolute/evil.pdf'), /Unsafe archive entry/)

console.log('resume-file-grouping.spec.ts passed')
