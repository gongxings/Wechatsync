import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Globe } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useCMSStore, type CMSType } from '../stores/cms'
import { trackPageView, trackPlatformExpansion } from '../../lib/analytics'

interface CMSOption {
  id: CMSType
  name: string
  description: string
  icon: string
}

const cmsOptions: CMSOption[] = [
  {
    id: 'wordpress',
    name: 'WordPress',
    description: '支持 XML-RPC 或 REST API',
    icon: 'https://s.w.org/style/images/about/WordPress-logotype-simplified.png',
  },
  {
    id: 'typecho',
    name: 'Typecho',
    description: '支持 XML-RPC 接口',
    icon: 'https://typecho.org/favicon.ico',
  },
  {
    id: 'metaweblog',
    name: 'MetaWeblog API',
    description: '通用博客接口协议',
    icon: '/assets/icon-48.png',
  },
]

export function AddCMSPage() {
  const navigate = useNavigate()
  const { addAccount } = useCMSStore()
  const [step, setStep] = useState<'select' | 'config'>('select')
  const [selectedCMS, setSelectedCMS] = useState<CMSType | null>(null)
  const [config, setConfig] = useState({
    url: '',
    username: '',
    password: '',
    name: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 追踪页面访问
  useEffect(() => {
    trackPageView('add_cms').catch(() => {})
  }, [])

  const handleSelectCMS = (cmsId: CMSType) => {
    setSelectedCMS(cmsId)
    setStep('config')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await addAccount({
        type: selectedCMS!,
        name: config.name,
        url: config.url,
        username: config.username,
        password: config.password,
      })

      if (result.success) {
        // 追踪平台扩展（获取当前 CMS 账户数量）
        chrome.storage.local.get('cmsAccounts').then((storage) => {
          const total = (storage.cmsAccounts || []).length
          trackPlatformExpansion(`cms_${selectedCMS}`, total).catch(() => {})
        })
        navigate('/')
      } else {
        setError(result.error || '添加失败')
      }
    } catch (err) {
      setError((err as Error).message)
    }

    setLoading(false)
  }

  return (
    <div className="p-4">
      {/* 返回按钮 */}
      <button
        onClick={() => (step === 'config' ? setStep('select') : navigate('/'))}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        返回
      </button>

      {step === 'select' && (
        <>
          <h2 className="text-lg font-semibold mb-1">选择站点类型</h2>
          <p className="text-xs text-muted-foreground mb-4">
            选择你的博客系统类型
          </p>

          <div className="space-y-2">
            {cmsOptions.map(cms => (
              <button
                key={cms.id}
                onClick={() => handleSelectCMS(cms.id)}
                className="w-full flex items-center gap-3 p-4 rounded-lg border hover:border-primary transition-colors text-left"
              >
                <img
                  src={cms.icon}
                  alt={cms.name}
                  className="w-10 h-10 rounded"
                  onError={e => {
                    (e.target as HTMLImageElement).src = '/assets/icon-48.png'
                  }}
                />
                <div className="flex-1">
                  <div className="font-medium">{cms.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {cms.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'config' && selectedCMS && (
        <>
          <h2 className="text-lg font-semibold mb-1">
            配置 {cmsOptions.find(c => c.id === selectedCMS)?.name}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            输入站点信息以连接
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">站点名称</label>
              <input
                type="text"
                value={config.name}
                onChange={e => setConfig({ ...config, name: e.target.value })}
                placeholder="我的博客"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">站点地址</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="url"
                  value={config.url}
                  onChange={e => setConfig({ ...config, url: e.target.value })}
                  placeholder="https://example.com"
                  className="w-full pl-9 pr-3 py-2 rounded-md border bg-background text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">用户名</label>
              <input
                type="text"
                value={config.username}
                onChange={e => setConfig({ ...config, username: e.target.value })}
                placeholder="admin"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">密码</label>
              <input
                type="password"
                value={config.password}
                onChange={e => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                密码仅存储在本地，不会上传到任何服务器
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '连接中...' : '添加站点'}
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
