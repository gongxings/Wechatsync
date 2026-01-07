import type { Cookie, HeaderRule } from '../types'

/**
 * 运行时接口抽象
 * 支持在浏览器扩展和 Node.js 环境中复用核心逻辑
 */
export interface RuntimeInterface {
  /** 运行时类型标识 */
  readonly type: 'extension' | 'node'

  /**
   * HTTP 请求
   * 在扩展环境自动携带 cookies，Node 环境需手动管理
   */
  fetch(url: string, options?: RequestInit): Promise<Response>

  /**
   * Cookie 管理
   */
  cookies: {
    get(domain: string): Promise<Cookie[]>
    set(cookie: Cookie): Promise<void>
    remove(name: string, domain: string): Promise<void>
  }

  /**
   * 持久化存储
   */
  storage: {
    get<T>(key: string): Promise<T | null>
    set<T>(key: string, value: T): Promise<void>
    remove(key: string): Promise<void>
  }

  /**
   * 会话存储 (扩展重启后清空)
   */
  session: {
    get<T>(key: string): Promise<T | null>
    set<T>(key: string, value: T): Promise<void>
  }

  /**
   * Header 规则管理 (用于请求拦截)
   * 仅扩展环境支持
   */
  headerRules?: {
    add(rule: HeaderRule): Promise<string>
    remove(ruleId: string): Promise<void>
    clear(): Promise<void>
  }

  /**
   * DOM 操作
   * 扩展环境通过 Offscreen Document 实现
   * Node 环境使用 jsdom 或类似库
   */
  dom: {
    parseHTML(html: string): Promise<Document>
    querySelector(doc: Document, selector: string): Element | null
    querySelectorAll(doc: Document, selector: string): Element[]
    getTextContent(element: Element): string
    getInnerHTML(element: Element): string
  }
}

/**
 * 创建运行时的工厂函数类型
 */
export type RuntimeFactory = (config?: RuntimeConfig) => RuntimeInterface

/**
 * 运行时配置
 */
export interface RuntimeConfig {
  /** Node 环境：预加载的 cookies */
  cookies?: Record<string, Cookie[]>
  /** 请求超时时间 (ms) */
  timeout?: number
  /** 用户代理 */
  userAgent?: string
}
