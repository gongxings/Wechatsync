# WechatSync MCP Server

MCP Server for WechatSync - 连接 Claude Code 和 Chrome Extension。

## 架构

```
┌─────────────┐      stdio       ┌─────────────────┐     WebSocket     ┌─────────────┐
│ Claude Code │ <──────────────> │ MCP Server      │ <───────────────> │  Extension  │
│             │                  │ (Node.js)       │                   │ (Background)│
└─────────────┘                  └─────────────────┘                   └─────────────┘
```

## 安装

```bash
# 在项目根目录
yarn install
yarn build:mcp
```

## 配置 Claude Code

在 `~/.claude/claude_code_config.json` 中添加：

```json
{
  "mcpServers": {
    "wechatsync": {
      "command": "node",
      "args": ["/path/to/sync-assistant/packages/mcp-server/dist/index.js"]
    }
  }
}
```

或者在项目的 `.claude/settings.json` 中配置。

## 可用 Tools

### list_platforms

列出所有支持的平台及其登录状态。

```
参数:
- forceRefresh: boolean (可选) - 是否强制刷新登录状态
```

### check_auth

检查指定平台的登录状态。

```
参数:
- platform: string (必需) - 平台 ID，如 zhihu, juejin, toutiao
```

### sync_article

同步文章到指定平台（保存为草稿）。

```
参数:
- platforms: string[] (必需) - 目标平台 ID 列表
- title: string (必需) - 文章标题
- content: string (必需) - 文章内容（HTML 格式）
- markdown: string (可选) - 文章内容（Markdown 格式）
- cover: string (可选) - 封面图 URL
```

### extract_article

从当前浏览器页面提取文章内容。

## 环境变量

- `WECHATSYNC_WS_PORT`: WebSocket 端口（默认 9527）

## 开发

```bash
# 监听模式
yarn workspace @wechatsync/mcp-server dev

# 构建
yarn build:mcp

# 运行
yarn mcp
```
