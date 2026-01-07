/**
 * HTML 处理工具库
 *
 * 提供各平台通用的 HTML 内容预处理功能
 * 参考旧版 @wechatsync/drivers 的处理逻辑
 */

import { normalizeHtml } from './turndown'

export interface HtmlProcessOptions {
  /** 移除 <a> 标签，保留内部文本 */
  removeLinks?: boolean
  /** 移除 <iframe> 标签 */
  removeIframes?: boolean
  /** 移除空段落（仅含 <br> 或空白的 <p>/<section>） */
  removeEmptyLines?: boolean
  /** 移除空 <div>（无文本且无图片） */
  removeEmptyDivs?: boolean
  /** 移除段落尾部的 <br> 标签 */
  removeTrailingBr?: boolean
  /** 将 <section> 转换为 <p> */
  convertSectionToP?: boolean
  /** 将 <section> 转换为 <div> (知乎等平台需要) */
  convertSectionToDiv?: boolean
  /** 格式化代码块 */
  processCodeBlocks?: boolean
  /** 移除 <qqmusic>/<mpprofile> 等微信特殊标签 */
  removeSpecialTags?: boolean
  /** 移除 SVG 图片 */
  removeSvgImages?: boolean
  /** 自动检测加粗大字体转换为 h2 */
  convertStrongToH2?: boolean
  /** 移除所有 style 属性 */
  removeStyles?: boolean
  /** 移除所有 data-* 属性 */
  removeDataAttributes?: boolean
  /** 移除所有 class 属性 */
  removeClasses?: boolean
  /** 处理懒加载图片 (data-src → src) */
  processLazyImages?: boolean
  /** 移除 HTML 注释 */
  removeComments?: boolean
  /** 移除嵌套空容器 (多层空 div 等) */
  removeNestedEmptyContainers?: boolean
  /** 压缩多余空白行 */
  collapseWhitespace?: boolean
  /** 解包单一子元素容器 (移除多层无意义包装 div) */
  unwrapSingleChildContainers?: boolean
  /** 解包嵌套 figure 标签 */
  unwrapNestedFigures?: boolean
  /** 移除 srcset 属性 (部分平台不支持) */
  removeSrcset?: boolean
  /** 移除 sizes 属性 */
  removeSizes?: boolean
  /** 压缩所有标签间空白 (用于 Draft.js 编辑器) */
  compactHtml?: boolean
  /** 通过 HTML→Markdown→HTML 往返转换来标准化内容 (最彻底的清理) */
  normalizeViaMarkdown?: boolean
}

/**
 * 处理 HTML 内容
 * @param html 原始 HTML
 * @param options 处理选项
 * @returns 处理后的 HTML
 */
export function processHtml(html: string, options: HtmlProcessOptions = {}): string {
  // 保存原始内容，处理失败时可回退
  const originalHtml = html
  let result = html

  try {

  // 按顺序执行各项处理（使用正则，兼容 Service Worker 环境）

  if (options.removeSpecialTags) {
    result = removeSpecialTags(result)
  }

  if (options.removeIframes) {
    result = removeIframes(result)
  }

  if (options.removeSvgImages) {
    result = removeSvgImages(result)
  }

  if (options.removeLinks) {
    result = removeLinks(result)
  }

  if (options.processCodeBlocks) {
    result = processCodeBlocks(result)
  }

  if (options.convertSectionToP) {
    result = convertSectionToP(result)
  }

  if (options.convertSectionToDiv) {
    result = convertSectionToDiv(result)
  }

  if (options.removeEmptyLines) {
    result = removeEmptyLines(result)
  }

  if (options.removeEmptyDivs) {
    result = removeEmptyDivs(result)
  }

  if (options.removeTrailingBr) {
    result = removeTrailingBr(result)
  }

  if (options.convertStrongToH2) {
    result = convertStrongToH2(result)
  }

  if (options.removeStyles) {
    result = removeAttribute(result, 'style')
  }

  if (options.removeDataAttributes) {
    result = removeDataAttributes(result)
  }

  if (options.removeClasses) {
    result = removeAttribute(result, 'class')
  }

  if (options.processLazyImages) {
    result = processLazyImages(result)
  }

  if (options.removeComments) {
    result = removeComments(result)
  }

  if (options.removeNestedEmptyContainers) {
    result = removeNestedEmptyContainers(result)
  }

  if (options.collapseWhitespace) {
    result = collapseWhitespace(result)
  }

  if (options.unwrapSingleChildContainers) {
    result = unwrapSingleChildContainers(result)
  }

  if (options.unwrapNestedFigures) {
    result = unwrapNestedFigures(result)
  }

  if (options.removeSrcset) {
    result = removeAttribute(result, 'srcset')
  }

  if (options.removeSizes) {
    result = removeAttribute(result, 'sizes')
  }

  if (options.compactHtml) {
    result = compactHtml(result)
  }

  // 最彻底的清理方式：HTML → Markdown → HTML
  if (options.normalizeViaMarkdown) {
    result = normalizeHtml(result)
  }

  return result

  } catch (error) {
    console.error('[HtmlProcessor] Error:', error)
    return originalHtml
  }
}

/**
 * 移除 <a> 标签，保留内部文本
 */
function removeLinks(html: string): string {
  // 匹配 <a ...>...</a>，保留内部内容
  return html.replace(/<a\s[^>]*>([\s\S]*?)<\/a>/gi, '<span>$1</span>')
}

/**
 * 移除 <iframe> 标签
 */
function removeIframes(html: string): string {
  return html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe[^>]*\/?>/gi, '')
}

/**
 * 移除空段落
 */
function removeEmptyLines(html: string): string {
  // 移除只含 <br> 的段落
  let result = html.replace(/<(p|section)[^>]*>\s*(<br\s*\/?>\s*)*<\/\1>/gi, '')
  // 移除完全空的段落
  result = result.replace(/<(p|section)[^>]*>\s*<\/\1>/gi, '')
  return result
}

/**
 * 移除段落尾部的 <br> 标签
 */
function removeTrailingBr(html: string): string {
  // 移除 </p>, </section>, </div> 前面的 <br>
  return html.replace(/(<br\s*\/?>\s*)+(<\/(p|section|div)>)/gi, '$2')
}

/**
 * 将 <section> 转换为 <p>
 */
function convertSectionToP(html: string): string {
  return html
    .replace(/<section(\s[^>]*)?>/gi, '<p$1>')
    .replace(/<\/section>/gi, '</p>')
}

/**
 * 将 <section> 转换为 <div> (知乎等平台需要)
 */
function convertSectionToDiv(html: string): string {
  return html
    .replace(/<section(\s[^>]*)?>/gi, '<div$1>')
    .replace(/<\/section>/gi, '</div>')
}

/**
 * 移除空 <div>（无文本且无图片）
 */
function removeEmptyDivs(html: string): string {
  // 移除只含 <br> 或空白的 div（但保留含 img 的）
  return html.replace(/<div[^>]*>(\s|<br\s*\/?>)*<\/div>/gi, '')
}

/**
 * 格式化代码块
 */
function processCodeBlocks(html: string): string {
  // 处理 pre 中多个 code 标签的情况
  return html.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (match, content) => {
    // 提取所有 code 内容
    const codeMatches = content.match(/<code[^>]*>([\s\S]*?)<\/code>/gi)
    if (codeMatches && codeMatches.length > 1) {
      // 多个 code，合并
      const lines = codeMatches.map((c: string) => {
        const text = c.replace(/<\/?code[^>]*>/gi, '')
        return escapeHtml(text)
      })
      return `<pre><code>${lines.join('\n')}</code></pre>`
    }
    return match
  })
}

/**
 * 移除微信特殊标签
 */
function removeSpecialTags(html: string): string {
  // 微信公众号特有的标签
  const specialTags = ['qqmusic', 'mpvoice', 'mpvideo', 'mpprofile']
  let result = html
  specialTags.forEach(tag => {
    // 移除开闭标签
    result = result.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'), '')
    // 移除自闭合标签
    result = result.replace(new RegExp(`<${tag}[^>]*\\/?>`, 'gi'), '')
  })
  return result
}

/**
 * 移除 SVG 图片
 */
function removeSvgImages(html: string): string {
  // 移除 src 包含 .svg 或 data:image/svg 的 img 标签
  return html.replace(/<img[^>]*src=["'][^"']*\.svg[^"']*["'][^>]*\/?>/gi, '')
    .replace(/<img[^>]*src=["']data:image\/svg[^"']*["'][^>]*\/?>/gi, '')
}

/**
 * 处理懒加载图片
 * 将 data-src, data-original 等属性的值设置到 src
 */
function processLazyImages(html: string): string {
  // 匹配 img 标签，查找懒加载属性
  return html.replace(/<img([^>]*)>/gi, (_match, attrs) => {
    // 检查是否有懒加载属性
    const lazySrcAttrs = ['data-src', 'data-original', 'data-actualsrc', '_src']
    for (const attr of lazySrcAttrs) {
      const regex = new RegExp(`${attr}=["']([^"']+)["']`, 'i')
      const lazyMatch = attrs.match(regex)
      if (lazyMatch) {
        const lazySrc = lazyMatch[1]
        // 如果已有 src 且不是占位符，跳过
        const srcMatch = attrs.match(/\ssrc=["']([^"']+)["']/i)
        if (srcMatch && !srcMatch[1].startsWith('data:image/svg')) {
          continue
        }
        // 替换或添加 src
        if (srcMatch) {
          attrs = attrs.replace(/\ssrc=["'][^"']*["']/i, ` src="${lazySrc}"`)
        } else {
          attrs = ` src="${lazySrc}"` + attrs
        }
        break
      }
    }
    return `<img${attrs}>`
  })
}

/**
 * 移除 HTML 注释
 */
function removeComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * 移除嵌套空容器
 * 递归移除只包含空白或其他空容器的 div/section/article
 */
function removeNestedEmptyContainers(html: string): string {
  let result = html
  let previousLength = 0

  // 多次迭代，处理嵌套情况
  while (result.length !== previousLength) {
    previousLength = result.length

    // 移除只包含空白的容器
    result = result.replace(/<(div|section|article|span)[^>]*>\s*<\/\1>/gi, '')

    // 移除只包含 <br> 的容器
    result = result.replace(/<(div|section|article)[^>]*>(\s*<br\s*\/?>\s*)*<\/\1>/gi, '')

    // 移除只包含其他空容器的容器 (递归效果)
    result = result.replace(/<(div|section)[^>]*>\s*(<(div|section)[^>]*>\s*<\/\3>\s*)+<\/\1>/gi, '')
  }

  return result
}

/**
 * 压缩多余空白行
 */
function collapseWhitespace(html: string): string {
  // 将多个连续换行压缩为两个
  let result = html.replace(/\n{3,}/g, '\n\n')
  // 移除标签之间的多余空白
  result = result.replace(/>\s{2,}</g, '>\n<')
  return result
}

/**
 * 压缩所有标签间空白 (适用于 Draft.js 编辑器)
 * Draft.js 会将标签间的空白解析为额外的块
 */
function compactHtml(html: string): string {
  // 移除所有标签间的空白符（换行、空格、制表符）
  let result = html.replace(/>\s+</g, '><')
  // 移除开头和结尾的空白
  result = result.trim()
  return result
}

/**
 * 解包嵌套的 figure 标签
 * <figure><figure><img></figure></figure> → <figure><img></figure>
 */
function unwrapNestedFigures(html: string): string {
  let result = html
  let previousLength = 0

  // 多次迭代处理多层嵌套
  while (result.length !== previousLength) {
    previousLength = result.length
    result = result.replace(
      /<figure[^>]*>\s*(<figure[^>]*>[\s\S]*?<\/figure>)\s*<\/figure>/gi,
      '$1'
    )
  }

  return result
}

/**
 * 解包单一子元素容器
 * 移除只包含单个子元素的无意义包装 div
 * 例如: <div><div><p>text</p></div></div> → <p>text</p>
 */
function unwrapSingleChildContainers(html: string): string {
  let result = html
  let previousLength = 0

  // 多次迭代处理嵌套
  while (result.length !== previousLength) {
    previousLength = result.length

    // 移除只包含单个 div 子元素的 div (保留子元素)
    // <div>\s*<div>...</div>\s*</div> → <div>...</div>
    result = result.replace(
      /<div[^>]*>\s*(<div[^>]*>[\s\S]*?<\/div>)\s*<\/div>/gi,
      '$1'
    )

    // 移除只包含单个 article 的容器
    result = result.replace(
      /<div[^>]*>\s*(<article[^>]*>[\s\S]*?<\/article>)\s*<\/div>/gi,
      '$1'
    )

    // 移除只包含 p 的空 div 包装
    result = result.replace(
      /<div[^>]*>\s*(<p[^>]*>[\s\S]*?<\/p>)\s*<\/div>/gi,
      '$1'
    )
  }

  return result
}

/**
 * 将加粗大字体文本转换为 h2
 */
function convertStrongToH2(html: string): string {
  // 匹配 <p> 或 <section> 中只包含 <strong> 的情况
  return html.replace(
    /<(p|section)[^>]*>([\s\S]*?)<\/\1>/gi,
    (match, _tag, content) => {
      const trimmedContent = content.trim()
      // 检查是否整个内容都被 strong 包裹
      const strongMatch = trimmedContent.match(/^<strong[^>]*>([\s\S]*?)<\/strong>$/i)
      if (strongMatch) {
        const text = strongMatch[1].replace(/<[^>]+>/g, '').trim()
        if (text.length > 0 && text.length < 50) {
          // 短文本且全部加粗，转换为 h2
          return `<h2>${text}</h2>`
        }
      }
      return match
    }
  )
}

/**
 * 移除指定属性
 */
function removeAttribute(html: string, attrName: string): string {
  const regex = new RegExp(`\\s*${attrName}=["'][^"']*["']`, 'gi')
  return html.replace(regex, '')
}

/**
 * 移除所有 data-* 属性
 */
function removeDataAttributes(html: string): string {
  return html.replace(/\s*data-[\w-]+=["'][^"']*["']/gi, '')
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ============ 预设配置 ============

/** 头条/B站 预设 */
export const toutiaoPreset: HtmlProcessOptions = {
  removeLinks: true,
  removeIframes: true,
  removeSvgImages: true,
  removeSpecialTags: true,
}

/** 简书 预设 */
export const jianshuPreset: HtmlProcessOptions = {
  removeEmptyLines: true,
  removeTrailingBr: true,
  convertStrongToH2: true,
}

/** 大鱼号 预设 */
export const dayuPreset: HtmlProcessOptions = {
  removeEmptyLines: true,
  convertSectionToP: true,
  processCodeBlocks: true,
}

/** 百家号 预设 */
export const baijiahaoPreset: HtmlProcessOptions = {
  processCodeBlocks: true,
}

/** 知乎 预设 */
export const zhihuPreset: HtmlProcessOptions = {
  removeComments: true,
  removeSpecialTags: true,
  processCodeBlocks: true,
  convertSectionToDiv: true,
  removeEmptyLines: true,
  removeEmptyDivs: true,
  removeNestedEmptyContainers: true,
  removeTrailingBr: true,
  removeDataAttributes: true,
  collapseWhitespace: true,
}

/** 通用清理预设 */
export const cleanPreset: HtmlProcessOptions = {
  removeDataAttributes: true,
  removeStyles: true,
  removeClasses: true,
}
