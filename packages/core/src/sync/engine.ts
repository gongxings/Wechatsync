import type { Article, SyncResult } from '../types'
import type { RuntimeInterface } from '../runtime/interface'
import { adapterRegistry } from '../adapters/registry'

/**
 * 同步任务
 */
export interface SyncTask {
  id: string
  article: Article
  platforms: string[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  results: SyncResult[]
  createdAt: number
  completedAt?: number
}

/**
 * 同步选项
 */
export interface SyncOptions {
  /** 并行同步的平台数量 */
  concurrency?: number
  /** 失败时是否继续其他平台 */
  continueOnError?: boolean
  /** 进度回调 */
  onProgress?: (platform: string, result: SyncResult) => void
}

/**
 * 同步引擎
 * 管理文章到多平台的同步任务
 */
export class SyncEngine {
  private tasks: Map<string, SyncTask> = new Map()

  constructor(runtime: RuntimeInterface) {
    adapterRegistry.setRuntime(runtime)
  }

  /**
   * 同步文章到多个平台
   */
  async sync(
    article: Article,
    platforms: string[],
    options: SyncOptions = {}
  ): Promise<SyncTask> {
    const {
      concurrency = 3,
      continueOnError = true,
      onProgress,
    } = options

    const task: SyncTask = {
      id: this.generateId(),
      article,
      platforms,
      status: 'running',
      results: [],
      createdAt: Date.now(),
    }

    this.tasks.set(task.id, task)

    try {
      // 分批并行执行
      const batches = this.chunk(platforms, concurrency)

      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map(async platform => {
            const result = await this.syncToPlatform(article, platform)
            onProgress?.(platform, result)
            return result
          })
        )

        task.results.push(...batchResults)

        // 检查是否需要停止
        if (!continueOnError && batchResults.some(r => !r.success)) {
          break
        }
      }

      task.status = task.results.every(r => r.success) ? 'completed' : 'failed'
    } catch (error) {
      task.status = 'failed'
    }

    task.completedAt = Date.now()
    return task
  }

  /**
   * 同步到单个平台
   */
  async syncToPlatform(article: Article, platformId: string): Promise<SyncResult> {
    try {
      const adapter = await adapterRegistry.get(platformId)

      if (!adapter) {
        return {
          platform: platformId,
          success: false,
          error: `Platform "${platformId}" not found`,
          timestamp: Date.now(),
        }
      }

      // 检查认证
      const auth = await adapter.checkAuth()
      if (!auth.isAuthenticated) {
        return {
          platform: platformId,
          success: false,
          error: `Not authenticated: ${auth.error || 'Please login first'}`,
          timestamp: Date.now(),
        }
      }

      // 发布文章
      return await adapter.publish(article)
    } catch (error) {
      return {
        platform: platformId,
        success: false,
        error: (error as Error).message,
        timestamp: Date.now(),
      }
    }
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): SyncTask | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): SyncTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * 清理已完成的任务
   */
  clearCompleted(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(id)
      }
    }
  }

  /**
   * 生成任务 ID
   */
  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }

  /**
   * 数组分块
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
