$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = Split-Path $PSScriptRoot -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Branche incorrecte' }
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (!(Test-Path -LiteralPath $edge)) { throw 'Microsoft Edge absent : adapter le chemin du navigateur.' }
function Encode-Source([string]$source) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($source.Replace("`r`n", "`n"))) }
$sources = @{
    index = Encode-Source ([IO.File]::ReadAllText((Join-Path $root 'index.html')))
    sw = Encode-Source ([IO.File]::ReadAllText((Join-Path $root 'sw.js')))
    baseline = Encode-Source ((git -C $root show HEAD:index.html) -join "`n")
    baselineSw = Encode-Source ((git -C $root show HEAD:sw.js) -join "`n")
} | ConvertTo-Json -Compress
$runner = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'regression.html')).Replace('// TEST_SOURCES', "const SOURCES=$sources;")
$tempPath = Join-Path ([IO.Path]::GetTempPath()) ('tractions-tests-' + [guid]::NewGuid())
[IO.Directory]::CreateDirectory($tempPath) | Out-Null
$runnerPath = Join-Path $tempPath 'runner.html'
[IO.File]::WriteAllText($runnerPath, $runner, [Text.UTF8Encoding]::new($false))
$taskOut = Join-Path $tempPath 'result.html'
$taskErr = Join-Path $tempPath 'edge.log'
$arguments = @('--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking',"--user-data-dir=$tempPath/profile",'--dump-dom','--virtual-time-budget=15000',([uri]$runnerPath).AbsoluteUri)
$process = Start-Process -FilePath $edge -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $taskOut -RedirectStandardError $taskErr
if ($process.ExitCode -ne 0) { throw "Edge exit: $($process.ExitCode). See $taskErr" }
$html = [IO.File]::ReadAllText($taskOut)
$match = [regex]::Match($html, '<pre id="results">([\s\S]*?)</pre>')
$report = [Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
Write-Output $report
Write-Output "Artefacts de test isolés : $tempPath"
if ($report -notmatch 'ALL PASSED' -or $report -match 'FAIL ') { throw 'Tests incomplets ou en échec' }
