/**
 * 搜狐号适配器
 */
import { CodeAdapter, type ImageUploadResult, markdownToHtml } from '@wechatsync/core'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core'
import type { PublishOptions } from '@wechatsync/core'
import { createLogger } from '../lib/logger'

const logger = createLogger('Sohu')

interface SohuAccountInfo {
  id: string
  nickName: string
  avatar: string
}

export class SohuAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'sohu',
    name: '搜狐号',
    icon: 'https://mp.sohu.com/favicon.ico',
    homepage: 'https://mp.sohu.com/mpfe/v3/main/first/page?newsType=1',
    capabilities: ['article', 'draft', 'image_upload'],
  }

  private accountInfo: SohuAccountInfo | null = null

  async checkAuth(): Promise<AuthResult> {
    try {
      const response = await this.runtime.fetch(
        `https://mp.sohu.com/mpbp/bp/account/register-info?_=${Date.now()}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      )

      const res = await response.json() as {
        code: number
        data?: {
          account: SohuAccountInfo
        }
      }

      logger.debug(' checkAuth response:', res)

      if (res.code !== 2000000 || !res.data?.account) {
        return { isAuthenticated: false }
      }

      this.accountInfo = res.data.account

      return {
        isAuthenticated: true,
        userId: String(this.accountInfo.id),
        username: this.accountInfo.nickName,
        avatar: this.accountInfo.avatar,
      }
    } catch (error) {
      logger.error(' checkAuth error:', error)
      return { isAuthenticated: false, error: (error as Error).message }
    }
  }

  async publish(article: Article, options?: PublishOptions): Promise<SyncResult> {
    try {
      logger.info('Starting publish...')

      // 1. 确保已登录
      if (!this.accountInfo) {
        const auth = await this.checkAuth()
        if (!auth.isAuthenticated) {
          throw new Error('请先登录搜狐号')
        }
      }

      // 2. 获取 HTML 内容
      const rawHtml = article.html || markdownToHtml(article.markdown)

      // 3. 清理内容
      let content = this.cleanHtml(rawHtml, {
        removeIframes: true,
        removeSvgImages: true,
        removeAttrs: ['data-reader-unique-id'],
      })

      // 3. 处理图片
      content = await this.processImages(
        content,
        (src) => this.uploadImageByUrl(src),
        {
          skipPatterns: ['sohu.com'],
          onProgress: options?.onImageProgress,
        }
      )

      // 4. 保存草稿
      const postData = new URLSearchParams({
        title: article.title,
        brief: '',
        content: content,
        channelId: '39',
        categoryId: '-1',
        id: '0',
        userColumnId: '0',
        businessCode: '0',
        isOriginal: 'false',
        cover: '',
        attrIds: '',
        topicIds: '',
        isAd: '0',
        reprint: 'false',
        accountId: this.accountInfo!.id,
      })

      const response = await this.runtime.fetch(
        `https://mp.sohu.com/mpbp/bp/news/v4/news/draft?accountId=${this.accountInfo!.id}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: postData,
        }
      )

      const res = await response.json() as {
        success: boolean
        data?: string | number
        msg?: string
      }

      logger.debug(' Save response:', res)

      if (!res.success) {
        throw new Error(res.msg || '保存失败')
      }

      const postId = res.data
      const draftUrl = `https://mp.sohu.com/mpfe/v3/main/news/addarticle?spm=smmp.articlelist.0.0&contentStatus=2&id=${postId}`

      return this.createResult(true, {
        postId: String(postId),
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
    if (!this.accountInfo) {
      throw new Error('未登录')
    }

    // 1. 下载图片
    const imageResponse = await fetch(src)
    if (!imageResponse.ok) {
      throw new Error('图片下载失败: ' + src)
    }
    const imageBlob = await imageResponse.blob()

    // 2. 上传到搜狐
    const formData = new FormData()
    formData.append('file', imageBlob, 'image.jpg')
    formData.append('accountId', this.accountInfo.id)

    const uploadResponse = await this.runtime.fetch(
      'https://mp.sohu.com/commons/front/outerUpload/image/file',
      {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }
    )

    const res = await uploadResponse.json() as {
      url?: string
    }

    logger.debug(' Image upload response:', res)

    if (!res.url) {
      throw new Error('图片上传失败')
    }

    return {
      url: res.url,
    }
  }
}
