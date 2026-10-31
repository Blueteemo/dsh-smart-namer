// dsh-smart-namer: HOST half.
//
// One job: given a session id or workspace id, read a small amount of the
// session's own material through the public session-query service, ask the
// profile's default model for three short Chinese names, parse those lines,
// and return them to the Client half over one same-origin HTTP route.
//
// The agent tool `rename_target` is intentionally independent of the model:
// it renames directly through the public host controllers.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const NAME = 'dsh-smart-namer'
const ROUTE = '/__dsh-smart-name/suggest'
const PROMPT_ROUTE = '/__dsh-smart-name/prompts'
const PROMPT_FILE = 'dsh-smart-namer.prompts.json'
const MAX_PROMPT_CHARS = 8000
const TIMEOUT_MS = 4000
const MATERIAL_CHARS = 200
const MAX_NAMES = 3
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const SESSION_PROMPT = `你是命名助手。为下面这次会话起 4 个中文名字（界面只显示其中 3 个），显示在侧栏供用户识别。

规则：
1. 每个名字 2-12 个汉字；不要引号、书名号、标点、表情、序号
2. 名字要说明"这次会话实际在做什么、做成了什么"；不要照抄整句
3. 有"可用代号"时，名字必须包含其中至少一个（通常是项目名或平台代号），原样照抄大小写；版本号、日期、架构名、机型后缀这类噪音可以省略；不要把代号翻译或抽象成"掌机""某项目"这类泛称
4. 会话名要和所属项目区分开：不要直接沿用项目名，也不要和项目名只差一两个字；要写出这次会话具体做了什么
5. 四个候选：三个各有侧重（一个像"任务"，一个像"对象/领域"，一个像"结果"），再补一个更宽泛的备选
6. 素材不足以判断时，宁可起得宽泛但准确，不要臆造项目名
7. 名字要概括整个会话的主要工作，不要只描述最近几轮；最近几轮只是收尾（确认、重启、验收）时，要概括前面做的事
8. 必须是名词短语：不要写句子、状态或评价，不要出现"已""通过""完成""进行中"这类词
9. 英文/数字与中文之间用一个空格分隔；整个名字不超过 20 个字符
10. 先在心里按时间顺序列出这条会话的几个主要主题，再起名：名字必须覆盖篇幅最大的主题，不能只描述最近几轮；如果会话从 A 转到 B，优先用能同时涵盖两者的说法
11. 不要包含用户名、账号名、邮箱地址或任何个人标识
12. 输出四行候选，每行一个名字，不要解释（可能有个别被过滤，多给一个更稳）

素材：
所属项目：{project}
可用代号：{codes}
现有标题：{title}
用户在不同阶段的发言：
{user_samples}`

const WORKSPACE_PROMPT = `你是命名助手。为下面这个工作区起 4 个中文名字（界面只显示其中 3 个），显示在侧栏供用户识别。

规则：
1. 每个名字 2-12 个汉字；不要引号、书名号、标点、表情、序号
2. 每个名字必须包含"可用代号"里的至少一个英文或数字片段（通常是项目名 + 型号/平台代号），并原样照抄大小写；不要把它们翻译或抽象成"掌机""移植项目"这类泛称
3. 版本号、架构名、机型后缀这类构建噪音（形如 v023、SOFTFP、MacBook）可以省略，只保留最有辨识度的代号
4. 不要逐字翻译或照抄整个文件夹名，要结合它和会话内容一起判断
5. 四个候选：三个各有侧重（一个像"项目"，一个像"任务"，一个像"技术领域"），再补一个更宽泛的备选
6. 素材不足以判断时，宁可起得宽泛但准确，不要臆造
7. 输出四行候选，每行一个名字，不要解释（可能有个别被过滤，多给一个更稳）

素材：
原文件夹名：{folder}
可用代号：{codes}
完整路径：{workspace_path}
最近会话标题：
{titles}
最近的会话开头：{first_user_message}`

const TOOL_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

/** Join the text blocks of one message payload. */
function blockText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/**
 * Text of one human turn. `user/message` carries its payload at
 * `data.content` (assistant messages use `data.message.content`), and the same
 * event type also carries tool, tmux and instruction sources that are not
 * something the person typed — only `source.kind === 'user'` counts.
 */
function userText(event) {
  if (event?.type !== 'user/message') return ''
  if (event?.data?.source?.kind !== 'user') return ''
  return cleanText(blockText(event.data.content))
}

/** Text of one assistant turn. */
function assistantText(event) {
  if (event?.type !== 'assistant/message') return ''
  return cleanText(blockText(event?.data?.message?.content))
}

/** Remove Markdown structure and code blocks, then collapse whitespace. */
function cleanText(input) {
  let text = String(input ?? '')
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/~~~[\s\S]*?~~~/g, ' ')
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  text = text.replace(/^\s{0,3}>\s?/gm, '')
  text = text.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, '')
  text = text.replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, ' ')
  text = text.replace(/[`*_~]/g, '')
  text = text.replace(/\|/g, ' ')
  return text.replace(/\s+/g, ' ').trim()
}

/** One space between Latin and Han, and no runs of whitespace. */
function tidyName(text) {
  return String(text)
    .replace(/^\s*(?:[-*•]|\d+[.、)）])\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/([A-Za-z0-9])([\u3400-\u4DBF\u4E00-\u9FFF])/g, '$1 $2')
    .replace(/([\u3400-\u4DBF\u4E00-\u9FFF])([A-Za-z0-9])/g, '$1 $2')
    .trim()
}

/** Count Han characters, the unit the naming rules are written in. */
function hanCount(text) {
  return (String(text).match(/[\u3400-\u4DBF\u4E00-\u9FFF]/g) ?? []).length
}

/** Bound a string by code points so a 200-character cut never splits a surrogate pair. */
function clip(text, max = MATERIAL_CHARS) {
  const chars = Array.from(String(text ?? ''))
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('')
}

/**
 * Fill `{name}` placeholders with literal values. A function replacer keeps
 * `$&`, `$1`, `$'` and their relatives in the material literal; a string
 * replacement would interpret them as replacement patterns.
 */
function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '')
}

/**
 * Parse the model's answer with the small, fixed pipeline from the product
 * brief: lines, trim, drop blanks, drop the current title, drop names over
 * twelve Han characters, keep at most three.
 */
function parseNames(raw, currentTitle) {
  const names = []
  const title = String(currentTitle ?? '').trim()
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const candidate = tidyName(line)
    if (candidate === '') continue
    if (Array.from(candidate).length > 24) continue
    if (candidate === title) continue
    if (hanCount(candidate) > 12) continue
    // A name, not a status line: no sentence punctuation, no "done/passed" framing.
    if (/[，。！？；,.!?;]/.test(candidate)) continue
    if (/^(?:已|完成|正在|通过)/.test(candidate)) continue
    if (/(?:已通过|已完成|正在|进行中|通过校验)/.test(candidate)) continue
    if (names.includes(candidate)) continue
    names.push(candidate)
    if (names.length === MAX_NAMES) break
  }
  return names
}

/** Read the request body as JSON with a small bound. */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
    req.on('aborted', () => reject(new Error('aborted')))
  })
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * A Host header is a bare authority (`127.0.0.1:49406`). Missing Host is
 * allowed for non-browser clients; a present one must be loopback on the
 * exact listening port.
 */
function hostAllowed(value, expectedPort) {
  if (typeof value !== 'string' || value.trim() === '') return true
  let url
  try {
    url = new URL(`http://${value.trim()}`)
  } catch {
    return false
  }
  const port = url.port || '80'
  return LOCAL_HOSTNAMES.has(url.hostname.toLowerCase()) && port === expectedPort
}

/**
 * An Origin is an absolute URL. Missing Origin is allowed for curl and other
 * non-browser callers; a present http(s) Origin must be loopback on the same
 * port. A custom-scheme Origin (the desktop shell) is not an http authority
 * and is left to the Host check, matching dsh-email's posture.
 */
function originAllowed(value, expectedPort) {
  if (typeof value !== 'string' || value.trim() === '') return true
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  return LOCAL_HOSTNAMES.has(url.hostname.toLowerCase()) && port === expectedPort
}

function requestAllowed(req, expectedPort) {
  return hostAllowed(req.headers.host, expectedPort)
    && originAllowed(req.headers.origin, expectedPort)
}

/** URL-decode a path segment so a folder like `..._%E6%97%A0...` stays readable. */
function readablePath(text) {
  const value = String(text ?? '')
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Last segment of a path, decoded. */
function folderName(path) {
  const parts = String(path ?? '').split('/').filter(Boolean)
  return readablePath(parts[parts.length - 1] ?? '')
}

/** Latin/digit fragments of a folder name: project names, platform and model codes. */
function codeTokens(folder) {
  return [...new Set(
    String(folder ?? '')
      .split(/[^A-Za-z0-9]+/)
      .filter((token) => token.length >= 3),
  )]
}

/** Evenly spaced user turns across the whole session, so the arc survives long chats. */
function sampleUserTurns(list, limit = 5) {
  const texts = []
  for (const event of list) {
    const text = userText(event)
    if (text !== '' && text !== (texts[texts.length - 1] ?? '')) texts.push(text)
  }
  if (texts.length <= limit) return texts
  const picked = []
  for (let index = 0; index < limit; index += 1) {
    picked.push(texts[Math.round((index * (texts.length - 1)) / (limit - 1))])
  }
  return [...new Set(picked)]
}

/** Resolve sampled user turns plus the last assistant text from one session surface. */
function pickSurfaceTexts(events) {
  const list = Array.isArray(events) ? events : []
  let first = ''
  for (const event of list) {
    const text = userText(event)
    if (text !== '') {
      first = text
      break
    }
  }
  let lastUser = ''
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const text = userText(list[index])
    if (text !== first && text !== '') {
      lastUser = text
      break
    }
  }
  let last = ''
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const text = assistantText(list[index])
    if (text !== '') {
      last = text
      break
    }
  }
  return {
    first: clip(first),
    lastUser: clip(lastUser),
    last: clip(last),
    samples: sampleUserTurns(list).map((text) => clip(text, 120)),
  }
}

async function readSessionMaterial(ctx, sessionId, signal) {
  const query = ctx.get('sessionQuery')
  if (!query) throw new Error('session-query-unavailable')
  signal.throwIfAborted()
  const [titleObservation, surface] = await Promise.all([
    query.readTitle(sessionId, signal),
    query.readSurface(sessionId),
  ])
  signal.throwIfAborted()
  const title = String(titleObservation?.title?.title ?? '').trim()
  const { first, lastUser, last, samples } = pickSurfaceTexts(surface?.events)
  // A fresh session usually carries a placeholder title but no messages at all.
  // A title alone is not material: naming from it would invent a topic.
  if (first === '' && last === '') throw new Error('no-material')
  let project = ''
  let codes = []
  try {
    const owner = ctx.get('workspaceRegistry')?.list?.()
      ?.find((workspace) => (workspace.sessionIds ?? []).some((id) => String(id) === sessionId))
    const folder = folderName(owner?.path)
    const label = String(owner?.title ?? '').trim()
    // `default-workspace` is DSH's catch-all bucket: its title and folder carry
    // no project information, so neither may leak into a session name.
    if (folder !== 'default-workspace') {
      project = label !== folder ? label : ''
      codes = codeTokens(folder)
    }
  } catch {
    project = ''
  }
  return { title, first, lastUser, last, samples, project, codes }
}

async function readWorkspaceMaterial(ctx, workspaceId, signal) {
  const registry = ctx.get('workspaceRegistry')
  const query = ctx.get('sessionQuery')
  if (!registry) throw new Error('workspace-registry-unavailable')
  if (!query) throw new Error('session-query-unavailable')
  const workspace = registry.get(workspaceId)
  if (!workspace) throw new Error('workspace-not-found')

  const records = await query.listSessions(signal)
  signal.throwIfAborted()
  const owned = new Set((workspace.sessionIds ?? []).map((id) => String(id)))
  // sessionQuery.listSessions() guarantees newest-first order by
  // header.createdAt (compareSessions in dsh-session-query), so filtering
  // preserves "recent"; no extra sort is needed.
  const recent = records
    .filter((record) => record?.header && owned.has(String(record.header.id)))
    .filter((record) => record.header.origin !== 'subagent')
    .slice(0, 5)

  let titles = []
  if (recent.length > 0) {
    const observations = await query.readTitleSnapshots(recent.map((record) => record.header.id), signal)
    signal.throwIfAborted()
    const byId = new Map()
    for (const observation of observations) {
      if (observation?.status === 'fulfilled') {
        byId.set(String(observation.sessionId), String(observation.value?.title?.title ?? '').trim())
      }
    }
    titles = recent.map((record) => byId.get(String(record.header.id)) || '（未命名）')
  }

  let first = ''
  if (recent.length > 0) {
    const surface = await query.readSurface(recent[0].header.id)
    signal.throwIfAborted()
    first = pickSurfaceTexts(surface?.events).first
  }

  const folder = folderName(workspace.path)
  return {
    path: readablePath(workspace.path),
    folder,
    codes: codeTokens(folder),
    title: String(workspace.title ?? '').trim(),
    titles,
    first,
  }
}

/** Profile directory the prompts file lives in. The host provides it; env is a fallback. */
function profileDir(ctx) {
  const dir = ctx.get('profileContext')?.dir
  if (typeof dir === 'string' && dir !== '') return dir
  return process.env.DSH_PROFILE_DIR || ''
}

/** Read the saved prompt overrides; an unreadable file means "use the defaults". */
function loadPromptOverrides(ctx) {
  const dir = profileDir(ctx)
  if (dir === '') return { session: '', workspace: '' }
  try {
    const parsed = JSON.parse(readFileSync(join(dir, PROMPT_FILE), 'utf8'))
    return {
      session: typeof parsed?.session === 'string' ? parsed.session : '',
      workspace: typeof parsed?.workspace === 'string' ? parsed.workspace : '',
    }
  } catch {
    return { session: '', workspace: '' }
  }
}

/** Persist prompt overrides. An empty string restores the built-in template. */
function savePromptOverrides(ctx, next) {
  const dir = profileDir(ctx)
  if (dir === '') throw new Error('profile-unavailable')
  writeFileSync(join(dir, PROMPT_FILE), JSON.stringify(next, null, 2), 'utf8')
}

/** Consume one non-streaming-for-the-user model call and return its text. */
async function completeOnce(ctx, prompt, signal) {
  const llm = ctx.get('llm')
  if (!llm) throw new Error('llm-unavailable')
  const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
  if (!selection?.provider || !selection?.model) throw new Error('model-unavailable')

  const chunks = new Map()
  let finish
  const stream = llm.stream({
    provider: selection.provider,
    model: selection.model,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    temperature: 0.3,
    maxTokens: 120,
    // Naming is a short copywriting task. The profile's default effort is high,
    // which spends the whole 120-token budget on reasoning before any name.
    // "off" keeps the same model and still leaves room for three short lines.
    reasoningEffort: 'off',
    signal,
  })
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      chunks.set(chunk.index, (chunks.get(chunk.index) ?? '') + chunk.text)
    } else if (chunk.type === 'block-end' && chunk.block?.type === 'text' && !chunks.has(chunk.index)) {
      chunks.set(chunk.index, chunk.block.text)
    } else if (chunk.type === 'finish') {
      finish = chunk.reason
    }
  }
  if (finish?.kind === 'error' || finish?.kind === 'aborted') {
    throw new Error(finish.failure?.message || 'model-error')
  }
  return [...chunks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, text]) => text)
    .join('')
}

async function suggestNames(ctx, kind, id, signal, hint = '') {
  const extra = hint === '' ? '' : `\n\n用户补充要求：${hint}`
  const overrides = loadPromptOverrides(ctx)
  if (kind === 'session') {
    const material = await readSessionMaterial(ctx, id, signal)
    const prompt = fill(overrides.session.trim() || SESSION_PROMPT, {
      project: material.project || '（无）',
      codes: material.codes.length > 0 ? material.codes.join(' / ') : '（无）',
      title: material.title || '（未命名）',
      user_samples: material.samples.length > 0
        ? material.samples.map((text) => `- ${text}`).join('\n')
        : `- ${material.first || '（无）'}`,
      last_assistant_text: material.last || '（无）',
    })
    const raw = await completeOnce(ctx, prompt + extra, signal)
    const names = parseNames(raw, material.title)
    if (names.length === 0) throw new Error('no-candidates')
    return names
  }

  if (kind === 'workspace') {
    const material = await readWorkspaceMaterial(ctx, id, signal)
    const prompt = fill(overrides.workspace.trim() || WORKSPACE_PROMPT, {
      folder: material.folder || '（未知）',
      codes: material.codes.length > 0 ? material.codes.join(' / ') : '（无）',
      workspace_path: material.path || '（未知）',
      titles: material.titles.length > 0 ? material.titles.map((title) => `- ${title}`).join('\n') : '（无）',
      first_user_message: material.first || '（无）',
    })
    const raw = await completeOnce(ctx, prompt + extra, signal)
    const names = parseNames(raw, material.title)
    if (names.length === 0) throw new Error('no-candidates')
    return names
  }

  throw new Error('invalid-kind')
}

/** Rename exactly one target through the same public controller the UI uses. */
async function renameTarget(ctx, args) {
  const kind = args?.kind
  const id = String(args?.id ?? '').trim()
  const title = String(args?.title ?? '').trim()
  if (kind !== 'session' && kind !== 'workspace') throw new Error('kind must be "session" or "workspace"')
  if (id === '') throw new Error('id is required')
  if (title === '') throw new Error('title must not be blank')

  if (kind === 'session') {
    const controller = ctx.get('sessionController')
    if (controller?.rename) {
      const value = await controller.rename({ sessionId: id, title })
      return `renamed session ${id} to "${value.title}"`
    }
    const titles = ctx.get('sessionTitle')
    const live = ctx.get('sessions')?.get?.(id)
    if (!titles || !live) throw new Error('session rename is unavailable')
    const value = titles.rename(live, title)
    return `renamed session ${id} to "${value.title}"`
  }

  const controller = ctx.get('workspaceController')
  if (controller?.rename) {
    const value = await controller.rename({ workspaceId: id, title })
    return `renamed workspace ${id} to "${value.workspace.title}"`
  }
  const registry = ctx.get('workspaceRegistry')
  const workspace = registry?.get?.(id)
  if (!workspace) throw new Error(`workspace not found: ${id}`)
  await workspace.setTitle(title)
  return `renamed workspace ${id} to "${title}"`
}

/**
 * Identity constructor from @deepseek-ai/dsh-commands/brand. Kept local so the
 * linked package never has to resolve a host package at import time.
 */
function commandDefinitionId(id) {
  return id
}

/** One `/rename` invocation: always the model path; any argument is a hint. */
async function executeRenameCommand(ctx, invocation) {
  const sessionId = invocation.agent.session.id
  // The argument is a hint for the model, never a literal title: a plain
  // "set this exact title" command would add nothing over the rename menu.
  const hint = invocation.rawInput.trim()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onAbort = () => controller.abort()
  invocation.signal.addEventListener('abort', onAbort, { once: true })
  try {
    let names
    try {
      names = await suggestNames(ctx, 'session', sessionId, controller.signal, hint)
    } catch (error) {
      if (invocation.signal.aborted) return { kind: 'error', text: '已取消，未改名' }
      // A brand-new session has nothing to read yet. That is not a failure of
      // the model, so it must not surface as a red error banner.
      if (error instanceof Error && error.message === 'no-material') {
        return { kind: 'success', text: '这个会话还没有内容，先聊几句再改名。' }
      }
      return { kind: 'error', text: '没想出更好的，未改名' }
    }
    if (controller.signal.aborted) return { kind: 'error', text: '没想出更好的，未改名' }
    if (names.length === 0) return { kind: 'error', text: '没想出更好的，未改名' }
    try {
      await renameTarget(ctx, { kind: 'session', id: sessionId, title: names[0] })
    } catch {
      return { kind: 'error', text: '改名失败，未改名' }
    }
    const alternatives = names.slice(1)
    return {
      kind: 'success',
      text: alternatives.length > 0
        ? `已改为「${names[0]}」。备选：${alternatives.join('、')}`
        : `已改为「${names[0]}」。`,
    }
  } finally {
    clearTimeout(timer)
    invocation.signal.removeEventListener('abort', onAbort)
  }
}

function registerRenameCommand(ctx, commands) {
  ctx.effect(() => commands.register({
    definitionId: commandDefinitionId('dsh-smart-namer/rename'),
    name: 'rename',
    description: '为当前会话生成更合适的标题；可在命令后附加偏好提示',
    input: { hint: '可选：偏好提示，例如「突出工具链」' },
    handler: (invocation) => executeRenameCommand(ctx, invocation),
  }))
}

function registerHttp(ctx, host) {
  const origin = new URL(host.getOrigin())
  const expectedPort = origin.port || (origin.protocol === 'https:' ? '443' : '80')
  ctx.effect(() => host.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      if (!requestAllowed(req, expectedPort)) {
        sendJson(res, 403, { ok: false, error: 'forbidden' })
        return
      }
      let body
      try {
        body = await readJson(req)
      } catch {
        sendJson(res, 400, { ok: false, error: 'bad-request' })
        return
      }
      const kind = body?.kind
      const id = String(body?.id ?? '').trim()
      if ((kind !== 'session' && kind !== 'workspace') || id === '') {
        sendJson(res, 400, { ok: false, error: 'bad-request' })
        return
      }

      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, TIMEOUT_MS)
      const onAborted = () => controller.abort()
      req.on('aborted', onAborted)
      try {
        const names = await suggestNames(ctx, kind, id, controller.signal)
        sendJson(res, 200, { ok: true, names })
      } catch (error) {
        const code = timedOut ? 'timeout' : (error?.message || 'error')
        console.warn(`[${NAME}] suggestion failed for ${kind} ${id}:`, error)
        sendJson(res, 200, { ok: false, error: code })
      } finally {
        clearTimeout(timer)
        req.off('aborted', onAborted)
      }
    },
  }))
}

function registerPromptRoute(ctx, host) {
  const origin = new URL(host.getOrigin())
  const expectedPort = origin.port || (origin.protocol === 'https:' ? '443' : '80')
  ctx.effect(() => host.register({
    kind: 'exact',
    path: PROMPT_ROUTE,
    handler: async (req, res) => {
      if (!requestAllowed(req, expectedPort)) {
        sendJson(res, 403, { ok: false, error: 'forbidden' })
        return
      }
      if (req.method === 'GET') {
        const current = loadPromptOverrides(ctx)
        sendJson(res, 200, {
          ok: true,
          session: current.session,
          workspace: current.workspace,
          defaults: { session: SESSION_PROMPT, workspace: WORKSPACE_PROMPT },
        })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      let body
      try {
        body = await readJson(req)
      } catch {
        sendJson(res, 400, { ok: false, error: 'bad-request' })
        return
      }
      const bounded = (value) => (typeof value === 'string' ? value.slice(0, MAX_PROMPT_CHARS) : '')
      try {
        savePromptOverrides(ctx, { session: bounded(body?.session), workspace: bounded(body?.workspace) })
        sendJson(res, 200, { ok: true })
      } catch (error) {
        sendJson(res, 200, { ok: false, error: error?.message || 'save-failed' })
      }
    },
  }))
}

function registerTool(ctx, tools) {
  ctx.effect(() => tools.register({
    name: 'rename_target',
    description: 'Rename one existing session or workspace to an exact title. This only sets the title; it does not generate or suggest one.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['session', 'workspace'],
          description: 'Which kind of target to rename.',
        },
        id: {
          type: 'string',
          description: 'Exact session id (for example "session-0123abcd-...") or workspace id.',
        },
        title: {
          type: 'string',
          description: 'New title to set.',
        },
      },
      required: ['kind', 'id', 'title'],
    },
    output: TOOL_OUTPUT,
    execute: (args) => renameTarget(ctx, args),
  }))
}

function apply(ctx) {
  ctx.inject(['webServer'], (child) => {
    registerHttp(child, child.webServer)
    registerPromptRoute(child, child.webServer)
  })
  ctx.inject(['tools'], (child) => registerTool(child, child.tools))
  ctx.inject(['commands'], (child) => registerRenameCommand(child, child.commands))
}

export { apply, fill, parseNames, tidyName }
export const name = NAME
export const inject = []
