import type { RuntimeInterface, RuntimeConfig } from '@wechatsync/core'
import type { Cookie, HeaderRule } from '@wechatsync/core'

/**
 * Chrome 扩展运行时实现
 */
export class ExtensionRuntime implements RuntimeInterface {
  readonly type = 'extension' as const
  private ruleIdCounter = 1

  constructor(private config?: RuntimeConfig) {}

  /**
   * HTTP 请求 - 自动携带 cookies
   */
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
    })
    return response
  }

  /**
   * Cookie 管理
   */
  cookies = {
    async get(domain: string): Promise<Cookie[]> {
      const cookies = await chrome.cookies.getAll({ domain })
      return cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        expirationDate: c.expirationDate,
      }))
    },

    async set(cookie: Cookie): Promise<void> {
      await chrome.cookies.set({
        url: `https://${cookie.domain}${cookie.path || '/'}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expirationDate,
      })
    },

    async remove(name: string, domain: string): Promise<void> {
      await chrome.cookies.remove({
        url: `https://${domain}`,
        name,
      })
    },
  }

  /**
   * 持久化存储
   */
  storage = {
    async get<T>(key: string): Promise<T | null> {
      const result = await chrome.storage.local.get(key)
      return (result[key] as T) ?? null
    },

    async set<T>(key: string, value: T): Promise<void> {
      await chrome.storage.local.set({ [key]: value })
    },

    async remove(key: string): Promise<void> {
      await chrome.storage.local.remove(key)
    },
  }

  /**
   * 会话存储
   */
  session = {
    async get<T>(key: string): Promise<T | null> {
      const result = await chrome.storage.session.get(key)
      return (result[key] as T) ?? null
    },

    async set<T>(key: string, value: T): Promise<void> {
      await chrome.storage.session.set({ [key]: value })
    },
  }

  /**
   * Header 规则管理 (declarativeNetRequest)
   */
  headerRules = {
    add: async (rule: HeaderRule): Promise<string> => {
      const ruleId = this.ruleIdCounter++
      const id = `rule_${ruleId}`

      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [
          {
            id: ruleId,
            priority: 1,
            action: {
              type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
              requestHeaders: Object.entries(rule.headers).map(
                ([header, value]) => ({
                  header,
                  operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                  value,
                })
              ),
            },
            condition: {
              urlFilter: rule.urlFilter,
              resourceTypes: (rule.resourceTypes || [
                'xmlhttprequest',
                'main_frame',
              ]) as chrome.declarativeNetRequest.ResourceType[],
            },
          },
        ],
      })

      return id
    },

    remove: async (ruleId: string): Promise<void> => {
      const id = parseInt(ruleId.replace('rule_', ''), 10)
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [id],
      })
    },

    clear: async (): Promise<void> => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules()
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: rules.map(r => r.id),
      })
    },
  }

  /**
   * DOM 操作 - 通过 Offscreen Document 实现
   */
  dom = {
    parseHTML: async (html: string): Promise<Document> => {
      const parser = new DOMParser()
      return parser.parseFromString(html, 'text/html')
    },

    querySelector: (doc: Document, selector: string): Element | null => {
      return doc.querySelector(selector)
    },

    querySelectorAll: (doc: Document, selector: string): Element[] => {
      return Array.from(doc.querySelectorAll(selector))
    },

    getTextContent: (element: Element): string => {
      return element.textContent || ''
    },

    getInnerHTML: (element: Element): string => {
      return element.innerHTML
    },
  }
}

/**
 * 创建扩展运行时实例
 */
export function createExtensionRuntime(config?: RuntimeConfig): ExtensionRuntime {
  return new ExtensionRuntime(config)
}
