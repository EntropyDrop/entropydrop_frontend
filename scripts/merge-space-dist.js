import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const source = path.join(rootDir, 'apps', 'space', 'dist')
const destination = path.join(rootDir, 'dist', 'space')

if (!fs.existsSync(source)) {
  throw new Error(`Space build output is missing: ${source}`)
}

fs.rmSync(destination, { recursive: true, force: true })
fs.cpSync(source, destination, { recursive: true })
console.log(`Merged Space into frontend artifact: ${destination}`)
