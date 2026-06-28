const path = require('path')
const { spawnSync } = require('child_process')

const script = process.argv[2]

if (!script) {
  console.error('Usage: node scripts/run-electron-node.cjs <script> [...args]')
  process.exit(1)
}

const electronBin = process.platform === 'win32'
  ? path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(__dirname, '..', 'node_modules', '.bin', 'electron')

const result = spawnSync(
  electronBin,
  process.argv.slice(2),
  {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'inherit',
    windowsHide: true,
  }
)

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
