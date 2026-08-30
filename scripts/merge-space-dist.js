import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const source = path.join(rootDir, 'apps', 'space', 'dist')
const spaceRoot = path.join(rootDir, 'dist', 'space')
const destination = path.join(spaceRoot, 'app')
const siteIndex = path.join(rootDir, 'dist', 'index.html')
const spaceIndex = path.join(spaceRoot, 'index.html')

if (!fs.existsSync(source)) {
  throw new Error(`Space build output is missing: ${source}`)
}

fs.rmSync(spaceRoot, { recursive: true, force: true })
fs.cpSync(source, destination, { recursive: true })
fs.copyFileSync(siteIndex, spaceIndex)
console.log(`Merged Space into frontend artifact: ${destination}`)
