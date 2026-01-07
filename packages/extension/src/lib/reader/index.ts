/**
 * 文章提取器
 * 使用 Safari ReaderArticleFinder 和 Mozilla Readability
 *
 * 策略: Safari ReaderArticleFinder 优先，Readability 作为回退
 *
 * 注意: reader.js 和 Readability.js 通过 manifest.json 作为 content_scripts 预先加载
 * 它们会在全局作用域注入 ReaderArticleFinder 和 Readability 类
 */
import { createLogger } from '../logger'

const logger = createLogger('Reader')

/**
 * 提取结果接口
 */
export interface ReaderResult {
  /** 文章标题 */
  title: string
  /** 文章 HTML 内容 */
  content: string
  /** 纯文本内容 */
  textContent?: string
  /** 文章摘要/描述 */
  excerpt?: string
  /** 封面图 */
  leadingImage?: string
  /** 主图 */
  mainImage?: string
  /** 作者 */
  byline?: string
  /** 站点名称 */
  siteName?: string
  /** 文章方向 (ltr/rtl) */
  dir?: string
  /** 是否从左到右 */
  isLTR?: boolean
  /** 下一页 URL */
  nextPage?: string
  /** 页码 */
  pageNumber?: number
  /** 使用的提取器 */
  extractor: 'safari-reader' | 'readability' | 'article-tag'
}

/**
 * Safari ReaderArticleFinder 全局类型
 */
declare global {
  class ReaderArticleFinder {
    constructor(doc: Document)
    isReaderModeAvailable(): boolean | null
    adoptableArticle(force?: boolean): HTMLElement | null
    articleTitle(): string | undefined
    articleTextContent(): string | undefined
    pageDescription(): string | undefined
    mainImageNode(): HTMLImageElement | null
    leadingImage: HTMLImageElement | null
    pageNumber: number
    nextPageURL(): string | null
    articleIsLTR(): boolean
  }

  class Readability {
    constructor(doc: Document, options?: object)
    parse(): {
      title: string
      content: string
      textContent: string
      excerpt: string
      byline: string | null
      siteName: string | null
      dir: string | null
    } | null
  }
}

/**
 * 获取图片 URL
 */
function getImageUrl(node: HTMLImageElement | null): string | undefined {
  if (!node) return undefined

  const src = node.getAttribute('data-src') || node.src
  if (src && src.startsWith('data:image')) return undefined

  return src || undefined
}

/**
 * 处理懒加载图片
 */
function processLazyImages(container: HTMLElement): void {
  const images = container.querySelectorAll('img')

  images.forEach((img) => {
    // 按优先级查找真实图片 URL
    const realSrc =
      img.getAttribute('data-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('data-actualsrc') ||
      img.getAttribute('_src') ||
      img.src

    // 跳过 data URL (SVG 占位符等)
    if (realSrc && !realSrc.startsWith('data:image/svg')) {
      img.setAttribute('src', realSrc)
    }

    // 清理懒加载属性
    img.removeAttribute('data-src')
    img.removeAttribute('data-original')
    img.removeAttribute('data-actualsrc')
    img.removeAttribute('_src')
    img.removeAttribute('data-ratio')
    img.removeAttribute('data-w')
    img.removeAttribute('data-type')
    img.removeAttribute('data-s')
  })
}

/**
 * 补全相对链接
 */
function processLinks(container: HTMLElement): void {
  container.querySelectorAll('a').forEach((a) => {
    a.setAttribute('href', a.href)
    if (a.target === '' || a.target.toLowerCase() === '_self') {
      a.setAttribute('target', '_top')
    }
  })

  container.querySelectorAll('img').forEach((img) => {
    img.setAttribute('src', img.src)
  })
}

/**
 * 使用 Safari ReaderArticleFinder 提取
 */
function extractWithSafariReader(): ReaderResult | null {
  try {
    const reader = new ReaderArticleFinder(document)

    if (!reader.isReaderModeAvailable()) {
      return null
    }

    const articleNode = reader.adoptableArticle(true)
    if (!articleNode) {
      return null
    }

    // 克隆并处理
    const cloned = articleNode.cloneNode(true) as HTMLElement
    processLazyImages(cloned)
    processLinks(cloned)

    return {
      title: reader.articleTitle() || document.title,
      content: cloned.outerHTML,
      textContent: reader.articleTextContent(),
      excerpt: reader.pageDescription(),
      leadingImage: getImageUrl(reader.leadingImage),
      mainImage: getImageUrl(reader.mainImageNode()),
      isLTR: reader.articleIsLTR(),
      nextPage: reader.nextPageURL() || undefined,
      pageNumber: reader.pageNumber,
      extractor: 'safari-reader',
    }
  } catch (e) {
    logger.error('Safari ReaderArticleFinder error:', e)
    return null
  }
}

/**
 * 使用 Mozilla Readability 提取
 */
function extractWithReadability(): ReaderResult | null {
  try {
    // Readability 需要克隆的 document
    const docClone = document.cloneNode(true) as Document
    const reader = new Readability(docClone)
    const article = reader.parse()

    if (!article) {
      return null
    }

    // 处理内容中的图片
    const container = document.createElement('div')
    container.innerHTML = article.content
    processLazyImages(container)
    processLinks(container)

    // 获取首图
    const firstImg = container.querySelector('img')
    const leadingImage = firstImg?.src || undefined

    return {
      title: article.title || document.title,
      content: container.innerHTML,
      textContent: article.textContent,
      excerpt: article.excerpt,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
      dir: article.dir || undefined,
      leadingImage,
      mainImage: leadingImage,
      extractor: 'readability',
    }
  } catch (e) {
    logger.error('Readability error:', e)
    return null
  }
}

/**
 * 使用 <article> 标签提取
 */
function extractWithArticleTag(): ReaderResult | null {
  const articleEl = document.querySelector('article')
  if (!articleEl) {
    return null
  }

  const cloned = articleEl.cloneNode(true) as HTMLElement
  processLazyImages(cloned)
  processLinks(cloned)

  const firstImg = cloned.querySelector('img')
  const leadingImage = firstImg?.src || undefined

  const description = document.querySelector('meta[name="description"]')?.getAttribute('content')

  return {
    title: document.title,
    content: cloned.outerHTML,
    textContent: cloned.textContent || undefined,
    excerpt: description || undefined,
    leadingImage,
    mainImage: leadingImage,
    extractor: 'article-tag',
  }
}

/**
 * 提取文章
 * 按优先级尝试: Safari Reader -> Readability -> <article> 标签
 */
export function extractArticle(): ReaderResult | null {
  // 1. 尝试 Safari ReaderArticleFinder (最佳效果)
  const safariResult = extractWithSafariReader()
  if (safariResult) {
    logger.debug('Extracted with Safari ReaderArticleFinder')
    return safariResult
  }

  // 2. 尝试 Mozilla Readability
  const readabilityResult = extractWithReadability()
  if (readabilityResult) {
    logger.debug('Extracted with Readability')
    return readabilityResult
  }

  // 3. 尝试 <article> 标签
  const articleTagResult = extractWithArticleTag()
  if (articleTagResult) {
    logger.debug('Extracted with <article> tag')
    return articleTagResult
  }

  logger.debug('No article found')
  return null
}

/**
 * 检查是否有可提取的文章
 */
export function isArticleAvailable(): boolean {
  try {
    // 快速检查 Safari Reader
    const reader = new ReaderArticleFinder(document)
    if (reader.isReaderModeAvailable()) {
      return true
    }
  } catch (e) {
    // 忽略
  }

  try {
    // 检查 Readability
    const docClone = document.cloneNode(true) as Document
    const reader = new Readability(docClone)
    if (reader.parse()) {
      return true
    }
  } catch (e) {
    // 忽略
  }

  // 检查 <article> 标签
  return !!document.querySelector('article')
}
