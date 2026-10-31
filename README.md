<p align="center"><img src="./icon.svg" width="88" height="88" alt=""></p>

# 智能命名（dsh-smart-namer）

给 DSH 侧栏加一个「智能命名」：模型读取会话或工作区自身的内容，给出几个候选短名，**选中其一即可改名**。会话和工作区各有一个入口，另附一个给 Agent 用的 `rename_target` 工具。

只使用 DSH 公开接口，不修改宿主安装目录。

[中文](README.md) · [English](README.en.md)

## 安装

从 GitHub：

```bash
dsh plugin --profile desktop add github:Blueteemo/dsh-smart-namer
```

从本地源码（开发用）：

```bash
dsh plugin --profile desktop add file:/absolute/path/to/dsh-smart-namer
```

安装后如果侧栏没有出现入口，**完全退出 App（Cmd+Q）再打开**。客户端 bundle 有 immutable 缓存和宿主内存 memoize，刷新页面（包括硬刷新）不会重新加载客户端代码。

## 用法

### 会话

1. 在侧栏会话行点「...」。
2. 点「智能重命名」。
3. 弹窗先显示「正在想…」，随后最多给出 3 个名字。
4. 选中一个名字：立即改名、关闭弹窗，并提示「已改为 X」。
5. 按 Esc 或点遮罩：直接关闭，什么都不改。

### 工作区

1. 点侧栏面板列表的「更多」。
2. 点「智能重命名工作区」。
3. 弹窗顶部有一个工作区下拉：默认当前会话所在的工作区，其余按最近活动排序；切换下拉会重新拉候选。
4. 后续步骤与会话相同。

### `/rename` 命令

在输入框里输入 `/rename`，从命令菜单选 `rename`（会显示成命令 chip）：

- `/rename`（无参数）：调用模型，取第一个候选改名，回复「已改为「X」。备选：A、B」；失败或无候选回复「没想出更好的，未改名」，不改名。
- `/rename 突出工具链`：后面的文字作为**偏好提示**传给模型，仍然由模型生成、仍然给 3 个候选。

命令执行沿用 4 秒超时，不启动 Agent 轮次。

## 开发

```sh
node --check index.js && node --check client.js   # 语法
node --test test/*.test.mjs                       # 单元测试（Node.js ≥ 22）
```

`index.js` 导出 `apply`、`fill`、`parseNames`、`tidyName` 供测试直接调用。

`client.js` 是浏览器 bundle：宿主按 `?rev=` 做 immutable 缓存并在内存里 memoize，**改完必须完全退出 App（Cmd+Q）再打开**，刷新页面不会重新加载。

### 手工验收

1. 说一句话再点「智能重命名」，4 秒内出候选，选中即改名
2. 空会话点「智能重命名」：应提示「这个会话还没有内容」，**不是**红色错误
3. 会话、工作区各改一次，重启 App 后名字仍在
4. 断网或模型报错：只提示，不改名
5. 深色、浅色各看一次

## 自定义提示词

插件页（设置 → 插件 → dsh-smart-namer）的 **Configure** 里有「会话命名提示词」和「工作区命名提示词」两个编辑框：

- 留空 = 使用内置模板；编辑框里灰色占位符就是内置模板本身
- 保存后**立即生效**，不需要重启
- 保存在当前 profile 目录的 `dsh-smart-namer.prompts.json`

可用占位符：

| 对象 | 占位符 |
|---|---|
| 会话 | `{project}` `{codes}` `{title}` `{user_samples}` `{last_assistant_text}` |
| 工作区 | `{folder}` `{codes}` `{workspace_path}` `{titles}` `{first_user_message}` |

调试命名效果时，可以只改提示词、不动代码，用同一个会话反复试。

## Agent 工具

`rename_target` 直接改名，不调用模型：

```json
{ "kind": "session", "id": "session-...", "title": "新名字" }
```

`kind` 为 `session` 或 `workspace`。会话改名走 `sessionController.rename`（必要时先恢复会话），工作区改名走 `workspaceController.rename`（校验非空和重名）。UI 与会话改名的服务层相同，只是分别从 Client / Host 进入。

## 上下文与模型

- **会话**：现有标题、第一条用户消息、最后一条助手回复。消息从 `sessionQuery.readSurface()` 的当前投影里取纯文本，去掉 Markdown 标记和代码块，各截 200 字。
- **工作区**：路径、最近 5 个会话的标题、最近一个会话的第一条用户消息（≤200 字）。`sessionQuery.listSessions()` 保证按 `header.createdAt` 最新在前，过滤后直接取前 5。标题从 `sessionQuery.readTitleSnapshots()` 读取。
- **模型**：`agentDefaultModel.currentSelection()` 的 profile 默认模型；一次调用，`temperature: 0.3`，`maxTokens: 120`，`reasoningEffort: 'off'`（命名是短文案任务；profile 默认 High 推理会吃满 120 token，只出推理不出名字），不重试、不向用户流式输出。调用走宿主 `ctx.llm.stream()`。
- **提示词填充**：`fill()` 用函数式 replacer 一次替换所有 `{...}`；素材里的 `$&`、`$1`、`$'` 保持字面量，不会被 `String.replace` 当替换模式解释。
- **解析**：按行切 → trim → 丢空行 → 丢掉与当前标题相同的 → 丢掉超过 12 个汉字的（不截断）→ 去重 → 最多 3 个；0 个视为失败。
- **超时**：4 秒。超时、模型报错或 0 个候选都只显示「没想出更好的」，不改名。

代码里没有密钥。模型凭据由宿主已有的 LLM 通道解析。

## 不做什么

第一版不做自动触发、批量、缓存、重试、多档上下文、本地启发式清洗、「再想想」和历史记录。

## 验证

在 DSH 0.2.1-rc.5 / profile `desktop` 上实测：弹窗约 1 秒出候选；`/rename` 改名后侧栏同步；8 个单元测试通过。完整记录（含来源校验、持久化位置、失败路径）见 [docs/verification.md](docs/verification.md)。

## 截图

会话菜单入口：

![会话菜单](docs/menu.png)

浅色：

![浅色模式](docs/light.png)

深色：

![深色模式](docs/dark.png)

工作区（顶部下拉可切换）：

![工作区](docs/workspace.png)

`/rename` 命令：

![rename 命令](docs/rename-command.png)

改名后的 toast：

![toast](docs/toast.png)

## 结构

```
dsh-smart-namer/
├── index.js            # Host：/rename 命令、HTTP /suggest、rename_target 工具、上下文与模型调用
├── client.js           # Client：两个菜单项、工作区下拉弹窗、toast
├── cordis.patch.yml    # 插件行
├── package.json        # npm 包 + dsh.bundle + dsh.client
├── locale/{zh,en}.json # 插件管理器的标题/描述
├── test/               # 单元测试（node --test）
├── icon.svg            # 插件图标（assets/ 里是 180px 位图）
└── docs/               # 截图 + 验证记录
```

## License

MIT
