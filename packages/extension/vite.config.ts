import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import yaml from '@modyfi/vite-plugin-yaml'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import manifest from './manifest.json'

// 复制静态文件的插件
function copyRulesPlugin() {
  return {
    name: 'copy-rules',
    writeBundle() {
      const rulesDir = resolve(__dirname, 'rules')
      const distRulesDir = resolve(__dirname, 'dist/rules')

      if (existsSync(rulesDir)) {
        if (!existsSync(distRulesDir)) {
          mkdirSync(distRulesDir, { recursive: true })
        }

        const files = readdirSync(rulesDir)
        for (const file of files) {
          copyFileSync(
            resolve(rulesDir, file),
            resolve(distRulesDir, file)
          )
          console.log(`[copy-rules] Copied ${file} to dist/rules/`)
        }
      }
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    yaml(),
    crx({ manifest }),
    copyRulesPlugin(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        editor: resolve(__dirname, 'src/editor/index.html'),
      },
    },
  },
})
