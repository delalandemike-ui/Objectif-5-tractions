param([ValidateRange(1024,65535)][int]$Port = 19086)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Wrong branch' }
$routes = @{
    '/' = @('index.html','text/html; charset=utf-8')
    '/index.html' = @('index.html','text/html; charset=utf-8')
    '/coach.html' = @('coach.html','text/html; charset=utf-8')
    '/sw.js' = @('sw.js','text/javascript; charset=utf-8')
    '/js/auth.js' = @('js/auth.js','text/javascript; charset=utf-8')
    '/js/firebase-config.js' = @('js/firebase-config.js','text/javascript; charset=utf-8')
    '/js/coach-data.js' = @('js/coach-data.js','text/javascript; charset=utf-8')
    '/js/coach-page.js' = @('js/coach-page.js','text/javascript; charset=utf-8')
}
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
$listener.Start()
Write-Output "Local test page: http://127.0.0.1:$Port/index.html"
Write-Output 'No automatic Firebase action. Stop this server with Ctrl+C. Credentials are entered only by the account owner in the browser.'
$connections = [Collections.Generic.List[object]]::new()
try {
    while ($true) {
        while ($listener.Pending() -and $connections.Count -lt 32) {
            $client = $listener.AcceptTcpClient()
            $client.SendTimeout = 2000
            $connections.Add([pscustomobject]@{ Client=$client; Buffer=[IO.MemoryStream]::new(); Started=[DateTime]::UtcNow })
        }
        for ($i=$connections.Count-1; $i -ge 0; $i--) {
            $entry = $connections[$i]
            $done = $false
            try {
                # Ne jamais bloquer sur ReadLine() d'une preconnexion inactive.
                if (([DateTime]::UtcNow - $entry.Started).TotalSeconds -gt 5) { $done=$true; continue }
                $available = $entry.Client.Available
                if ($available -eq 0) { continue }
                $stream = $entry.Client.GetStream()
                $chunk = [byte[]]::new([Math]::Min($available,4096))
                $count = $stream.Read($chunk,0,$chunk.Length)
                if ($count -eq 0) { $done=$true; continue }
                $entry.Buffer.Write($chunk,0,$count)
                if ($entry.Buffer.Length -gt 16384) { $done=$true; continue }
                $requestHeaders = [Text.Encoding]::ASCII.GetString($entry.Buffer.ToArray())
                if (!$requestHeaders.Contains("`r`n`r`n")) { continue }
                $request = ($requestHeaders -split "`r`n",2)[0]
                $path = ($request -split ' ')[1]
                $route = if ($request.StartsWith('GET ')) { $routes[$path] } else { $null }
                $status = '404 Not Found'; $mime = 'text/plain'; $body = [Text.Encoding]::UTF8.GetBytes('Not found')
                if ($route) {
                    $status = '200 OK'; $mime = $route[1]
                    $body = [IO.File]::ReadAllBytes((Join-Path $root $route[0]))
                }
                $header = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nReferrer-Policy: no-referrer`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n")
                $stream.Write($header,0,$header.Length); $stream.Write($body,0,$body.Length)
                $done=$true
            } catch { $done=$true; Write-Warning 'Local request failed. No request content logged.' }
            finally {
                if ($done) { $entry.Buffer.Dispose(); $entry.Client.Dispose(); $connections.RemoveAt($i) }
            }
        }
        Start-Sleep -Milliseconds 10
    }
} finally {
    foreach ($entry in $connections) { $entry.Buffer.Dispose(); $entry.Client.Dispose() }
    $listener.Stop()
}
