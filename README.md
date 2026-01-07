# 文章同步助手 (Sync Assistant)

一键同步文章到知乎、头条、掘金等 20+ 平台，支持 WordPress 等自建站。

## 功能特性

- **多平台同步**: 支持知乎、掘金、头条、CSDN、简书、微博、B站专栏等 20+ 平台
- **自建站支持**: WordPress、Typecho、MetaWeblog API
- **智能提取**: 自动从网页提取文章标题、内容、封面图
- **图片上传**: 自动上传文章图片到目标平台
- **草稿模式**: 同步后保存为草稿，方便二次编辑
- **MCP 集成**: 支持 Claude Code 通过 MCP 协议调用

## 项目结构

```
sync-assistant/
├── packages/
│   ├── extension/     # Chrome 扩展 (MV3)
│   ├── mcp-server/    # MCP Server (HTTP/SSE)
│   └── core/          # 核心逻辑 (共享)
```

## 快速开始

### 安装扩展

```bash
cd packages/extension
pnpm install
pnpm run build
```

然后在 Chrome 中加载 `dist` 目录。

### 使用 MCP Server (可选)

```bash
cd packages/mcp-server
pnpm install
pnpm run build
pnpm start
```

MCP Server 启动后：
- HTTP 端点: `http://localhost:9528`
- Claude Code SSE: `http://localhost:9528/sse`
- Extension WebSocket: `ws://localhost:9527`

## 支持的平台

| 平台 | ID | 状态 |
|-----|-----|-----|
| 知乎 | zhihu | ✅ |
| 掘金 | juejin | ✅ |
| 头条号 | toutiao | ✅ |
| CSDN | csdn | ✅ |
| 简书 | jianshu | ✅ |
| 微博 | weibo | ✅ |
| B站专栏 | bilibili | ✅ |
| 百家号 | baijiahao | ✅ |
| 语雀 | yuque | ✅ |
| 豆瓣 | douban | ✅ |
| 搜狐号 | sohu | ✅ |
| 雪球 | xueqiu | ✅ |
| 人人都是产品经理 | woshipm | ✅ |
| WordPress | wordpress | ✅ |
| Typecho | typecho | ✅ |

## Claude Code 集成

1. 启动 MCP Server: `pnpm start`
2. 在扩展设置中启用 MCP 连接
3. Claude Code 中添加 MCP: `/mcp add http://localhost:9528/sse`

可用工具：
- `list_platforms` - 列出所有平台及登录状态
- `check_auth` - 检查指定平台登录状态
- `sync_article` - 同步文章到指定平台
- `extract_article` - 从当前页面提取文章

## 开发

```bash
# 开发模式
cd packages/extension
pnpm run dev

# 构建
pnpm run build
```

## License

GPL-3.0
