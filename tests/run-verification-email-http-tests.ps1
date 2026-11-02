param([switch]$FirefoxScreenshot)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = Split-Path $PSScriptRoot -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Wrong branch' }
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
$serverPath = Join-Path $PSScriptRoot 'serve-verification-email-coach.ps1'
$job = Start-Job -ArgumentList $serverPath,$port -ScriptBlock {
    param($serverPath,$port)
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
    & $serverPath -Port $port
}
$idle = $null
function Check([bool]$condition,[string]$name) { if (!$condition) { throw $name }; Write-Output "PASS $name" }
try {
    $ready = $false
    for ($attempt=0; $attempt -lt 80; $attempt++) {
        if (@(Receive-Job $job) -match 'Local test page:') { $ready = $true; break }
        if ($job.State -eq 'Failed') { throw 'Server failed' }
        Start-Sleep -Milliseconds 250
    }
    if (!$ready) { throw 'Server not ready' }
    $base = "http://127.0.0.1:$port"
    $response = Invoke-WebRequest -UseBasicParsing "$base/tests/verification-email-coach.html" -TimeoutSec 5
    Check ($response.StatusCode -eq 200 -and $response.Headers['Content-Type'] -eq 'text/html; charset=utf-8') 'HTML HTTP 200 and UTF8 MIME'
    Check ($response.Content.Contains('<form id="login"') -and $response.Content.Contains('id="email"') -and $response.Content.Contains('id="password"')) 'Form and both inputs present in actual response'
    $downloaded = [Text.Encoding]::UTF8.GetBytes($response.Content)
    $expected = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'verification-email-coach.html'))
    Check ([Convert]::ToBase64String($downloaded) -eq [Convert]::ToBase64String($expected)) 'Complete response equals file on disk'
    foreach ($route in @('/tests/email-verification-controller.js','/js/firebase-config.js')) {
        $module = Invoke-WebRequest -UseBasicParsing "$base$route" -TimeoutSec 5
        Check ($module.StatusCode -eq 200 -and $module.Headers['Content-Type'] -eq 'text/javascript; charset=utf-8' -and $module.Content.Length -gt 0) "Module HTTP path and MIME: $route"
    }
    # Une preconnexion inactive ne doit pas bloquer le chargement du formulaire.
    $idle = [Net.Sockets.TcpClient]::new('127.0.0.1',$port)
    Start-Sleep -Milliseconds 250
    $response = Invoke-WebRequest -UseBasicParsing "$base/tests/verification-email-coach.html" -TimeoutSec 2
    Check ($response.StatusCode -eq 200 -and $response.Content.Contains('<form id="login"')) 'Idle connection does not block a second request'
    try {
        $null = Invoke-WebRequest -UseBasicParsing "$base/index.html" -TimeoutSec 5
        throw 'Unexpected application exposure'
    } catch [Net.WebException] {
        Check ([int]$_.Exception.Response.StatusCode -eq 404) 'Application outside whitelist returns 404'
    }
    if ($FirefoxScreenshot) {
        $firefox = 'C:\Program Files\Mozilla Firefox\firefox.exe'
        if (!(Test-Path -LiteralPath $firefox)) { throw 'Firefox not found' }
        $artifacts = Join-Path ([IO.Path]::GetTempPath()) ('tractions-firefox-' + [guid]::NewGuid())
        $profile = Join-Path $artifacts 'profile'
        [IO.Directory]::CreateDirectory($profile) | Out-Null
        $image = Join-Path $artifacts 'page.png'
        [IO.File]::WriteAllText((Join-Path $profile 'user.js'), 'user_pref("browser.shell.checkDefaultBrowser", false); user_pref("signon.rememberSignons", false);')
        $browser = Start-Process -FilePath $firefox -ArgumentList @('--headless','--no-remote','--profile',$profile,'--window-size','1000,1100','--screenshot',$image,"$base/tests/verification-email-coach.html") -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $artifacts 'stdout.log') -RedirectStandardError (Join-Path $artifacts 'stderr.log')
        Check ($browser.ExitCode -eq 0 -and (Test-Path -LiteralPath $image)) 'Firefox isolated screenshot created (visual inspection required)'
        Write-Output "Firefox screenshot: $image"
    }
    Write-Output 'ALL PASSED - no credentials submitted and no verification email requested.'
} finally {
    if ($idle) { $idle.Dispose() }
    Stop-Job $job
    Remove-Job $job
}
