$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Wrong branch' }
$node = Join-Path $root '.tools/node-v24.22.2-win-x64/node.exe'
$java = Join-Path $root '.tools/java21/jdk-21.0.13+9-jre/bin/java.exe'
$jar = Join-Path $root '.tools/firebase-emulators/cloud-firestore-emulator-v1.22.0.jar'
foreach ($path in @($node,$java,$jar)) { if (!(Test-Path -LiteralPath $path)) { throw "Missing local test prerequisite: $path" } }
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,8080)
try { $probe.Start() } finally { $probe.Stop() }
$temp = Join-Path ([IO.Path]::GetTempPath()) ('tractions-coaching-rules-' + [guid]::NewGuid())
[IO.Directory]::CreateDirectory($temp) | Out-Null
$process = Start-Process -FilePath $java -WindowStyle Hidden -PassThru -ArgumentList @('-Duser.language=en','-Duser.country=US','-jar', $jar, '--host=127.0.0.1','--port=8080','--project_id=demo-objectif-5-tractions','--rules=firebase/firestore.coaching.rules') -WorkingDirectory $root -RedirectStandardOutput (Join-Path $temp 'emulator.log') -RedirectStandardError (Join-Path $temp 'emulator.err')
$previousHost=$env:FIRESTORE_EMULATOR_HOST; $previousRules=$env:COACHING_RULES
try {
 $ready=$false
 for($attempt=0;$attempt -lt 80;$attempt++){
  if($process.HasExited){throw "Emulator failed. See $temp"}
  try { $socket=[Net.Sockets.TcpClient]::new('127.0.0.1',8080);$socket.Dispose();$ready=$true;break } catch { Start-Sleep -Milliseconds 250 }
 }
 if(!$ready){throw 'Local emulator not ready'}
 $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';$env:COACHING_RULES='1'
 Push-Location $root
 try { & $node --test --test-concurrency=1 tests/firestore/security.test.mjs tests/firestore/coaching.test.mjs; if($LASTEXITCODE -ne 0){throw 'Coaching security tests failed'} } finally {Pop-Location}
} finally {
 $env:FIRESTORE_EMULATOR_HOST=$previousHost; $env:COACHING_RULES=$previousRules
 if(!$process.HasExited){Stop-Process -Id $process.Id}
 Write-Output "Local emulator artifacts: $temp. No deployment performed."
}
