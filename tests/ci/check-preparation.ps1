$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Wrong branch' }
$yaml = [IO.File]::ReadAllText((Join-Path $root '.github/workflows/firestore-security-manual.yml'))
$manifest = Get-Content -Raw (Join-Path $root 'tests/package.json') | ConvertFrom-Json
$browser = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'run-browser-tests.mjs'))
$config = Get-Content -Raw (Join-Path $root 'firebase.json') | ConvertFrom-Json
function Check([bool]$ok,[string]$message) { if (!$ok) { throw $message }; Write-Output "PASS STATIC $message" }
Check ([regex]::IsMatch($yaml,'(?m)^on:\r?\n  push:\r?\n    branches:\r?\n      - developpement-coach\r?\n  workflow_dispatch:\r?\n') -and !$yaml.Contains('pull_request:') -and !$yaml.Contains('schedule:')) 'Push development branch only and optional manual trigger'
Check ($yaml.Contains('contents: read') -and $yaml.Contains('persist-credentials: false')) 'Read-only checkout'
Check ($yaml.Contains('refs/heads/developpement-coach') -and $yaml.Contains('push|workflow_dispatch) ;;')) 'Development branch and allowed event guards'
Check ($yaml.Contains("node-version: '24'") -and $yaml.Contains("java-version: '21'")) 'Node 24 and Java 21 selected'
Check ($yaml.Contains('--project demo-objectif-5-tractions') -and $yaml.Contains('--only firestore')) 'Demo Firestore emulator only'
Check ($yaml.Contains('working-directory: .') -and $yaml.Contains('./tests/node_modules/.bin/firebase emulators:exec') -and $yaml.Contains('--config firebase.json') -and $yaml.Contains('--test-reporter=tap tests/firestore/security.test.mjs')) 'Emulator invocation rooted at repository with consistent test path'
Check ($config.firestore.rules -eq 'firebase/firestore.rules' -and (Test-Path -LiteralPath (Join-Path $root $config.firestore.rules)) -and !(Test-Path -LiteralPath (Join-Path $root 'tests/firestore/firebase.json'))) 'Root rules path exists without obsolete nested config'
Check (![regex]::IsMatch($yaml,'secrets\.|firebase\s+(deploy|login|use)|GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_TOKEN|continue-on-error|actions/(deploy-pages|configure-pages|upload-pages-artifact)@')) 'No production credentials, Firebase or Pages deployment, or ignored failures'
Check ($yaml.Contains('set -o pipefail') -and $yaml.Contains('GITHUB_STEP_SUMMARY') -and $yaml.Contains('actions/upload-artifact@v4')) 'Failures, summary and logs preserved'
Check ($manifest.private -eq $true -and $manifest.engines.node -eq '>=24.12.0') 'Isolated private test manifest'
Check ($manifest.devDependencies.'@firebase/rules-unit-testing' -eq '6.0.0' -and $manifest.devDependencies.firebase -eq '13.1.0') 'Compatible direct Firebase test versions pinned'
Check ($browser.Contains("file: 'regression.html', expected: 7") -and $browser.Contains("file: 'firebase-config.html', expected: 7") -and $browser.Contains("file: 'auth.html', expected: 10")) 'Existing 24 browser groups reused'
Check ($browser.Contains('route => route.abort()') -and $browser.Contains("serviceWorkers: 'block'")) 'Browser tests block external HTTP and real workers'
Write-Output 'STATIC ONLY: no YAML engine, Node, browser CI or Firestore engine was executed by this script.'
