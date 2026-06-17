import { XpertTypeEnum } from '@xpert-ai/contracts'
import {
  RESUME_INTAKE_MIDDLEWARE_NAME,
  RESUME_INTAKE_PLUGIN_NAME,
  RESUME_INTAKE_TOOL_NAMES
} from './constants.js'

export type ResumeIntakeAssistantTemplate = {
  key: string
  title: string
  type: XpertTypeEnum.Agent
  targetApps: string[]
  targetAppMeta: Record<string, {
    types: string[]
    capabilities: string[]
    requiredPlugins: string[]
  }>
  dslContent: string
  instructions: string
  startPrompts: string[]
}

export const RESUME_INTAKE_ASSISTANT_TEMPLATE_KEY = 'resume-intake-assistant'

export const resumeIntakeAssistantInstructions = [
  '你是简历识别助手，负责把已导入的简历 ZIP 批次整理成可审核的候选人结构化信息。',
  `先调用 ${RESUME_INTAKE_TOOL_NAMES[0]} 获取批次内候选人目录和来源材料清单。`,
  `必须调用 ${RESUME_INTAKE_TOOL_NAMES[4]} 读取候选人的简历和证明材料内容，不要只根据文件名保存候选人信息。`,
  '如果 PDF 读取结果是 empty_text，说明它很可能是扫描件；优先查看随消息附上的 PDF 页面 PNG 图片附件，从图片中识别内容。',
  '逐个候选人阅读简历和证明材料，抽取姓名、手机号、邮箱、目标岗位、最高学历、学校、专业、工作年限、技能、证书、工作经历和教育经历。',
  `每完成一个候选人，调用 ${RESUME_INTAKE_TOOL_NAMES[1]} 保存结构化结果，并尽量给关键字段提供 evidence。`,
  `如果某个候选人材料无法可靠识别，调用 ${RESUME_INTAKE_TOOL_NAMES[2]} 记录失败原因，不要编造信息。`,
  `全部候选人处理完后，调用 ${RESUME_INTAKE_TOOL_NAMES[3]} 完成批次。`,
  '用户可以在“简历识别工作台”里查看批次、候选人详情、来源文件预览、字段证据和重识别任务。',
  '当用户要求重新识别某个候选人时，优先围绕该候选人的 batchId 与 candidateKey 重新读取材料并覆盖保存。',
  '回答用户时说明已处理数量、失败数量，以及需要人工复核的字段。'
].join('\n')

export const resumeIntakeAssistantDsl = `team:
  name: 简历识别助手
  type: agent
  title: 简历识别助手
  description: 上传简历 ZIP 后，自动整理候选人材料并保存结构化候选人信息。
  avatar:
    emoji:
      id: card_index
      set: ""
      colons: ":card_index:"
      unified: 1F4C7
    background: rgba(213, 245, 246, 0.8)
  starters:
    - 请识别刚导入的简历 ZIP 批次，并保存候选人结构化信息。
    - 请列出这个批次的候选人和材料清单。
    - 请重新检查失败或待复核的候选人。
    - 请重新识别选中的候选人，并保留来源证据。
  options:
    position:
      x: 160
      y: 80
    scale: 1
    agent:
      Agent_ResumeIntake:
        position:
          x: 80
          y: 40
    workflow:
      Middleware_ResumeIntake:
        position:
          x: 80
          y: 280
  agentConfig:
    recursionLimit: 200
    maxConcurrency: 5
    stateVariables: []
  memory: null
  summarize: null
  features:
    attachment:
      enabled: true
      type: upload
      maxNum: 20
      fileTypes:
        - document
        - image
        - others
  version: "1"
  agent:
    key: Agent_ResumeIntake
  copilotModel:
    modelType: llm
    model: gpt-4o
    options:
      temperature: 0.1
      maxRetries: 3
  knowledgebases: []
  toolsets: []
  tags:
    - resume
    - hr
    - intake
nodes:
  - type: agent
    key: Agent_ResumeIntake
    position:
      x: 80
      y: 40
    entity:
      key: Agent_ResumeIntake
      name: 简历识别助手
      title: 简历识别助手
      description: 识别简历 ZIP 批次，保存候选人结构化信息并保留证据。
      avatar: null
      prompt: |-
        ${resumeIntakeAssistantInstructions.split('\n').join('\n        ')}

        工作流要求：
        - 用户通常会先在“简历识别”工作台上传 ZIP，上传成功后会得到 batchId。
        - 如果用户没有提供 batchId，请让用户先上传 ZIP，或者提供需要处理的 batchId。
        - 每个候选人目录通常对应一个人，例如“张三/”或“李四/”。
        - 必须用 ${RESUME_INTAKE_TOOL_NAMES[4]} 读取 documentId 对应的来源材料；如果 PDF 返回 empty_text，优先查看随消息附上的 PDF 页面 PNG 图片附件；如果材料仍不可读，再记录失败或低置信度，而不是根据文件名猜测。
        - 简历正文优先用于抽取个人信息和经历，学历证明、离职证明、证书等材料用于补充和校验。
        - 证据 evidenceText 必须来自原文或文件可见内容，无法确认时留空字段或记录失败。
        - 如果来自工作台的重识别消息包含 reparseJobId，请在完成保存后说明该候选人已重新识别。
      promptTemplates: null
      parameters:
        - type: text
          name: batchId
          title: 导入批次 ID
          description: 从简历识别工作台上传 ZIP 后返回的 batchId。
          optional: true
          maximum: null
          options: null
      outputVariables: null
      options:
        vision:
          enabled: true
        attachment:
          enabled: true
          variable: null
      copilotModel: null
      leaderKey: null
      collaboratorNames: []
      toolsetIds: []
      knowledgebaseIds: []
  - type: workflow
    key: Middleware_ResumeIntake
    position:
      x: 80
      y: 280
    entity:
      id: Middleware_ResumeIntake
      type: middleware
      key: Middleware_ResumeIntake
      title: 简历包识别
      provider: ${RESUME_INTAKE_MIDDLEWARE_NAME}
      required: true
      options: {}
connections:
  - type: workflow
    key: Agent_ResumeIntake/Middleware_ResumeIntake
    from: Agent_ResumeIntake
    to: Middleware_ResumeIntake
`

export const resumeIntakeAssistantTemplate: ResumeIntakeAssistantTemplate = {
  key: RESUME_INTAKE_ASSISTANT_TEMPLATE_KEY,
  title: '简历识别助手',
  type: XpertTypeEnum.Agent,
  targetApps: ['data-xpert'],
  targetAppMeta: {
    'data-xpert': {
      types: ['business-assistant'],
      capabilities: ['resume-zip-intake', 'resume-extraction', 'candidate-review-workbench'],
      requiredPlugins: [RESUME_INTAKE_PLUGIN_NAME]
    }
  },
  dslContent: resumeIntakeAssistantDsl,
  instructions: resumeIntakeAssistantInstructions,
  startPrompts: [
    '请识别刚导入的简历 ZIP 批次，并保存候选人结构化信息。',
    '请列出这个简历 ZIP 批次中的候选人和来源材料。',
    '请重新检查这个批次中失败或待复核的候选人。',
    '请重新识别选中的候选人，并覆盖保存结构化信息。'
  ]
}

export const resumeIntakeTemplates = [resumeIntakeAssistantTemplate]
