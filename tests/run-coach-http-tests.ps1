param([switch]$Browser)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Wrong branch' }
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
$serverPath = Join-Path $PSScriptRoot 'serve-coach.ps1'
$job = Start-Job -ArgumentList $serverPath,$port -ScriptBlock {
    param($serverPath,$port)
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
    & $serverPath -Port $port
}
function Check([bool]$ok,[string]$name) { if (!$ok) { throw $name }; Write-Output "PASS $name" }
try {
    $ready = $false
    for ($attempt=0; $attempt -lt 80; $attempt++) {
        if (@(Receive-Job $job) -match 'Local test page:') { $ready=$true; break }
        if ($job.State -eq 'Failed') { throw 'Server failed' }
        Start-Sleep -Milliseconds 250
    }
    if (!$ready) { throw 'Server not ready' }
    $base = "http://127.0.0.1:$port"
    $response = Invoke-WebRequest -UseBasicParsing "$base/index.html" -TimeoutSec 5
    Check ($response.StatusCode -eq 200 -and $response.Content.Contains('href="coach.html"')) 'Application links to coach page'
    $response = Invoke-WebRequest -UseBasicParsing "$base/coach.html" -TimeoutSec 5
    Check ($response.StatusCode -eq 200 -and $response.Headers['Content-Type'] -eq 'text/html; charset=utf-8' -and $response.Content.Contains('<form id="coach-login"') -and $response.Content.Contains('id="coach-password"')) 'Coach form served as UTF8 HTML'
    foreach ($path in @('/js/auth.js','/js/firebase-config.js','/js/coach-page.js','/js/coach-data.js','/sw.js')) {
        $response = Invoke-WebRequest -UseBasicParsing "$base$path" -TimeoutSec 5
        Check ($response.StatusCode -eq 200 -and $response.Headers['Content-Type'] -eq 'text/javascript; charset=utf-8') "Module path and MIME: $path"
    }
    try { $null = Invoke-WebRequest -UseBasicParsing "$base/firebase/firestore.rules" -TimeoutSec 5; throw 'Unexpected route' }
    catch [Net.WebException] { Check ([int]$_.Exception.Response.StatusCode -eq 404) 'Private routes not served' }
    if ($Browser) {
        $edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
        $temp = Join-Path ([IO.Path]::GetTempPath()) ('tractions-coach-http-' + [guid]::NewGuid())
        [IO.Directory]::CreateDirectory($temp) | Out-Null
        $output = Join-Path $temp 'page.html'
        $browserProcess = Start-Process -FilePath $edge -WindowStyle Hidden -Wait -PassThru -ArgumentList @('--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking',"--user-data-dir=$temp/profile",'--dump-dom','--virtual-time-budget=5000',"$base/coach.html") -RedirectStandardOutput $output -RedirectStandardError (Join-Path $temp 'edge.log')
        $html = [IO.File]::ReadAllText($output)
        Check ($browserProcess.ExitCode -eq 0 -and $html.Contains('Connectez-vous avec le compte coach existant.') -and $html -notmatch '<input[^>]+id="coach-email"[^>]+disabled') 'Real HTTP module imports and usable login form in isolated Edge'
        Write-Output "Browser artifacts: $temp"
    }
    Write-Output 'ALL PASSED - HTTP only, no Firebase SDK or credentials used.'
} finally { Stop-Job $job; Remove-Job $job }
