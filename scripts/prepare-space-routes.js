import { mkdirSync, copyFileSync } from 'node:fs'
for (const route of ['space', 'space/app', 'space/intro', 'space/apikeys', 'space/login']) {
  mkdirSync(`dist/${route}`, { recursive: true })
  copyFileSync('dist/index.html', `dist/${route}/index.html`)
}
