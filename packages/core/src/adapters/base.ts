import type { Article, AuthResult, SyncResult, PlatformMeta } from '../types'
import type { RuntimeInterface } from '../runtime/interface'
import type { PlatformAdapter, Category, AdapterDSL, EndpointDef } from './types'
import { processHtml } from '../lib/html-processor'
import { htmlToMarkdown, markdownToHtml } from '../lib/turndown'

/**
 * DSL 处理用的内部文章格式（包含 content 字段用于向后兼容）
 */
interface ArticleWithContent extends Article {
  content: string
}

/**
 * 适配器基类
 * 提供通用的请求处理和模板解析
 */
export abstract class BaseAdapter implements PlatformAdapter {
  abstract readonly meta: PlatformMeta
  protected runtime!: RuntimeInterface
  protected context: Record<string, unknown> = {}

  async init(runtime: RuntimeInterface): Promise<void> {
    this.runtime = runtime
  }

  abstract checkAuth(): Promise<AuthResult>
  abstract publish(article: Article): Promise<SyncResult>

  /**
   * 发送请求
   */
  protected async request<T = unknown>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await this.runtime.fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json()
    }

    return response.text() as T
  }

  /**
   * 带重试的请求
   */
  protected async requestWithRetry<T = unknown>(
    url: string,
    options: RequestInit = {},
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | null = null

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.request<T>(url, options)
      } catch (error) {
        lastError = error as Error
        if (i < maxRetries - 1) {
          await this.delay(1000 * (i + 1))
        }
      }
    }

    throw lastError
  }

  /**
   * 延迟
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 创建同步结果
   */
  protected createResult(
    success: boolean,
    data?: Partial<SyncResult>
  ): SyncResult {
    return {
      platform: this.meta.id,
      success,
      timestamp: Date.now(),
      ...data,
    }
  }
}

/**
 * DSL 适配器
 * 基于 YAML DSL 定义生成的适配器
 */
export class DSLAdapter extends BaseAdapter {
  readonly meta: PlatformMeta
  private dsl: AdapterDSL
  private customLogic?: Record<string, Function>

  constructor(dsl: AdapterDSL, customLogic?: Record<string, Function>) {
    super()
    this.dsl = dsl
    this.customLogic = customLogic
    this.meta = {
      id: dsl.name,
      name: dsl.display_name,
      icon: dsl.icon,
      homepage: dsl.homepage,
      capabilities: dsl.capabilities,
    }
  }

  async checkAuth(): Promise<AuthResult> {
    try {
      const result = await this.executeEndpoint(this.dsl.auth.check, {})

      return {
        isAuthenticated: true,
        ...result.extracted,
      }
    } catch (error) {
      return {
        isAuthenticated: false,
        error: (error as Error).message,
      }
    }
  }

  async publish(article: Article, options?: { draftOnly?: boolean; onImageProgress?: (current: number, total: number) => void }): Promise<SyncResult> {
    try {
      // 转换为内部格式（包含 content 字段，用于 DSL 处理）
      // 优先使用原始 HTML，否则从 Markdown 转换
      let workingArticle: ArticleWithContent = {
        ...article,
        content: article.html || markdownToHtml(article.markdown),
      }
      const context: Record<string, unknown> = { article: workingArticle }

      // 1. HTML 预处理 (基于 DSL 配置)
      if (this.dsl.html_processing) {
        workingArticle = {
          ...workingArticle,
          content: processHtml(workingArticle.content, this.dsl.html_processing),
        }
        context.article = workingArticle
      }

      // 2. 处理图片上传 (如果有自定义逻辑)
      if (this.customLogic?.process_images) {
        const processedContent = await this.customLogic.process_images(
          workingArticle.content,
          options?.onImageProgress
        )
        workingArticle = { ...workingArticle, content: processedContent }
        context.article = workingArticle
      }

      // 2.5 处理封面图片 (如果有自定义逻辑且有 cover)
      if (workingArticle.cover && this.customLogic?.upload_image_by_url) {
        try {
          const result = await this.customLogic.upload_image_by_url(workingArticle.cover)
          // 提取 URL 字符串，注意空字符串也是有效的（表示上传失败）
          const newCover = typeof result === 'string'
            ? result
            : (result?.src ?? result?.url ?? result?.image_url ?? '')
          workingArticle = { ...workingArticle, cover: newCover }
          context.article = workingArticle
        } catch (error) {
          console.warn('[DSLAdapter] Failed to upload cover image:', error)
          // 如果上传失败，清空 cover 避免参数错误
          workingArticle = { ...workingArticle, cover: '' }
          context.article = workingArticle
        }
      }

      // 3. 内容转换 (如果有自定义逻辑)
      if (this.customLogic?.content_transform) {
        workingArticle = {
          ...workingArticle,
          content: this.customLogic.content_transform(workingArticle.content, context),
        }
        context.article = workingArticle
      }

      // 4. 格式转换 (HTML → Markdown)
      if (this.dsl.output_format === 'markdown') {
        workingArticle = {
          ...workingArticle,
          content: htmlToMarkdown(workingArticle.content, this.dsl.markdown_options),
        }
        context.article = workingArticle
      }

      // 创建草稿
      let draftId: string | undefined
      if (this.dsl.endpoints.create_draft) {
        const draftResult = await this.executeEndpoint(
          this.dsl.endpoints.create_draft,
          context
        )
        draftId = draftResult.extracted?.draft_id as string
        context.draft_id = draftId
      }

      // 更新草稿内容
      if (draftId && this.dsl.endpoints.update_draft) {
        await this.executeEndpoint(this.dsl.endpoints.update_draft, context)
      }

      // 如果只保存草稿，不发布
      if (options?.draftOnly) {
        // 构建草稿编辑链接
        let draftUrl: string | undefined
        if (this.dsl.draft_url_template && draftId) {
          draftUrl = this.dsl.draft_url_template.replace('{{draft_id}}', draftId)
        }

        return this.createResult(true, {
          postId: draftId,
          postUrl: draftUrl,
          draftOnly: true,
        })
      }

      // 发布
      if (this.dsl.endpoints.publish) {
        const publishResult = await this.executeEndpoint(
          this.dsl.endpoints.publish,
          context
        )
        return this.createResult(true, {
          postId: publishResult.extracted?.post_id as string,
          postUrl: publishResult.extracted?.post_url as string,
        })
      }

      return this.createResult(true, { postId: draftId })
    } catch (error) {
      return this.createResult(false, {
        error: (error as Error).message,
      })
    }
  }

  async uploadImage(file: Blob, filename?: string): Promise<string> {
    // 优先使用自定义上传函数
    if (this.customLogic?.upload_image) {
      const result = await this.customLogic.upload_image(file, filename)
      return result.url || result.image_url || result
    }

    if (!this.dsl.endpoints.upload_image) {
      throw new Error('Platform does not support image upload')
    }

    const result = await this.executeEndpoint(this.dsl.endpoints.upload_image, {
      image: file,
      filename,
    })

    return result.extracted?.image_url as string
  }

  async uploadImageByUrl(imageUrl: string): Promise<string> {
    // 使用自定义 URL 上传函数
    if (this.customLogic?.upload_image_by_url) {
      const result = await this.customLogic.upload_image_by_url(imageUrl)
      return result.src || result.url || result.image_url || result
    }

    throw new Error('Platform does not support URL-based image upload')
  }

  async getCategories(): Promise<Category[]> {
    if (!this.dsl.endpoints.get_categories) {
      return []
    }

    const result = await this.executeEndpoint(
      this.dsl.endpoints.get_categories,
      {}
    )

    return (result.extracted?.categories as Category[]) || []
  }

  /**
   * 执行端点请求
   */
  private async executeEndpoint(
    endpoint: EndpointDef,
    context: Record<string, unknown>
  ): Promise<{ data: unknown; extracted: Record<string, unknown> }> {
    // 解析 URL 模板
    const url = this.interpolate(endpoint.request.url, context)

    // 构建请求体
    let body: BodyInit | undefined
    if (endpoint.request.body) {
      const bodyData = this.interpolateObject(endpoint.request.body, context)

      if (endpoint.request.content_type === 'multipart') {
        const formData = new FormData()
        Object.entries(bodyData).forEach(([key, value]) => {
          if (value instanceof Blob) {
            formData.append(key, value)
          } else {
            formData.append(key, String(value))
          }
        })
        body = formData
      } else if (endpoint.request.content_type === 'form') {
        body = new URLSearchParams(bodyData as Record<string, string>)
      } else {
        body = JSON.stringify(bodyData)
      }
    }

    // 合并 endpoint headers 和动态 headers (from before_request hook)
    let headers = { ...endpoint.request.headers }
    if (this.customLogic?.before_request) {
      const dynamicHeaders = await this.customLogic.before_request(url, context)
      headers = { ...headers, ...dynamicHeaders }
    }

    // 允许 prepare_body hook 修改请求体 (用于修复 YAML 空数组等问题)
    if (body && this.customLogic?.prepare_body) {
      body = await this.customLogic.prepare_body(url, body, context)
    }

    // 发送请求
    const response = await this.request<Record<string, unknown>>(url, {
      method: endpoint.request.method,
      headers,
      body,
    })

    // 检查成功条件
    if (endpoint.response.success) {
      const isSuccess = this.evaluateJsonPath(
        endpoint.response.success,
        response
      )
      if (!isSuccess) {
        const errorMsg = endpoint.response.error
          ? this.evaluateJsonPath(endpoint.response.error, response)
          : 'Request failed'
        throw new Error(String(errorMsg))
      }
    }

    // 提取字段
    const extracted: Record<string, unknown> = {}
    if (endpoint.response.extract) {
      Object.entries(endpoint.response.extract).forEach(([key, path]) => {
        extracted[key] = this.evaluateJsonPath(path, response)
      })
    }

    return { data: response, extracted }
  }

  /**
   * 模板插值
   */
  private interpolate(
    template: string,
    context: Record<string, unknown>
  ): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const value = this.getNestedValue(context, path.trim())
      return value !== undefined ? String(value) : ''
    })
  }

  /**
   * 对象模板插值
   */
  private interpolateObject(
    obj: Record<string, unknown>,
    context: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    Object.entries(obj).forEach(([key, value]) => {
      if (typeof value === 'string') {
        result[key] = this.interpolate(value, context)
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.interpolateObject(
          value as Record<string, unknown>,
          context
        )
      } else {
        result[key] = value
      }
    })

    return result
  }

  /**
   * 简化版 JSONPath 求值
   * 支持简单的比较表达式: $.field != null, $.field == "value"
   */
  private evaluateJsonPath(path: string, data: unknown): unknown {
    // 处理比较表达式
    const comparisonMatch = path.match(/^(\$[.\w]+)\s*(!=|==)\s*(.+)$/)
    if (comparisonMatch) {
      const [, fieldPath, operator, compareValue] = comparisonMatch
      const value = this.extractValue(fieldPath, data)
      const parsedCompareValue = this.parseCompareValue(compareValue.trim())

      if (operator === '!=') {
        return value !== parsedCompareValue
      } else if (operator === '==') {
        return value === parsedCompareValue
      }
    }

    return this.extractValue(path, data)
  }

  /**
   * 提取字段值
   */
  private extractValue(path: string, data: unknown): unknown {
    const normalizedPath = path.startsWith('$.')
      ? path.slice(2)
      : path.startsWith('$')
      ? path.slice(1)
      : path

    return this.getNestedValue(data as Record<string, unknown>, normalizedPath)
  }

  /**
   * 解析比较值
   */
  private parseCompareValue(value: string): unknown {
    if (value === 'null') return null
    if (value === 'undefined') return undefined
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^-?\d+$/.test(value)) return parseInt(value, 10)
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value)
    // 去掉引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1)
    }
    return value
  }

  /**
   * 获取嵌套值
   */
  private getNestedValue(
    obj: Record<string, unknown>,
    path: string
  ): unknown {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key]
      }
      return undefined
    }, obj as unknown)
  }
}
