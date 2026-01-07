/**
 * 雪球适配器
 */
import { CodeAdapter, type ImageUploadResult, htmlToMarkdown, markdownToHtml } from '@wechatsync/core'
import { Remarkable } from 'remarkable'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core'
import type { PublishOptions } from '@wechatsync/core'
import { createLogger } from '../lib/logger'

const logger = createLogger('Xueqiu')

interface XueqiuUser {
  id: string
  screen_name: string
  photo_domain: string
  profile_image_url: string
}

export class XueqiuAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'xueqiu',
    name: '雪球',
    icon: 'https://xqdoc.imedao.com/17aebcfb84a145d33fc18679.ico',
    homepage: 'https://mp.xueqiu.com/writeV2',
    capabilities: ['article', 'draft', 'image_upload'],
  }

  private currentUser: XueqiuUser | null = null

  async checkAuth(): Promise<AuthResult> {
    try {
      const response = await this.runtime.fetch(
        'https://mp.xueqiu.com/writeV2',
        {
          method: 'GET',
          credentials: 'include',
        }
      )

      const html = await response.text()

      // 解析 window.UOM_CURRENTUSER - 新版格式
      const userMatch = html.match(/window\.UOM_CURRENTUSER\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
      if (!userMatch) {
        return { isAuthenticated: false }
      }

      try {
        const state = JSON.parse(userMatch[1])
        const { currentUser } = state

        if (!currentUser?.id) {
          return { isAuthenticated: false }
        }

        this.currentUser = currentUser

        const avatar = currentUser.photo_domain && currentUser.profile_image_url
          ? `https:${currentUser.photo_domain}${currentUser.profile_image_url.split(',')[0]}`
          : ''

        return {
          isAuthenticated: true,
          userId: String(currentUser.id),
          username: currentUser.screen_name,
          avatar,
        }
      } catch (e) {
        logger.error(' Failed to parse user data:', e)
        return { isAuthenticated: false }
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
      if (!this.currentUser) {
        const auth = await this.checkAuth()
        if (!auth.isAuthenticated) {
          throw new Error('请先登录雪球')
        }
      }

      // 2. 获取 HTML 内容
      const rawHtml = article.html || markdownToHtml(article.markdown)

      // 3. 清理内容
      let content = this.cleanHtml(rawHtml, {
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
          skipPatterns: ['xueqiu.com', 'imedao.com'],
          onProgress: options?.onImageProgress,
        }
      )

      // 4. 转换为 Markdown 再转回简化 HTML (雪球格式)
      const markdown = htmlToMarkdown(content)
      const md = new Remarkable({
        html: true,
        breaks: true,
      })

      // 自定义渲染规则适配雪球格式
      // 所有标题都转为 h4
      md.renderer.rules.heading_open = () => '<h4>'
      md.renderer.rules.heading_close = () => '</h4>'

      // strong -> b
      md.renderer.rules.strong_open = () => '<b>'
      md.renderer.rules.strong_close = () => '</b>'

      // em -> i
      md.renderer.rules.em_open = () => '<i>'
      md.renderer.rules.em_close = () => '</i>'

      // 列表 - 移除列表包装，列表项内的 p 标签由 remarkable 自动处理
      md.renderer.rules.bullet_list_open = () => ''
      md.renderer.rules.bullet_list_close = () => ''
      md.renderer.rules.ordered_list_open = () => ''
      md.renderer.rules.ordered_list_close = () => ''
      md.renderer.rules.list_item_open = () => ''
      md.renderer.rules.list_item_close = () => ''

      // 移除 hr
      md.renderer.rules.hr = () => ''

      // 图片添加 class
      md.renderer.rules.image = (tokens: any[], idx: number) => {
        const src = tokens[idx].src || ''
        const alt = tokens[idx].alt || ''
        return `<img src="${src}" alt="${alt}" class="ke_img">`
      }

      let rendered = md.render(markdown)

      // 清理: 移除空 p 标签和多余换行
      rendered = rendered
        .replace(/<p>\s*<\/p>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

      content = rendered

      // 4. 保存草稿
      const formData = new URLSearchParams({
        text: content,
        title: article.title,
        cover_pic: '',
        flags: 'false',
        original_event: '',
        status_id: '',
        legal_user_visible: 'false',
        is_private: 'false',
      })

      const response = await this.runtime.fetch(
        'https://mp.xueqiu.com/xq/statuses/draft/save.json',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData,
        }
      )

      const res = await response.json() as {
        id?: string | number
        error_description?: string
      }

      logger.debug(' Save response:', res)

      if (!res.id) {
        throw new Error(res.error_description || '保存失败')
      }

      const postId = res.id
      const draftUrl = `https://mp.xueqiu.com/write/draft/${postId}`

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
    // 1. 下载图片
    const imageResponse = await fetch(src)
    if (!imageResponse.ok) {
      throw new Error('图片下载失败: ' + src)
    }
    const imageBlob = await imageResponse.blob()

    // 2. 上传到雪球
    const formData = new FormData()
    formData.append('file', imageBlob, 'image.jpg')

    const uploadResponse = await this.runtime.fetch(
      'https://mp.xueqiu.com/xq/photo/upload.json',
      {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }
    )

    const res = await uploadResponse.json() as {
      url?: string
      filename?: string
    }

    logger.debug(' Image upload response:', res)

    if (!res.url || !res.filename) {
      throw new Error('图片上传失败')
    }

    // 雪球返回的 url 是 //开头，需要加 https:
    const fullUrl = res.url.startsWith('//') ? `https:${res.url}/${res.filename}` : `${res.url}/${res.filename}`

    return {
      url: fullUrl,
    }
  }
}
