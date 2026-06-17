;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  let pendingInitialContext = null
  const pendingHostEvents = []
  const pending = new Map()

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function post(type, body, transfer) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(Object.assign({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type }, body || {}), '*', transfer || [])
  }

  function request(type, body, transfer) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      try {
        post(type, Object.assign({ requestId }, body || {}), transfer)
      } catch (error) {
        pending.delete(requestId)
        reject(error)
      }
    })
  }

  function reportResize() {
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 620)
    post('resize', { height })
  }

  function toFilePayload(file) {
    return file.arrayBuffer().then((buffer) => ({
      payload: {
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        size: file.size,
        buffer
      },
      transfer: [buffer]
    }))
  }

  function requestData(query) {
    return request('requestData', { query }).then((response) => response.data || {})
  }

  function actionResult(response) {
    const result = response && response.result
    if (!isObject(result)) return {}
    if (result.success === false) {
      throw new Error(localizedMessage(result.message) || '操作失败')
    }
    return result
  }

  function actionData(response) {
    const data = actionResult(response).data
    return data == null ? {} : data
  }

  function localizedMessage(message) {
    if (typeof message === 'string') return message
    if (!isObject(message)) return ''
    return message.zh_Hans || message.en_US || ''
  }

  function clientCommandResult(response) {
    return response && response.result ? response.result : {}
  }

  function executeAction(actionKey, targetId, input, parameters) {
    return request('executeAction', { actionKey, targetId, input, parameters })
  }

  function executeFileAction(actionKey, file, input, parameters) {
    return toFilePayload(file).then((filePayload) =>
      request('executeFileAction', {
        actionKey,
        file: filePayload.payload,
        input,
        parameters
      }, filePayload.transfer)
    )
  }

  function invokeClientCommand(commandKey, payload) {
    return request('invokeClientCommand', { commandKey, payload }).then(clientCommandResult)
  }

  function autoStartBatchRecognition(data) {
    if (!data || !data.batchId) return Promise.resolve({ success: false, code: 'missing_batch' })
    return executeAction('prepare_import_batch_reparse_chat_message', data.batchId, { batchId: data.batchId }, {
      viewMode: 'candidates',
      batchId: data.batchId
    }).then((response) => {
      const message = actionData(response)
      return sendBatchRecognitionMessage(data.batchId, message)
    })
  }

  function sendBatchRecognitionMessage(batchId, message) {
    if (!message || !message.input) {
      return Promise.resolve({ success: false, code: 'empty_message' })
    }
    return invokeClientCommand(message.commandKey || 'assistant.chat.send_message', {
      input: message.input,
      context: Object.assign({}, message.context || {}, { batchId }),
      files: selectAutoRecognitionFiles(message.files || [])
    }).then((commandResponse) => Object.assign({ success: true }, commandResponse || {}))
  }

  function selectAutoRecognitionFiles(documents) {
    if (!Array.isArray(documents)) return []
    const maxFiles = 40
    const maxBytes = 80 * 1024 * 1024
    const renderedSourceIds = new Set(documents
      .filter((document) => document && document.attachmentKind === 'rendered_pdf_page' && document.sourceDocumentId)
      .map((document) => document.sourceDocumentId))
    let bytes = 0
    return interleaveDocumentsByCandidate(documents
      .filter((document) => document && document.id && document.fileUrl)
      .filter((document) => !isRedundantSourcePdf(document, renderedSourceIds))
      .sort((left, right) => documentPriority(left) - documentPriority(right)))
      .filter((document) => {
        const size = Number(document.size) || 0
        if (bytes + size > maxBytes) return false
        bytes += size
        return true
      })
      .slice(0, maxFiles)
  }

  function interleaveDocumentsByCandidate(documents) {
    const grouped = new Map()
    documents.forEach((document) => {
      const key = document.candidateKey || document.sourceDocumentId || 'unknown'
      const group = grouped.get(key) || []
      group.push(document)
      grouped.set(key, group)
    })
    const result = []
    let hasItems = true
    while (hasItems) {
      hasItems = false
      grouped.forEach((group) => {
        const item = group.shift()
        if (item) {
          result.push(item)
          hasItems = true
        }
      })
    }
    return result
  }

  function isRedundantSourcePdf(document, renderedSourceIds) {
    return document.attachmentKind === 'source_document' &&
      document.mimeType === 'application/pdf' &&
      renderedSourceIds.has(document.sourceDocumentId)
  }

  function documentPriority(document) {
    if (document && document.attachmentKind === 'rendered_pdf_page') return -1
    const role = document && document.documentRole
    if (role === 'resume') return 0
    if (role === 'education_proof') return 1
    if (role === 'employment_proof') return 2
    if (role === 'certificate') return 3
    return 4
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return

    if (message.type === 'init') {
      instanceId = message.instanceId
      const context = {
        initialQuery: message.initialQuery || {},
        payload: message.payload || {},
        locale: message.locale,
        theme: message.theme
      }
      if (window.__resumeAppSetContext) {
        window.__resumeAppSetContext(context)
      } else {
        pendingInitialContext = context
      }
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) return

    if (message.type === 'hostEvent') {
      if (window.__resumeAppHandleHostEvent) {
        window.__resumeAppHandleHostEvent(message.event)
      } else {
        pendingHostEvents.push(message.event)
      }
      return
    }

    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.type === 'error') {
        item.reject(new Error(message.message || '远程请求失败'))
      } else {
        item.resolve(message)
      }
    }
  })

  function App() {
    const [context, setContext] = React.useState(null)
    const [tab, setTab] = React.useState('batches')
    const [batches, setBatches] = React.useState([])
    const [candidates, setCandidates] = React.useState([])
    const [detail, setDetail] = React.useState(null)
    const [selectedBatchId, setSelectedBatchId] = React.useState('')
    const [selectedCandidateId, setSelectedCandidateId] = React.useState('')
    const [notice, setNotice] = React.useState('')
    const [loading, setLoading] = React.useState(false)
    const [uploading, setUploading] = React.useState(false)
    const [recognitionRefreshUntil, setRecognitionRefreshUntil] = React.useState(0)
    const noticeTimerRef = React.useRef(null)
    const contextRef = React.useRef(null)
    const tabRef = React.useRef(tab)
    const selectedBatchIdRef = React.useRef(selectedBatchId)
    const selectedCandidateIdRef = React.useRef(selectedCandidateId)

    React.useEffect(() => {
      contextRef.current = context
      tabRef.current = tab
      selectedBatchIdRef.current = selectedBatchId
      selectedCandidateIdRef.current = selectedCandidateId
    }, [context, tab, selectedBatchId, selectedCandidateId])

    React.useEffect(() => {
      function applyInitialContext(nextContext) {
        contextRef.current = nextContext
        setContext(nextContext)
        const parameters = Object.assign({}, nextContext.payload && nextContext.payload.parameters, nextContext.initialQuery && nextContext.initialQuery.parameters)
        if (parameters.batchId) setSelectedBatchId(parameters.batchId)
        if (parameters.candidateId) setSelectedCandidateId(parameters.candidateId)
      }
      window.__resumeAppSetContext = applyInitialContext
      window.__resumeAppHandleHostEvent = () => {
        loadCurrent({ silent: true })
      }
      if (pendingInitialContext) {
        applyInitialContext(pendingInitialContext)
        pendingInitialContext = null
      }
      while (pendingHostEvents.length) {
        window.__resumeAppHandleHostEvent(pendingHostEvents.shift())
      }
      return () => {
        window.__resumeAppSetContext = null
        window.__resumeAppHandleHostEvent = null
      }
    }, [])

    React.useEffect(() => () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = null
      }
    }, [])

    React.useEffect(() => {
      if (context) loadCurrent()
    }, [context, tab, selectedBatchId, selectedCandidateId])

    React.useEffect(() => {
      if (!context || !recognitionRefreshUntil) return
      const refresh = () => {
        if (Date.now() >= recognitionRefreshUntil) {
          setRecognitionRefreshUntil(0)
          return
        }
        loadCurrent({ silent: true })
      }
      refresh()
      const refreshTimer = window.setInterval(refresh, 3000)
      return () => window.clearInterval(refreshTimer)
    }, [context, recognitionRefreshUntil, selectedBatchId, selectedCandidateId, tab])

    React.useEffect(() => {
      setTimeout(reportResize, 0)
    }, [batches, candidates, detail, notice, loading, uploading, tab])

    function startRecognitionRefreshWindow() {
      setRecognitionRefreshUntil(Date.now() + 3 * 60 * 1000)
    }

    function showNotice(message, options) {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = null
      }
      setNotice(message || '')
      const timeout = options && options.timeout === 0 ? 0 : (options && options.timeout) || 5000
      if (message && timeout > 0) {
        const noticeTimer = window.setTimeout(() => {
          setNotice('')
          if (noticeTimerRef.current === noticeTimer) {
            noticeTimerRef.current = null
          }
        }, timeout)
        noticeTimerRef.current = noticeTimer
      }
    }

    function baseQuery(viewMode, overrides) {
      const batchId = overrides && Object.prototype.hasOwnProperty.call(overrides, 'batchId')
        ? overrides.batchId
        : selectedBatchIdRef.current
      const candidateId = overrides && Object.prototype.hasOwnProperty.call(overrides, 'candidateId')
        ? overrides.candidateId
        : selectedCandidateIdRef.current
      return {
        page: 1,
        pageSize: 50,
        parameters: {
          viewMode,
          batchId: batchId || undefined,
          candidateId: candidateId || undefined
        }
      }
    }

    function loadCurrent(options) {
      if (!contextRef.current) return Promise.resolve()
      const silent = options && options.silent
      if (!silent) setLoading(true)
      const currentTab = options && options.viewMode ? options.viewMode : tabRef.current
      const mode = currentTab === 'detail' ? 'candidate_detail' : currentTab
      return requestData(baseQuery(mode, options))
        .then((data) => {
          if (mode === 'batches') setBatches(data.items || [])
          if (mode === 'candidates') setCandidates(data.items || [])
          if (mode === 'candidate_detail') setDetail((data.items || [])[0] || null)
        })
        .catch((error) => {
          if (!silent) showNotice(error.message || '加载失败', { timeout: 8000 })
        })
        .finally(() => {
          if (!silent) setLoading(false)
        })
    }

    function uploadZip(event) {
      const file = event.target.files && event.target.files[0]
      if (!file) return
      setUploading(true)
      executeFileAction('upload_resume_zip', file, null, baseQuery('batches').parameters)
        .then((response) => {
          const data = actionData(response)
          showNotice('ZIP 已导入，批次 ID：' + (data.batchId || ''))
          if (data.batchId) {
            selectedBatchIdRef.current = data.batchId
            selectedCandidateIdRef.current = ''
            tabRef.current = 'candidates'
            setSelectedBatchId(data.batchId)
            setSelectedCandidateId('')
            setTab('candidates')
            return autoStartBatchRecognition(data).then((commandResult) => {
              if (commandResult && commandResult.success === false) {
                showNotice('ZIP 已导入，批次 ID：' + data.batchId + '。请在右侧 Assistant 手动发送识别请求。', { timeout: 8000 })
                return data
              }
              startRecognitionRefreshWindow()
              showNotice('ZIP 已导入，批次 ID：' + data.batchId + '。已发送批次自动识别请求。')
              return data
            })
          }
          return data
        })
        .then((data) => data && data.batchId
          ? loadCurrent({ viewMode: 'candidates', batchId: data.batchId, candidateId: '' })
          : loadCurrent()
        )
        .catch((error) => showNotice(error.message || '上传失败', { timeout: 8000 }))
        .finally(() => {
          setUploading(false)
          event.target.value = ''
        })
    }

    function selectBatch(batchId) {
      selectedBatchIdRef.current = batchId
      selectedCandidateIdRef.current = ''
      tabRef.current = 'candidates'
      setSelectedBatchId(batchId)
      setSelectedCandidateId('')
      setTab('candidates')
    }

    function deleteBatch(batchId) {
      if (!window.confirm('删除该批次及其识别结果？')) return
      executeAction('delete_import_batch', batchId, { batchId }, baseQuery('batches').parameters)
        .then(() => {
          if (selectedBatchIdRef.current === batchId) {
            selectedBatchIdRef.current = ''
            selectedCandidateIdRef.current = ''
            tabRef.current = 'batches'
            setSelectedBatchId('')
            setSelectedCandidateId('')
            setCandidates([])
            setDetail(null)
            setTab('batches')
          }
          showNotice('简历批次已删除')
        })
        .then(() => loadCurrent())
        .catch((error) => showNotice(error.message || '删除批次失败', { timeout: 8000 }))
    }

    function reparseBatch(batchId) {
      executeAction('prepare_import_batch_reparse_chat_message', batchId, { batchId }, baseQuery('batches').parameters)
        .then((response) => {
          const message = actionData(response)
          return sendBatchRecognitionMessage(batchId, message)
        })
        .then(() => {
          selectedBatchIdRef.current = batchId
          selectedCandidateIdRef.current = ''
          tabRef.current = 'candidates'
          setSelectedBatchId(batchId)
          setSelectedCandidateId('')
          setTab('candidates')
          startRecognitionRefreshWindow()
          showNotice('已发送批次重新解析请求')
        })
        .then(() => loadCurrent())
        .catch((error) => showNotice(error.message || '发送重新解析失败', { timeout: 8000 }))
    }

    function selectCandidate(candidateId) {
      selectedCandidateIdRef.current = candidateId
      tabRef.current = 'detail'
      setSelectedCandidateId(candidateId)
      setTab('detail')
    }

    function approveCandidate(candidateId) {
      executeAction('approve_candidate', candidateId, null, baseQuery('detail').parameters)
        .then(() => showNotice('候选人信息已确认'))
        .then(() => loadCurrent())
        .catch((error) => showNotice(error.message || '确认失败', { timeout: 8000 }))
    }

    function rejectCandidate(candidateId) {
      const reviewComment = window.prompt('请输入驳回原因', '信息需要重新核对')
      if (reviewComment == null) return
      executeAction('reject_candidate', candidateId, { reviewComment }, baseQuery('detail').parameters)
        .then(() => showNotice('候选人信息已驳回'))
        .then(() => loadCurrent())
        .catch((error) => showNotice(error.message || '驳回失败', { timeout: 8000 }))
    }

    function openDocument(documentId) {
      executeAction('resolve_source_document_file', documentId, { documentId }, baseQuery('detail').parameters)
        .then((response) => invokeClientCommand('workbench.file.open', actionData(response)))
        .catch((error) => showNotice(error.message || '打开来源文件失败', { timeout: 8000 }))
    }

    function sendReparse(candidateId) {
      executeAction('prepare_candidate_reparse_chat_message', candidateId, { candidateId }, baseQuery('detail').parameters)
        .then((response) => {
          const message = actionData(response)
          return invokeClientCommand(message.commandKey || 'assistant.chat.send_message', {
            input: message.input,
            context: message.context,
            files: message.files || []
          }).then((commandResponse) =>
            executeAction('mark_candidate_reparse_dispatched', candidateId, {
              reparseJobId: message.context && message.context.reparseJobId,
              conversationId: commandResponse.conversationId,
              threadId: commandResponse.threadId,
              clientMessageId: commandResponse.clientMessageId
            }, baseQuery('detail').parameters)
          )
        })
        .then(() => {
          startRecognitionRefreshWindow()
          showNotice('已发送到右侧 Assistant 重新识别')
        })
        .then(() => loadCurrent())
        .catch((error) => showNotice(error.message || '发送重识别失败', { timeout: 8000 }))
    }

    function startBackgroundReparse(candidateId) {
      executeAction('start_candidate_reparse', candidateId, { candidateId }, baseQuery('detail').parameters)
        .then(() => showNotice('已启动后台重识别任务'))
        .then(() => loadCurrent())
        .catch((error) => showNotice(error.message || '启动重识别失败', { timeout: 8000 }))
    }

    return h('main', { className: 'resume-shell' },
      h('header', { className: 'resume-header' },
        h('div', null,
          h('h1', null, '简历识别工作台'),
          h('p', null, 'ZIP 导入、候选人识别、来源证据审核和重识别任务。')
        ),
        h('label', { className: 'upload-button' },
          uploading ? '上传中...' : '上传 ZIP',
          h('input', { type: 'file', accept: '.zip,application/zip', onChange: uploadZip, disabled: uploading })
        )
      ),
      h('nav', { className: 'tabs' },
        tabButton('batches', '批次', tab, setTab),
        tabButton('candidates', '候选人', tab, setTab, !selectedBatchId),
        tabButton('detail', '详情与证据', tab, setTab, !selectedCandidateId)
      ),
      notice ? h('div', { className: 'notice' }, notice) : null,
      loading ? h('div', { className: 'loading' }, '加载中...') : null,
      tab === 'batches' ? renderBatches(batches, selectBatch, reparseBatch, deleteBatch) : null,
      tab === 'candidates' ? renderCandidates(candidates, selectCandidate, approveCandidate, rejectCandidate) : null,
      tab === 'detail' ? renderDetail(detail, openDocument, approveCandidate, rejectCandidate, sendReparse, startBackgroundReparse) : null
    )
  }

  function tabButton(key, label, active, setTab, disabled) {
    return h('button', {
      type: 'button',
      className: active === key ? 'tab active' : 'tab',
      disabled,
      onClick: () => setTab(key)
    }, label)
  }

  function renderBatches(items, onSelect, onReparse, onDelete) {
    if (!items.length) return h('section', { className: 'empty' }, '暂无简历导入批次，请先上传 ZIP。')
    return h('section', { className: 'panel' },
      h('div', { className: 'table' },
        h('div', { className: 'row head' }, h('span', null, 'ZIP'), h('span', null, '状态'), h('span', null, '候选人'), h('span', null, '文件'), h('span', null, '操作')),
        items.map((item) => h('div', { className: 'row', key: item.id },
          h('span', null, item.sourceFileName),
          h('span', null, item.status),
          h('span', null, String(item.candidateCount || 0)),
          h('span', null, String(item.documentCount || 0)),
          h('span', { className: 'actions' },
            h('button', { type: 'button', onClick: () => onSelect(item.id) }, '查看'),
            h('button', { type: 'button', onClick: () => onReparse(item.id) }, '重新解析'),
            h('button', { type: 'button', className: 'danger', onClick: () => onDelete(item.id) }, '删除')
          )
        ))
      )
    )
  }

  function renderCandidates(items, onSelect, onApprove, onReject) {
    if (!items.length) return h('section', { className: 'empty' }, '暂无候选人。请选择批次或上传 ZIP。')
    return h('section', { className: 'panel' },
      h('div', { className: 'table candidates' },
        h('div', { className: 'row head' }, h('span', null, '姓名'), h('span', null, '手机'), h('span', null, '邮箱'), h('span', null, '学历'), h('span', null, '状态'), h('span', null, '操作')),
        items.map((item) => h('div', { className: 'row', key: item.id },
          h('span', null, item.displayName || item.candidateKey),
          h('span', null, item.phone || '-'),
          h('span', null, item.email || '-'),
          h('span', null, item.highestDegree || '-'),
          h('span', null, item.status),
          h('span', { className: 'actions' },
            h('button', { type: 'button', onClick: () => onSelect(item.id) }, '详情'),
            h('button', { type: 'button', onClick: () => onApprove(item.id) }, '确认'),
            h('button', { type: 'button', onClick: () => onReject(item.id) }, '驳回')
          )
        ))
      )
    )
  }

  function renderDetail(detail, openDocument, onApprove, onReject, sendReparse, startBackgroundReparse) {
    if (!detail) return h('section', { className: 'empty' }, '请选择候选人查看详情。')
    const candidate = detail.candidate || {}
    const profile = candidate.profile || {}
    return h('section', { className: 'detail-grid' },
      h('div', { className: 'panel' },
        h('h2', null, candidate.displayName || candidate.candidateKey || '候选人'),
        h('dl', null,
          field('手机号', profile.phone),
          field('邮箱', profile.email),
          field('目标岗位', profile.targetPosition),
          field('最高学历', profile.highestDegree),
          field('学校', profile.school),
          field('专业', profile.major),
          field('工作年限', profile.yearsOfExperience == null ? '' : String(profile.yearsOfExperience)),
          field('技能', Array.isArray(profile.skills) ? profile.skills.join('、') : '')
        ),
        h('div', { className: 'actions wide' },
          h('button', { type: 'button', onClick: () => onApprove(candidate.id) }, '确认'),
          h('button', { type: 'button', onClick: () => onReject(candidate.id) }, '驳回'),
          h('button', { type: 'button', onClick: () => sendReparse(candidate.id) }, '发送重识别'),
          h('button', { type: 'button', onClick: () => startBackgroundReparse(candidate.id) }, '后台重识别')
        )
      ),
      h('div', { className: 'panel' },
        h('h2', null, '来源文件'),
        list(detail.documents || [], (document) =>
          h('button', { type: 'button', onClick: () => openDocument(document.id) }, document.fileName + ' · ' + document.documentRole)
        )
      ),
      h('div', { className: 'panel' },
        h('h2', null, '字段证据'),
        list(detail.evidence || [], (item) =>
          h('div', { className: 'evidence' },
            h('strong', null, item.field + '：' + (item.value || '-')),
            h('p', null, item.evidenceText),
            h('small', null, [item.documentName, item.page ? 'p.' + item.page : '', item.confidence == null ? '' : '置信度 ' + item.confidence].filter(Boolean).join(' · '))
          )
        )
      ),
      h('div', { className: 'panel' },
        h('h2', null, '重识别任务'),
        list(detail.reparseJobs || [], (job) =>
          h('div', { className: 'job' }, h('strong', null, job.status), h('small', null, job.createdAt || ''), job.errorMessage ? h('p', null, job.errorMessage) : null)
        )
      )
    )
  }

  function field(label, value) {
    return [h('dt', { key: label + '-label' }, label), h('dd', { key: label + '-value' }, value || '-')]
  }

  function list(items, render) {
    if (!items.length) return h('p', { className: 'muted' }, '暂无数据')
    return h('div', { className: 'stack' }, items.map((item) => h('div', { className: 'list-item', key: item.id }, render(item))))
  }

  const root = ReactDOM.createRoot(document.getElementById('root'))
  root.render(h(App))
  post('ready', {})

  const style = document.createElement('style')
  style.textContent = [
    'html,body,#root{height:100%;overflow:hidden;}',
    'body{margin:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#172033;}',
    '.resume-shell{height:100vh;box-sizing:border-box;padding:20px;display:flex;flex-direction:column;gap:14px;overflow:hidden;}',
    '.resume-header{display:flex;align-items:center;justify-content:space-between;gap:16px;}',
    'h1{font-size:22px;line-height:1.2;margin:0 0 6px;} h2{font-size:15px;margin:0 0 12px;} p{margin:0;color:#667085;}',
    '.upload-button{position:relative;display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:6px;background:#155eef;color:#fff;font-weight:600;cursor:pointer;}',
    '.upload-button input{position:absolute;inset:0;opacity:0;cursor:pointer;}',
    '.tabs{display:flex;gap:8px;border-bottom:1px solid #d0d5dd;padding-bottom:8px;}',
    '.tab{height:34px;border:1px solid #d0d5dd;border-radius:6px;background:#fff;padding:0 12px;cursor:pointer;} .tab.active{border-color:#155eef;color:#155eef;font-weight:700;} .tab:disabled{opacity:.45;cursor:not-allowed;}',
    '.notice{border:1px solid #84caff;background:#eff8ff;color:#175cd3;border-radius:6px;padding:10px 12px;} .loading,.empty{border:1px dashed #d0d5dd;border-radius:6px;padding:20px;color:#667085;background:#fff;}',
    '.panel{background:#fff;border:1px solid #e4e7ec;border-radius:6px;padding:14px;min-width:0;}',
    '.resume-shell>.panel,.resume-shell>.detail-grid,.resume-shell>.empty{flex:1;min-height:0;overflow:auto;}',
    '.table{display:grid;gap:0;} .row{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1.4fr;gap:10px;align-items:center;border-bottom:1px solid #eef2f6;padding:10px 0;} .row.head{font-size:12px;color:#667085;font-weight:700;} .candidates .row{grid-template-columns:1.2fr 1fr 1.4fr 1fr .8fr 2fr;}',
    '.actions{display:flex;gap:6px;flex-wrap:wrap;} button{height:30px;border:1px solid #d0d5dd;background:#fff;border-radius:6px;padding:0 10px;cursor:pointer;} button:hover{border-color:#155eef;color:#155eef;} button.danger:hover{border-color:#d92d20;color:#b42318;}',
    '.detail-grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(260px,1fr);gap:14px;} dl{display:grid;grid-template-columns:90px 1fr;gap:8px 12px;margin:0 0 14px;} dt{color:#667085;} dd{margin:0;}',
    '.wide{margin-top:12px;} .stack{display:grid;gap:8px;} .list-item{border:1px solid #eef2f6;border-radius:6px;padding:10px;background:#fcfcfd;} .list-item button{height:auto;min-height:30px;text-align:left;}',
    '.evidence p{margin:6px 0;color:#344054;} small,.muted{color:#667085;} .job{display:grid;gap:4px;}',
    '@media(max-width:760px){.resume-header{align-items:flex-start;flex-direction:column}.detail-grid{grid-template-columns:1fr}.row,.candidates .row{grid-template-columns:1fr}.row.head{display:none}}'
  ].join('\\n')
  document.head.appendChild(style)
})()

