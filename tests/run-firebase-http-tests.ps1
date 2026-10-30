$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = Split-Path $PSScriptRoot -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Wrong branch' }
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (!(Test-Path -LiteralPath $edge)) { throw 'Microsoft Edge not found' }
$tempPath = Join-Path ([IO.Path]::GetTempPath()) ('tractions-http-tests-' + [guid]::NewGuid())
[IO.Directory]::CreateDirectory($tempPath) | Out-Null
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$probe.Start()
$port = $probe.LocalEndpoint.Port
$probe.Stop()
# Serveur temporaire en boucle locale : seuls deux fichiers de test sont accessibles.
$server = Start-Job -ArgumentList $root,$port -ScriptBlock {
    param($root,$port)
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
    $listener.Start()
    Write-Output 'READY'
    try {
        while ($true) {
            if (!$listener.Pending()) { Start-Sleep -Milliseconds 100; continue }
            $client = $listener.AcceptTcpClient()
            try {
                $client.ReceiveTimeout = 5000
                $stream = $client.GetStream()
                $reader = [IO.StreamReader]::new($stream)
                $request = $reader.ReadLine()
                if (!$request) { continue }
                while ($reader.ReadLine()) {}
                $path = ($request -split ' ')[1]
                $file = $null
                $mime = 'text/plain'
                if ($request.StartsWith('GET ')) {
                    switch ($path) {
                        '/Objectif-5-tractions/tests/firebase-http.html' { $file = Join-Path $root 'tests/firebase-http.html'; $mime = 'text/html; charset=utf-8' }
                        '/Objectif-5-tractions/js/firebase-config.js' { $file = Join-Path $root 'js/firebase-config.js'; $mime = 'text/javascript; charset=utf-8' }
                    }
                }
                $status = '404 Not Found'
                $body = [Text.Encoding]::UTF8.GetBytes('Not found')
                if ($file) { $status = '200 OK'; $body = [IO.File]::ReadAllBytes($file) }
                $header = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n")
                $stream.Write($header,0,$header.Length)
                $stream.Write($body,0,$body.Length)
            } catch { Write-Output ('SERVER: ' + $_.Exception.Message) }
            finally { $client.Dispose() }
        }
    } finally { $listener.Stop() }
}
try {
    $ready = $false
    for ($attempt=0; $attempt -lt 40; $attempt++) {
        if ((Receive-Job $server) -contains 'READY') { $ready=$true; break }
        if ($server.State -eq 'Failed') { throw 'HTTP server failed' }
        Start-Sleep -Milliseconds 250
    }
    if (!$ready) { throw 'HTTP server not ready' }
    $taskOut = Join-Path $tempPath 'result.html'
    $taskErr = Join-Path $tempPath 'edge.log'
    $url = "http://127.0.0.1:$port/Objectif-5-tractions/tests/firebase-http.html"
    $arguments = @('--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking',"--user-data-dir=$tempPath/profile",'--dump-dom','--virtual-time-budget=20000',$url)
    $process = Start-Process -FilePath $edge -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $taskOut -RedirectStandardError $taskErr
    if ($process.ExitCode -ne 0) { throw "Edge exit: $($process.ExitCode)" }
    $html = [IO.File]::ReadAllText($taskOut)
    $match = [regex]::Match($html, '<pre id="results">([\s\S]*?)</pre>')
    $report = [Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
    Write-Output $report
    Write-Output "Test URL: $url"
    Write-Output "Test artifacts: $tempPath"
    if ($report -notmatch 'ALL PASSED' -or $report -match 'FAIL ') { throw 'HTTP tests failed or incomplete' }
} finally {
    Stop-Job $server
    Remove-Job $server
}
