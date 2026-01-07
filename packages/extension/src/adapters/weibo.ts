/**
 * 微博适配器
 */
import { CodeAdapter, type ImageUploadResult, markdownToHtml } from '@wechatsync/core'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '@wechatsync/core'
import type { PublishOptions } from '@wechatsync/core'
import { createLogger } from '../lib/logger'

const logger = createLogger('Weibo')

interface WeiboUserConfig {
  uid: string
  nick: string
  avatar_large: string
}

export class WeiboAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'weibo',
    name: '微博',
    icon: 'https://weibo.com/favicon.ico',
    homepage: 'https://card.weibo.com/article/v5/editor',
    capabilities: ['article', 'draft', 'image_upload', 'cover'],
  }

  private userConfig: WeiboUserConfig | null = null

  async checkAuth(): Promise<AuthResult> {
    try {
      const config = await this.getUserConfig()

      if (config?.uid) {
        return {
          isAuthenticated: true,
          userId: config.uid,
          username: config.nick,
          avatar: config.avatar_large,
        }
      }

      return { isAuthenticated: false }
    } catch (error) {
      logger.error('checkAuth error:', error)
      return { isAuthenticated: false, error: (error as Error).message }
    }
  }

  /**
   * 获取用户配置 (从编辑器页面解析 __WB_GET_CONFIG)
   */
  private async getUserConfig(): Promise<WeiboUserConfig | null> {
    if (this.userConfig) {
      return this.userConfig
    }

    const response = await this.runtime.fetch('https://card.weibo.com/article/v5/editor', {
      credentials: 'include',
    })
    const html = await response.text()

    // v5 版本: 解析 JSON.parse('{"uid":...}') 中的配置
    // 格式: config: JSON.parse('{"uid":1820387812,"nick":"_fun0",...}')
    const configMatch = html.match(/config:\s*JSON\.parse\('(.+?)'\)/)
    if (!configMatch) {
      logger.error('Failed to find config in HTML')
      return null
    }

    try {
      // 解析 JSON 字符串 (需要处理转义)
      const configJson = configMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
      const config = JSON.parse(configJson)

      if (!config.uid) {
        return null
      }

      this.userConfig = {
        uid: String(config.uid),
        nick: config.nick || '',
        avatar_large: config.avatar_large || '',
      }

      logger.debug('User config:', this.userConfig)
      return this.userConfig
    } catch (e) {
      logger.error('Failed to parse config:', e)
      return null
    }
  }

  async publish(article: Article, options?: PublishOptions): Promise<SyncResult> {
    try {
      logger.info('Starting publish...')

      // 1. 获取用户信息
      const config = await this.getUserConfig()
      if (!config?.uid) {
        throw new Error('请先登录微博')
      }

      // 2. 获取 HTML 内容
      const rawHtml = article.html || markdownToHtml(article.markdown)

      // 3. 清理内容（代码块和懒加载图片已在提取阶段处理）
      let content = this.cleanHtml(rawHtml, {
        removeIframes: true,
        removeSvgImages: true,
        removeTags: ['qqmusic'],
        removeAttrs: ['data-reader-unique-id'],
      })

      // 移除多余空白
      content = content.replace(/>\s+</g, '><')

      // 4. 处理图片（微博专用格式）
      content = await this.processWeiboImages(content, options?.onImageProgress)

      // 5. 创建草稿
      const createReqId = this.generateReqId()
      const createResponse = await this.runtime.fetch(
        `https://card.weibo.com/article/v5/aj/editor/draft/create?uid=${config.uid}&_rid=${createReqId}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'accept': 'application/json, text/plain, */*',
            'SN-REQID': createReqId,
          },
          body: new URLSearchParams({}),
        }
      )
      const createRes = await createResponse.json() as {
        code: number
        msg?: string
        data?: { id: string }
      }

      if (createRes.code !== 100000 || !createRes.data?.id) {
        throw new Error(createRes.msg || '创建草稿失败')
      }

      const postId = createRes.data.id
      logger.debug('Created draft:', postId)

      // 5. 处理封面
      let coverUrl = ''
      if (article.cover) {
        try {
          const coverResult = await this.uploadImageByUrl(article.cover)
          coverUrl = coverResult.url
        } catch (e) {
          logger.warn('Failed to upload cover:', e)
        }
      }

      // 6. 保存草稿
      const saveReqId = this.generateReqId()
      const saveResponse = await this.runtime.fetch(
        `https://card.weibo.com/article/v5/aj/editor/draft/save?uid=${config.uid}&id=${postId}&_rid=${saveReqId}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'accept': 'application/json, text/plain, */*',
            'SN-REQID': saveReqId,
          },
          body: new URLSearchParams({
            id: postId,
            title: article.title,
            subtitle: '',
            type: '',
            status: '0',
            publish_at: '',
            error_msg: '',
            error_code: '0',
            collection: '[]',
            free_content: '',
            content: content,
            cover: coverUrl,
            summary: '', // 留空，避免"导语不符合规范"错误
            writer: '',
            extra: 'null',
            is_word: '0',
            article_recommend: '[]',
            follow_to_read: '1',
            isreward: '1',
            pay_setting: '{"ispay":0,"isvclub":0}',
            source: '0',
            action: '1',
            content_type: '0',
            save: '1',
          }),
        }
      )
      const saveRes = await saveResponse.json() as {
        code: string | number
        msg?: string
      }

      logger.debug('Save response:', saveRes)

      // 微博成功码是 100000，其他都是错误
      const code = String(saveRes.code)
      if (code !== '100000') {
        throw new Error(saveRes.msg || `保存失败 (错误码: ${code})`)
      }

      const draftUrl = `https://card.weibo.com/article/v5/editor#/draft/${postId}`

      return this.createResult(true, {
        postId: postId,
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
   * 生成请求 ID: Ve(uid + "&" + timestamp)
   * 看起来是某种 hash 或编码
   */
  private generateReqId(): string {
    const input = `${this.userConfig?.uid}&${Date.now()}`
    // 使用 base64url 编码
    const base64 = btoa(input)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    // 如果长度不够，补充随机字符
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    let result = base64
    while (result.length < 43) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result.slice(0, 43)
  }

  /**
   * 通过 URL 或 data URI 上传图片
   * - 远程 URL: 使用异步上传 API
   * - data URI: 转为 Blob 直接上传
   */
  protected async uploadImageByUrl(src: string): Promise<ImageUploadResult> {
    // data URI 使用直接上传
    if (src.startsWith('data:')) {
      logger.debug('Uploading data URI image via direct upload')
      return this.uploadDataUri(src)
    }

    const config = await this.getUserConfig()
    if (!config?.uid) {
      throw new Error('请先登录微博')
    }

    const reqId = this.generateReqId()

    // 1. 发起异步上传请求 (可能返回错误但图片仍会处理)
    try {
      const uploadRes = await this.runtime.fetch(
        `https://card.weibo.com/article/v5/aj/editor/plugins/asyncuploadimg?uid=${config.uid}&_rid=${reqId}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'accept': 'application/json, text/plain, */*',
            'SN-REQID': reqId,
          },
          body: new URLSearchParams({ 'urls[0]': src }),
        }
      )

      const uploadData = await uploadRes.json()
      logger.debug('Async upload response:', uploadData)
      // 不检查返回值，直接进入轮询
    } catch (e) {
      logger.warn('Async upload request failed, will try polling anyway:', e)
    }

    // 2. 轮询等待上传完成
    const imgDetail = await this.waitForImageDone(src)

    // 使用 pid 构建正确的 URL 格式（wx3.sinaimg.cn/large/{pid}.jpg）
    // 而不是 API 返回的可能是 r.sinaimg.cn 格式
    const imgUrl = `https://wx3.sinaimg.cn/large/${imgDetail.pid}.jpg`

    return {
      url: imgUrl,
      attrs: {
        'data-pid': imgDetail.pid,
      },
    }
  }

  /**
   * 上传 base64 图片（供 MCP 调用）
   * @param imageData base64 编码的图片数据
   * @param mimeType 图片 MIME 类型
   */
  async uploadImageBase64(imageData: string, mimeType: string): Promise<ImageUploadResult> {
    const dataUri = `data:${mimeType};base64,${imageData}`
    return this.uploadDataUri(dataUri)
  }

  /**
   * 上传 data URI 图片 (直接二进制上传)
   */
  private async uploadDataUri(dataUri: string): Promise<ImageUploadResult> {
    // 解析 data URI: data:image/png;base64,xxxxx
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      throw new Error('Invalid data URI format')
    }

    const mimeType = match[1]
    const base64Data = match[2]

    // base64 转 Blob
    const binaryStr = atob(base64Data)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: mimeType })

    logger.debug(`Uploading blob: ${mimeType}, size: ${blob.size}`)

    // 直接上传到 picupload.weibo.com
    const reqId = this.generateReqId()
    const uploadUrl = `https://picupload.weibo.com/interface/pic_upload.php?app=miniblog&s=json&p=1&data=1&url=&markpos=1&logo=0&nick=&file_source=4&_rid=${reqId}`

    const response = await this.runtime.fetch(uploadUrl, {
      method: 'POST',
      credentials: 'include',
      body: blob,
    })

    const result = await response.json() as {
      code?: string
      data?: {
        pics?: {
          pic_1?: {
            pid: string
            width: number
            height: number
          }
        }
      }
    }

    logger.debug('Direct upload response:', result)

    if (!result.data?.pics?.pic_1?.pid) {
      throw new Error('图片上传失败: ' + JSON.stringify(result))
    }

    const pid = result.data.pics.pic_1.pid
    const imgUrl = `https://wx3.sinaimg.cn/large/${pid}.jpg`

    return {
      url: imgUrl,
      attrs: {
        'data-pid': pid,
      },
    }
  }

  /**
   * 微博专用图片处理
   * 将图片包裹在 <figure class="image"> 中，符合微博编辑器格式
   */
  private async processWeiboImages(
    content: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<string> {
    // 先处理懒加载图片（使用基类方法）
    const processedContent = this.makeImgVisible(content)

    // 提取所有图片（包含上下文，判断是否已被 figure 包裹）
    // 匹配 <figure>...<img>...</figure> 或单独的 <img>
    const figureImgRegex = /<figure[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<\/figure>/gi
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi
    const matches: { full: string; src: string; hasFigure: boolean }[] = []

    let match
    // 先匹配带 figure 的图片
    const figureMatches = new Set<string>()
    while ((match = figureImgRegex.exec(processedContent)) !== null) {
      matches.push({ full: match[0], src: match[1], hasFigure: true })
      figureMatches.add(match[1]) // 记录已匹配的 src
    }

    // 再匹配单独的 img（排除已在 figure 中的）
    while ((match = imgRegex.exec(processedContent)) !== null) {
      if (!figureMatches.has(match[1])) {
        matches.push({ full: match[0], src: match[1], hasFigure: false })
      }
    }

    // Markdown 图片
    const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
    while ((match = mdImgRegex.exec(processedContent)) !== null) {
      matches.push({ full: match[0], src: match[2], hasFigure: false })
    }

    if (matches.length === 0) {
      return processedContent
    }

    logger.info(`Found ${matches.length} images to process`)

    let result = processedContent
    const uploadedMap = new Map<string, { pid: string; url: string }>()
    let processed = 0

    for (const { full, src, hasFigure } of matches) {
      if (!src) continue

      // 跳过已经是微博图片的
      if (src.includes('sinaimg.cn') || src.includes('weibo.com')) {
        logger.debug(`Skipping weibo image: ${src}`)
        continue
      }

      // 跳过 data URI（暂时）
      if (src.startsWith('data:')) {
        continue
      }

      processed++
      onProgress?.(processed, matches.length)

      try {
        let imgInfo = uploadedMap.get(src)

        if (!imgInfo) {
          logger.debug(`Uploading image ${processed}/${matches.length}: ${src}`)
          const uploadResult = await this.uploadImageByUrl(src)
          const pid = uploadResult.attrs?.['data-pid'] as string || ''
          imgInfo = { pid, url: uploadResult.url }
          uploadedMap.set(src, imgInfo)
        }

        // 构建替换内容
        let replacement: string
        if (hasFigure) {
          // 已有 figure 包裹，保留 figure 结构，只替换 img
          replacement = full.replace(
            /<img[^>]+src="[^"]+"[^>]*>/i,
            `<img src="${imgInfo.url}" data-pid="${imgInfo.pid}" />`
          )
        } else {
          // 没有 figure 包裹，添加 figure
          replacement = `<figure class="image"><img src="${imgInfo.url}" data-pid="${imgInfo.pid}" /></figure>`
        }

        result = result.replace(full, replacement)
        logger.debug(`Image uploaded: ${imgInfo.url}`)
      } catch (error) {
        logger.error(`Failed to upload image: ${src}`, error)
      }

      await this.delay(300)
    }

    return result
  }

  /**
   * 轮询等待图片上传完成
   */
  private async waitForImageDone(src: string): Promise<{
    pid: string
    url: string
    task_status_code: number
  }> {
    const config = await this.getUserConfig()
    const maxAttempts = 30 // 最多等待 30 秒

    for (let i = 0; i < maxAttempts; i++) {
      const reqId = this.generateReqId()
      const response = await this.runtime.fetch(
        `https://card.weibo.com/article/v5/aj/editor/plugins/asyncimginfo?uid=${config!.uid}&_rid=${reqId}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'accept': 'application/json, text/plain, */*',
            'SN-REQID': reqId,
          },
          body: new URLSearchParams({ 'urls[0]': src }),
        }
      )

      const res = await response.json() as {
        data?: Array<{ pid: string; url: string; task_status_code: number }>
      }

      if (res.data?.[0]?.task_status_code === 1) {
        logger.debug('Image upload complete:', res.data[0])
        return res.data[0]
      }

      // 等待 1 秒后重试
      await this.delay(1000)
    }

    throw new Error('图片上传超时')
  }
}
