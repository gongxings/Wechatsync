import type { Article, AuthResult, SyncResult, PlatformMeta, PlatformCapability } from '../types'
import type { RuntimeInterface } from '../runtime/interface'
import type { HtmlProcessOptions } from '../lib/html-processor'
import type { TurndownOptions } from '../lib/turndown'

/**
 * 输出格式类型
 */
export type OutputFormat = 'html' | 'markdown'

/**
 * 图片上传进度回调
 */
export type ImageProgressCallback = (current: number, total: number) => void

/**
 * 发布选项
 */
export interface PublishOptions {
  /** 只保存草稿，不发布 */
  draftOnly?: boolean
  /** 图片上传进度回调 */
  onImageProgress?: ImageProgressCallback
}

/**
 * 平台适配器接口
 */
export interface PlatformAdapter {
  /** 平台元信息 */
  readonly meta: PlatformMeta

  /** 初始化适配器 */
  init(runtime: RuntimeInterface): Promise<void>

  /** 检查认证状态 */
  checkAuth(): Promise<AuthResult>

  /** 发布文章 */
  publish(article: Article, options?: PublishOptions): Promise<SyncResult>

  /** 上传图片 (如果支持) */
  uploadImage?(file: Blob, filename?: string): Promise<string>

  /** 获取分类列表 (如果支持) */
  getCategories?(): Promise<Category[]>

  /** 获取草稿列表 (如果支持) */
  getDrafts?(): Promise<Draft[]>

  /** 更新文章 (如果支持) */
  update?(postId: string, article: Article): Promise<SyncResult>

  /** 删除文章 (如果支持) */
  delete?(postId: string): Promise<void>
}

/**
 * 分类
 */
export interface Category {
  id: string
  name: string
  parentId?: string
}

/**
 * 草稿
 */
export interface Draft {
  id: string
  title: string
  updatedAt: number
}

/**
 * DSL 适配器定义
 */
export interface AdapterDSL {
  name: string
  display_name: string
  icon: string
  homepage: string
  capabilities: PlatformCapability[]

  /** 草稿编辑链接模板 */
  draft_url_template?: string

  auth: {
    check: EndpointDef
  }

  endpoints: {
    create_draft?: EndpointDef
    update_draft?: EndpointDef
    publish?: EndpointDef
    upload_image?: EndpointDef
    get_categories?: EndpointDef
    [key: string]: EndpointDef | undefined
  }

  /** Header 规则 */
  header_rules?: HeaderRuleDef[]

  /** HTML 内容预处理选项 */
  html_processing?: HtmlProcessOptions

  /** 输出格式：html 或 markdown */
  output_format?: OutputFormat

  /** Markdown 转换选项（当 output_format 为 markdown 时使用） */
  markdown_options?: TurndownOptions

  /** 自定义 JS 逻辑文件路径 */
  custom_logic?: {
    content_transform?: string
    [key: string]: string | undefined
  }
}

/**
 * 端点定义
 */
export interface EndpointDef {
  request: {
    url: string
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    headers?: Record<string, string>
    content_type?: 'json' | 'form' | 'multipart'
    body?: Record<string, unknown>
  }
  response: {
    success?: string  // JSONPath 表达式判断成功
    extract?: Record<string, string>  // 提取字段的 JSONPath
    error?: string  // 错误信息的 JSONPath
  }
}

/**
 * Header 规则定义
 */
export interface HeaderRuleDef {
  url_filter: string
  headers: Record<string, string>
  resource_types?: string[]
}

/**
 * 适配器注册项
 */
export interface AdapterRegistryEntry {
  meta: PlatformMeta
  factory: (runtime: RuntimeInterface) => PlatformAdapter
}
