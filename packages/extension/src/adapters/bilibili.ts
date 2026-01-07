/**
 * B站适配器
 */
import { CodeAdapter, type ImageUploadResult, markdownToHtml } from '@wechatsync/core'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core'
import type { PublishOptions } from '@wechatsync/core'
import { createLogger } from '../lib/logger'

const logger = createLogger('Bilibili')

interface BilibiliUserInfo {
  mid: number
  uname: string
  face: string
  isLogin: boolean
}

export class BilibiliAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'bilibili',
    name: '哔哩哔哩',
    icon: 'https://www.bilibili.com/favicon.ico',
    homepage: 'https://member.bilibili.com/platform/upload/text',
    capabilities: ['article', 'draft', 'image_upload'],
  }

  private userInfo: BilibiliUserInfo | null = null
  private csrf: string = ''

  async checkAuth(): Promise<AuthResult> {
    try {
      const res = await this.get<{
        code: number
        data?: BilibiliUserInfo
      }>('https://api.bilibili.com/x/web-interface/nav?build=0&mobi_app=web')

      logger.debug('checkAuth response:', res)

      if (res.code === 0 && res.data?.isLogin) {
        this.userInfo = res.data

        // 获取 CSRF token (bili_jct cookie)
        await this.fetchCsrf()

        return {
          isAuthenticated: true,
          userId: String(res.data.mid),
          username: res.data.uname,
          avatar: res.data.face,
        }
      }

      return { isAuthenticated: false }
    } catch (error) {
      logger.error('checkAuth error:', error)
      return { isAuthenticated: false, error: (error as Error).message }
    }
  }

  /**
   * 获取 CSRF token (从 bili_jct cookie)
   */
  private async fetchCsrf(): Promise<void> {
    try {
      const cookie = await chrome.cookies.get({
        url: 'https://www.bilibili.com',
        name: 'bili_jct',
      })
      this.csrf = cookie?.value || ''
      logger.debug('CSRF token:', this.csrf ? 'obtained' : 'not found')
    } catch (e) {
      logger.error('Failed to get CSRF:', e)
    }
  }

  async publish(article: Article, options?: PublishOptions): Promise<SyncResult> {
    try {
      logger.info('Starting publish...')

      // 1. 确保已登录
      if (!this.userInfo) {
        const auth = await this.checkAuth()
        if (!auth.isAuthenticated) {
          throw new Error('请先登录B站')
        }
      }

      if (!this.csrf) {
        throw new Error('获取 CSRF token 失败，请刷新页面后重试')
      }

      // 2. 获取 HTML 内容
      const rawHtml = article.html || markdownToHtml(article.markdown)

      // 3. 清理内容
      let content = this.cleanHtml(rawHtml, {
        removeLinks: true,
        removeIframes: true,
        removeSvgImages: true,
        removeTags: ['qqmusic'],
        removeAttrs: ['data-reader-unique-id'],
      })

      // 3. 处理图片
      content = await this.processImages(
        content,
        (src) => this.uploadImageByUrl(src),
        {
          skipPatterns: ['hdslb.com', 'bilibili.com', 'biliimg.com'],
          onProgress: options?.onImageProgress,
        }
      )

      // 4. 保存草稿
      const res = await this.postForm<{
        code: number
        message?: string
        data?: { aid: number }
      }>(
        'https://api.bilibili.com/x/article/creative/draft/addupdate',
        {
          tid: '4', // 分类 ID
          title: article.title,
          content: content,
          csrf: this.csrf,
          save: '0',
          pgc_id: '0',
        }
      )

      logger.debug('Draft response:', res)

      if (res.code !== 0 || !res.data?.aid) {
        throw new Error(res.message || '保存草稿失败')
      }

      const draftUrl = `https://member.bilibili.com/platform/upload/text/edit?aid=${res.data.aid}`

      return this.createResult(true, {
        postId: String(res.data.aid),
        postUrl: draftUrl,
        draftOnly: options?.draftOnly ?? true,
      })
    } catch (error) {
      return this.createResult(false, {
        error: (error as Error).message,
      })
    }
  }

  /**
   * 通过 URL 上传图片
   */
  protected async uploadImageByUrl(src: string): Promise<ImageUploadResult> {
    if (!this.csrf) {
      throw new Error('CSRF token 未获取')
    }

    // 1. 下载图片
    const imageResponse = await fetch(src)
    if (!imageResponse.ok) {
      throw new Error('图片下载失败: ' + src)
    }
    const imageBlob = await imageResponse.blob()

    // 2. 上传到B站
    const formData = new FormData()
    formData.append('binary', imageBlob, 'image.jpg')
    formData.append('csrf', this.csrf)

    const uploadUrl = 'https://api.bilibili.com/x/article/creative/article/upcover'
    const uploadResponse = await this.runtime.fetch(uploadUrl, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })

    const res = await uploadResponse.json() as {
      code: number
      message?: string
      data?: {
        url: string
        size: number
      }
    }

    logger.debug('Image upload response:', res)

    if (res.code !== 0 || !res.data?.url) {
      throw new Error(res.message || '图片上传失败')
    }

    return {
      url: res.data.url,
      attrs: {
        size: String(res.data.size),
      },
    }
  }
}
