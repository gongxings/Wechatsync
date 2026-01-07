import { adapterRegistry } from './registry'
import { createAdapterFromDSL } from './dsl-parser'
import type { AdapterDSL } from './types'

/**
 * 从 DSL 对象加载适配器
 */
export function loadAdapter(dsl: AdapterDSL, customLogic?: Record<string, Function>): void {
  const entry = createAdapterFromDSL(dsl, customLogic)
  adapterRegistry.register(entry)
}

/**
 * 批量加载适配器
 */
export function loadAdapters(adapters: Array<{ dsl: AdapterDSL; customLogic?: Record<string, Function> }>): void {
  for (const { dsl, customLogic } of adapters) {
    try {
      loadAdapter(dsl, customLogic)
    } catch (error) {
      console.error(`Failed to load adapter ${dsl.name}:`, error)
    }
  }
}

/**
 * 获取已加载的平台 ID 列表
 */
export function getLoadedPlatformIds(): string[] {
  return adapterRegistry.getRegisteredIds()
}
