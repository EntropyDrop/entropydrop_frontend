const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
const { test } = require('node:test')

const websiteId = '594e41e5-94b8-4da6-9499-5d5aa1184f89'
const productionApi = 'https://api.entropydrop.com'
const productionTracker = 'https://analytics.entropydrop.com/script.js'

function resolveViteConfig(command, { apiUrl = 'http://localhost:8000', id = websiteId, tracker } = {}) {
  const mode = command === 'build' ? 'production' : 'development'
  const program = `
    import { resolveConfig } from 'vite'
    const [command, mode] = process.argv.slice(1)
    await resolveConfig({}, command, mode)
  `
  return spawnSync(process.execPath, ['--input-type=module', '-e', program, command, mode], {
    cwd: resolve(__dirname, '..'),
    env: {
      ...process.env,
      VITE_API_BASE_URL: apiUrl,
      VITE_UMAMI_WEBSITE_ID: id,
      VITE_UMAMI_SCRIPT_URL: tracker ?? '',
    },
    encoding: 'utf8',
  })
}

test('Vite rejects baked-in local trackers and keeps local analytics available in dev', () => {
  const tracker = 'http://localhost:3000/script.js'
  const build = resolveViteConfig('build', { tracker })
  assert.equal(build.status, 1)
  assert.match(build.stderr, /must be a non-loopback HTTPS URL/)

  const httpsLoopback = resolveViteConfig('build', { tracker: 'https://127.0.0.1/script.js' })
  assert.equal(httpsLoopback.status, 1)
  assert.match(httpsLoopback.stderr, /must be a non-loopback HTTPS URL/)

  const dev = resolveViteConfig('serve', { tracker })
  assert.equal(dev.status, 0, dev.stderr)
})

test('the main-site build requires production analytics configuration', () => {
  const options = { apiUrl: productionApi, tracker: productionTracker }
  const missingId = resolveViteConfig('build', { ...options, id: '' })
  assert.equal(missingId.status, 1)
  assert.match(missingId.stderr, /Use tools\/deploy_aws\.py/)

  const wrongOrigin = resolveViteConfig('build', { ...options, tracker: 'https://cloud.umami.is/script.js' })
  assert.equal(wrongOrigin.status, 1)
  assert.match(wrongOrigin.stderr, /Use tools\/deploy_aws\.py/)

  const release = resolveViteConfig('build', options)
  assert.equal(release.status, 0, release.stderr)
})
