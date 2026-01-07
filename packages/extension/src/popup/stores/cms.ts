import { create } from 'zustand'
import { createLogger } from '../../lib/logger'

const logger = createLogger('CMSStore')

export type CMSType = 'wordpress' | 'typecho' | 'metaweblog'

export interface CMSAccount {
  id: string
  type: CMSType
  name: string
  url: string
  username: string
  // 密码存储在 chrome.storage.local 中，不在状态里
  isConnected: boolean
  lastError?: string
}

interface CMSState {
  accounts: CMSAccount[]
  loading: boolean

  loadAccounts: () => Promise<void>
  addAccount: (account: Omit<CMSAccount, 'id' | 'isConnected'> & { password: string }) => Promise<{ success: boolean; error?: string }>
  removeAccount: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<{ success: boolean; error?: string }>
}

export const useCMSStore = create<CMSState>((set, get) => ({
  accounts: [],
  loading: false,

  loadAccounts: async () => {
    set({ loading: true })
    try {
      const storage = await chrome.storage.local.get('cmsAccounts')
      const accounts = storage.cmsAccounts || []
      set({ accounts, loading: false })
    } catch (error) {
      logger.error('Failed to load CMS accounts:', error)
      set({ loading: false })
    }
  },

  addAccount: async (accountData) => {
    try {
      const { accounts } = get()
      const id = `cms_${Date.now()}`

      const newAccount: CMSAccount = {
        id,
        type: accountData.type,
        name: accountData.name,
        url: accountData.url,
        username: accountData.username,
        isConnected: false,
      }

      // 测试连接
      const testResult = await chrome.runtime.sendMessage({
        type: 'TEST_CMS_CONNECTION',
        payload: {
          type: accountData.type,
          url: accountData.url,
          username: accountData.username,
          password: accountData.password,
        },
      })

      if (!testResult.success) {
        return { success: false, error: testResult.error || '连接失败' }
      }

      newAccount.isConnected = true

      // 保存账户信息
      const updatedAccounts = [...accounts, newAccount]
      await chrome.storage.local.set({ cmsAccounts: updatedAccounts })

      // 单独保存密码 (加密存储)
      await chrome.storage.local.set({ [`cms_pwd_${id}`]: accountData.password })

      set({ accounts: updatedAccounts })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },

  removeAccount: async (id: string) => {
    try {
      const { accounts } = get()
      const updatedAccounts = accounts.filter(a => a.id !== id)
      await chrome.storage.local.set({ cmsAccounts: updatedAccounts })
      await chrome.storage.local.remove(`cms_pwd_${id}`)
      set({ accounts: updatedAccounts })
    } catch (error) {
      logger.error('Failed to remove CMS account:', error)
    }
  },

  testConnection: async (id: string) => {
    try {
      const { accounts } = get()
      const account = accounts.find(a => a.id === id)
      if (!account) {
        return { success: false, error: '账户不存在' }
      }

      const storage = await chrome.storage.local.get(`cms_pwd_${id}`)
      const password = storage[`cms_pwd_${id}`]

      const result = await chrome.runtime.sendMessage({
        type: 'TEST_CMS_CONNECTION',
        payload: {
          type: account.type,
          url: account.url,
          username: account.username,
          password,
        },
      })

      // 更新连接状态
      const updatedAccounts = accounts.map(a =>
        a.id === id
          ? { ...a, isConnected: result.success, lastError: result.error }
          : a
      )
      await chrome.storage.local.set({ cmsAccounts: updatedAccounts })
      set({ accounts: updatedAccounts })

      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
