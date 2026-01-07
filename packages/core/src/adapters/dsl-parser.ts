import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import type { AdapterDSL, AdapterRegistryEntry } from './types'
import { DSLAdapter } from './base'

/**
 * DSL Schema 验证
 */
const EndpointSchema = z.object({
  request: z.object({
    url: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    headers: z.record(z.string()).optional(),
    content_type: z.enum(['json', 'form', 'multipart']).optional(),
    body: z.record(z.unknown()).optional(),
  }),
  response: z.object({
    success: z.string().optional(),
    extract: z.record(z.string()).optional(),
    error: z.string().optional(),
  }),
})

const AdapterDSLSchema = z.object({
  name: z.string(),
  display_name: z.string(),
  icon: z.string(),
  homepage: z.string().url(),
  capabilities: z.array(
    z.enum([
      'article',
      'draft',
      'image_upload',
      'categories',
      'tags',
      'cover',
      'schedule',
    ])
  ),
  auth: z.object({
    check: EndpointSchema,
  }),
  endpoints: z.record(EndpointSchema.optional()),
  header_rules: z
    .array(
      z.object({
        url_filter: z.string(),
        headers: z.record(z.string()),
        resource_types: z.array(z.string()).optional(),
      })
    )
    .optional(),
  custom_logic: z.record(z.string()).optional(),
})

/**
 * 解析 DSL YAML 文件内容
 */
export function parseDSL(yamlContent: string): AdapterDSL {
  const parsed = parseYaml(yamlContent)
  const validated = AdapterDSLSchema.parse(parsed)
  return validated as AdapterDSL
}

/**
 * 从 DSL 创建适配器注册项
 */
export function createAdapterFromDSL(
  dsl: AdapterDSL,
  customLogic?: Record<string, Function>
): AdapterRegistryEntry {
  return {
    meta: {
      id: dsl.name,
      name: dsl.display_name,
      icon: dsl.icon,
      homepage: dsl.homepage,
      capabilities: dsl.capabilities,
    },
    factory: () => new DSLAdapter(dsl, customLogic),
  }
}

/**
 * 批量解析 DSL 文件
 */
export function parseDSLFiles(
  files: Array<{ path: string; content: string }>
): AdapterRegistryEntry[] {
  return files.map(file => {
    try {
      const dsl = parseDSL(file.content)
      return createAdapterFromDSL(dsl)
    } catch (error) {
      console.error(`Failed to parse DSL file: ${file.path}`, error)
      throw error
    }
  })
}
