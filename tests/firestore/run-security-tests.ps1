$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Wrong branch' }
foreach ($tool in @('node','java','firebase')) {
    if (!(Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Missing prerequisite: $tool. No dependency was installed and no security test was run."
    }
}
Push-Location $root
try {
    # Projet demo uniquement : aucun login ni déploiement dans ce lanceur.
    & firebase emulators:exec --project demo-objectif-5-tractions --config tests/firestore/firebase.json --only firestore 'node --test --test-concurrency=1 tests/firestore/security.test.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Emulator tests failed or prerequisites incomplete' }
} finally { Pop-Location }
