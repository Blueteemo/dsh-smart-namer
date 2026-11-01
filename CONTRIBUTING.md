# 参与开发

## 环境

Node.js ≥ 22。插件本身不依赖任何第三方运行时包，宿主提供全部服务。

## 检查

```sh
node --check index.js && node --check client.js   # 语法
node --test test/*.test.mjs                       # 单元测试
```

`index.js` 导出 `apply`、`fill`、`parseNames`、`tidyName`，测试直接调用它们。

## 客户端改动必须重启

`client.js` 是浏览器 bundle。宿主按 `?rev=` 做 immutable 缓存，并在内存里 memoize 已加载的 bundle，所以**改完必须完全退出 App（Cmd+Q）再打开**——刷新页面（含硬刷新）不会重新加载客户端代码。

宿主端（`index.js`）同样在启动时加载，改动也需要重启。

## 目录结构

```
dsh-smart-namer/
├── index.js            # Host：/rename 命令、HTTP /suggest、rename_target 工具、模型调用
├── client.js           # Client：两个菜单项、工作区下拉弹窗、toast、配置页表单
├── cordis.patch.yml    # 插件行
├── package.json        # npm 包 + dsh.bundle + dsh.client
├── locale/{zh,en}.json # 插件管理器里的标题与描述
├── test/               # 单元测试（node --test）
├── icon.svg            # 插件图标；assets/ 下是 180px 位图
└── docs/               # 截图 + 验证记录
```

## 发版

见仓库外维护者自己的发布清单；对外只保证：`package.json` 版本、`CHANGELOG.md`、git tag、GitHub Release 资产、npm 包五者一致。

## 反馈

- 功能问题：开 issue，附 DSH 版本、profile 名、复现步骤
- 安全/隐私：见 README 的「命名用到的素材」——插件只读会话标题与用户发言，不碰工具输出和文件内容
