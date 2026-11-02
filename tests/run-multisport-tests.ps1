$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = Split-Path $PSScriptRoot -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Wrong branch' }
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (!(Test-Path -LiteralPath $edge)) { throw 'Microsoft Edge not found' }
function Encode-Source([string]$path) { [Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) }
$sources = @{
    store = Encode-Source (Join-Path $root 'js/athlete-store.js')
    page = Encode-Source (Join-Path $root 'js/athlete-page.js')
    layout = Encode-Source (Join-Path $root 'athlete.html')
    remote = Encode-Source (Join-Path $root 'js/athlete-data.js')
    cloud = Encode-Source (Join-Path $root 'js/cloud.js')
    management = Encode-Source (Join-Path $root 'js/coach-management.js')
    index = Encode-Source (Join-Path $root 'index.html')
    baseline = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(((git -C $root show HEAD:index.html) -join "`n")))
} | ConvertTo-Json -Compress
$runner = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'multisport.test.html')).Replace('// TEST_SOURCES', "const SOURCES=$sources;")
$tempPath = Join-Path ([IO.Path]::GetTempPath()) ('tractions-multisport-tests-' + [guid]::NewGuid())
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
Write-Output "Test artifacts: $tempPath"
if ($report -notmatch 'ALL PASSED' -or $report -match 'FAIL ') { throw 'Tests failed or incomplete' }
