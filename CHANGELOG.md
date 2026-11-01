# Changelog

## 1.1.0 — 2026-11-01

相对 1.0.0 的改进。

### 修复

- **命名跟随会话自己的模型**：优先读会话日志 `request/header` 里记录的模型（老会话退到 `assistant/message`，再退到 profile 默认）。此前一律使用 profile 默认，一旦切换过默认模型，用官方模型的会话也会被发到别的 provider。
- **超时 4 秒 → 20 秒**（客户端 21 秒）：第三方模型常在 4 秒左右才返回，旧上限导致同一操作时成时败。
- **失败原因不再被吞掉**：区分「模型响应太慢」「模型服务异常：<上游原文>」「确实没给出可用名字」三种情况。

### 兼容

- 对不接受 `reasoningEffort: 'off'` 的模型自动降级，并按 provider/model 分别记录，不影响其他模型；降级时把输出预算提到 2000 token，避免推理占满预算后没有文本返回。

### 新增

- **模型可在插件配置页选择**（与提示词同一个页面）：会话命名支持「跟随会话 / 默认 / 具体模型」，工作区命名支持「默认 / 具体模型」，列表来自宿主已配置的 provider。配置存于 `<profile>/dsh-smart-namer.models.json`，保存即生效。

## 1.0.0 — 2026-10-31

首个稳定版本，2026-11-01 发布到 npm。

安装方式（任选其一）：

```sh
dsh plugin --profile desktop add dsh-smart-namer                                    # npm
dsh plugin --profile desktop add github:Blueteemo/dsh-smart-namer                   # 源码
dsh plugin --profile desktop add https://github.com/Blueteemo/dsh-smart-namer/releases/latest/download/dsh-smart-namer.tgz   # 预构建包
```

### 功能

- **会话命名**：侧栏会话行「...」→「智能重命名」，弹窗给出候选名，点一个即改名
- **工作区命名**：侧栏「更多」→「智能重命名工作区」，可先选工作区再生成
- **`/rename` 命令**：无参数走模型；带参数时作为偏好提示（不是直接改标题）
- **`rename_target` 工具**：让 Agent 按 id 直接改名，不经过模型
- **提示词可编辑**：插件页 Configure 里可改两份模板，保存即生效，无需重启

### 命名素材

- 会话：现有标题、所属项目、可用代号、按阶段均匀采样的 5 条用户发言
- 工作区：解码后的文件夹名、代号、最近会话标题、最近一条发言
- 不读工具输出、文件内容和完整日志

### 解析

- 丢弃含句读的、以状态语开头的、超过 12 个汉字或 24 个字符的候选
- 英文/数字与中文之间统一补一个空格

### 兼容

- DSH 0.2.1-rc.5（macOS 桌面端实测）；只用公开接口，不修改宿主安装目录
