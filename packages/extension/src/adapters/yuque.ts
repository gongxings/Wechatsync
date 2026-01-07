/**
 * 语雀适配器
 */
import { CodeAdapter, type ImageUploadResult, htmlToMarkdown, markdownToHtml } from '@wechatsync/core'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core'
import type { PublishOptions } from '@wechatsync/core'
import { createLogger } from '../lib/logger'

const logger = createLogger('Yuque')

interface YuqueUserInfo {
  id: number
  name: string
  avatar_url: string
}

interface YuqueBook {
  target_id: number
  user: YuqueUserInfo
}

export class YuqueAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'yuque',
    name: '语雀',
    icon: 'https://gw.alipayobjects.com/zos/rmsportal/UTjFYEzMSYVwzxIGVhMu.png',
    homepage: 'https://www.yuque.com/dashboard',
    capabilities: ['article', 'draft', 'image_upload'],
  }

  private userInfo: YuqueUserInfo | null = null
  private bookId: number | null = null
  private csrfToken: string = ''
  private currentPostId: number | null = null

  /**
   * 获取 CSRF Token
   */
  private async getCsrfToken(): Promise<string> {
    const cookie = await chrome.cookies.get({
      url: 'https://www.yuque.com',
      name: 'yuque_ctoken',
    })
    if (!cookie?.value) {
      throw new Error('请先登录语雀')
    }
    return cookie.value
  }

  async checkAuth(): Promise<AuthResult> {
    try {
      // 获取 CSRF Token
      this.csrfToken = await this.getCsrfToken()

      const response = await this.runtime.fetch(
        'https://www.yuque.com/api/mine/common_used',
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            'x-csrf-token': this.csrfToken,
          },
        }
      )

      const res = await response.json() as {
        data?: {
          books?: YuqueBook[]
        }
      }

      logger.debug('checkAuth response:', res)

      if (res.data?.books && res.data.books.length > 0) {
        const firstBook = res.data.books[0]
        this.userInfo = firstBook.user
        this.bookId = firstBook.target_id

        return {
          isAuthenticated: true,
          userId: String(firstBook.user.id),
          username: firstBook.user.name,
          avatar: firstBook.user.avatar_url,
        }
      }

      return { isAuthenticated: false }
    } catch (error) {
      logger.error('checkAuth error:', error)
      return { isAuthenticated: false, error: (error as Error).message }
    }
  }

  async publish(article: Article, options?: PublishOptions): Promise<SyncResult> {
    try {
      logger.info('Starting publish...')

      // 1. 确保已登录
      if (!this.userInfo || !this.bookId) {
        const auth = await this.checkAuth()
        if (!auth.isAuthenticated) {
          throw new Error('请先登录语雀')
        }
      }

      // 2. 创建文档
      const createResponse = await this.runtime.fetch(
        'https://www.yuque.com/api/docs',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': this.csrfToken,
          },
          body: JSON.stringify({
            title: article.title,
            type: 'Doc',
            format: 'lake',
            book_id: this.bookId,
            status: 0,
          }),
        }
      )

      const createRes = await createResponse.json() as {
        data?: { id: number }
        message?: string
      }

      logger.debug('Create doc response:', createRes)

      if (!createRes.data?.id) {
        throw new Error(createRes.message || '创建文档失败')
      }

      const postId = createRes.data.id
      this.currentPostId = postId

      // 3. 获取 HTML 内容
      const rawHtml = article.html || markdownToHtml(article.markdown)

      // 4. 清理内容
      let content = this.cleanHtml(rawHtml, {
        removeIframes: true,
        removeSvgImages: true,
        removeTags: ['qqmusic'],
        removeAttrs: ['data-reader-unique-id'],
      })

      // 4. 处理图片
      content = await this.processImages(
        content,
        (src) => this.uploadImageByUrl(src),
        {
          skipPatterns: ['yuque.com', 'cdn.nlark.com'],
          onProgress: options?.onImageProgress,
        }
      )

      // 5. HTML 转 Markdown
      const markdown = htmlToMarkdown(content)

      // 6. 转换为 Lake 格式
      const convertResponse = await this.runtime.fetch(
        'https://www.yuque.com/api/docs/convert',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': this.csrfToken,
          },
          body: JSON.stringify({
            from: 'markdown',
            to: 'lake',
            content: markdown,
          }),
        }
      )

      const convertRes = await convertResponse.json() as {
        data?: { content: string }
      }

      if (!convertRes.data?.content) {
        throw new Error('内容转换失败')
      }

      const lakeContent = convertRes.data.content

      // 7. 保存文档内容
      const saveResponse = await this.runtime.fetch(
        `https://www.yuque.com/api/docs/${postId}/content`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': this.csrfToken,
          },
          body: JSON.stringify({
            format: 'lake',
            body_asl: lakeContent,
            body: `<div class="lake-content" typography="traditional">${lakeContent}</div>`,
            body_html: `<div class="lake-content" typography="traditional">${lakeContent}</div>`,
            draft_version: 0,
            sync_dynamic_data: false,
            save_type: 'auto',
            edit_type: 'Lake',
          }),
        }
      )

      const saveRes = await saveResponse.json()
      logger.debug('Save response:', saveRes)

      const draftUrl = `https://www.yuque.com/go/doc/${postId}/edit`

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
    if (!this.currentPostId) {
      throw new Error('文档 ID 未设置')
    }

    // 1. 下载图片
    const imageResponse = await fetch(src)
    if (!imageResponse.ok) {
      throw new Error('图片下载失败: ' + src)
    }
    const imageBlob = await imageResponse.blob()

    // 2. 上传到语雀
    const formData = new FormData()
    formData.append('file', imageBlob, 'image.jpg')

    const uploadUrl = `https://www.yuque.com/api/upload/attach?attachable_type=Doc&attachable_id=${this.currentPostId}&type=image`
    const uploadResponse = await this.runtime.fetch(uploadUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'x-csrf-token': this.csrfToken,
      },
      body: formData,
    })

    const res = await uploadResponse.json() as {
      data?: {
        attachment_id: string
        url: string
      }
    }

    logger.debug('Image upload response:', res)

    if (!res.data?.url) {
      throw new Error('图片上传失败')
    }

    return {
      url: res.data.url,
    }
  }
}
