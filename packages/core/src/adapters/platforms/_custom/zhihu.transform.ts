/**
 * 知乎内容转换
 * 处理知乎特有的内容格式要求
 */

interface TransformContext {
  article: {
    title: string
    content: string
  }
}

/**
 * 转换文章内容以适配知乎格式
 */
export function transformContent(content: string, _ctx: TransformContext): string {
  let result = content

  // 1. 图片格式：知乎要求 figure 包裹
  result = result.replace(
    /<img([^>]+)src="([^"]+)"([^>]*)>/gi,
    '<figure><img$1src="$2"$3></figure>'
  )

  // 2. 代码块格式
  result = result.replace(
    /<pre><code class="language-(\w+)">/gi,
    '<pre lang="$1"><code>'
  )

  // 3. 移除微信特有的样式属性
  result = result.replace(/\s*data-[\w-]+="[^"]*"/gi, '')
  result = result.replace(/\s*style="[^"]*"/gi, '')

  // 4. 处理链接：知乎会过滤外链
  result = result.replace(
    /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi,
    (match, href, text) => {
      // 保留链接文本，附加原链接
      if (href.startsWith('http') && !href.includes('zhihu.com')) {
        return `${text} (${href})`
      }
      return match
    }
  )

  return result
}
