$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if ((git -C $root branch --show-current) -ne 'developpement-coach') { throw 'Wrong branch' }
$ruleBytes = [IO.File]::ReadAllBytes((Join-Path $root 'firebase/firestore.rules'))
$rules = [Text.UTF8Encoding]::new($false,$true).GetString($ruleBytes)
$tests = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'security.test.mjs'))
$config = Get-Content -Raw (Join-Path $root 'firebase.json') | ConvertFrom-Json
$example = Get-Content -Raw (Join-Path $root 'firebase/settings-access.example.json') | ConvertFrom-Json
function Check([bool]$condition,[string]$message) { if (!$condition) { throw $message }; Write-Output "PASS STATIC $message" }
Check (!($ruleBytes.Length -ge 3 -and $ruleBytes[0] -eq 239 -and $ruleBytes[1] -eq 187 -and $ruleBytes[2] -eq 191)) 'Strict UTF8 without BOM'
Check (![regex]::IsMatch($rules,'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u00A0\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]')) 'No suspicious invisible/control characters'
$code = [regex]::Replace($rules,'(?m)//[^\r\n]*','')
$code = [regex]::Replace($code,"'([^'\\]|\\.)*'",'STRING')
Check (![regex]::IsMatch($code,'[^\x09\x0A\x0D\x20-\x7E]|[''""`]|\\[nr]|<script|</script')) 'No pasted markup, unmatched string delimiters or literal newline escapes'
$stack = [Collections.Generic.Stack[char]]::new()
$closing = @{ ')' = '('; ']' = '['; '}' = '{' }
foreach ($character in $code.ToCharArray()) {
    if ('([{'.Contains([string]$character)) { $stack.Push($character) }
    elseif ($closing.ContainsKey([string]$character)) {
        if ($stack.Count -eq 0 -or $stack.Pop() -ne $closing[[string]$character]) { throw 'Unbalanced rule delimiters' }
    }
}
Check ($stack.Count -eq 0) 'Balanced delimiters (not a Firestore compilation)'
Check ($rules.Contains("rules_version = '2'")) 'Rules version declared'
Check ($rules.Contains('match /{document=**} { allow read, write: if false; }')) 'Default denial present'
Check ($rules.Contains('match /settings/{id} { allow read, write: if false; }')) 'Client access configuration denied'
Check ($rules.Contains('match /invitations/{id} { allow read, write: if false; }')) 'Client invitations denied'
Check ($rules.Contains('request.auth.token.email_verified == true') -and $rules.Contains('.data.coachUid == request.auth.uid')) 'Verified identity and singleton UID conditions present'
Check ($rules.Contains('enrolled(uid)') -and $rules.Contains(".data.status == 'active'")) 'Admission and active relation conditions present'
Check ($rules.Contains('owner(athleteUid) && designatedCoach(coachUid)')) 'Relation reads bound to admitted owner and designated coach'
Check ($rules.Contains('validSessionId(sessionId) && canRead(uid)') -and $rules.Contains('&& validSessionId(sessionId) && owner(uid)')) 'Session ID scope shared by reads and writes'
Check ($rules.Contains('hasOnly') -and $rules.Contains('request.resource.data.updatedAt == request.time')) 'Field whitelist and timestamp conditions present'
Check ($config.emulators.firestore.host -eq '127.0.0.1' -and $config.firestore.rules -eq 'firebase/firestore.rules') 'Root emulator configuration targets rules inside project'
Check ((Test-Path -LiteralPath (Join-Path $root $config.firestore.rules)) -and !(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'firebase.json'))) 'Rules exist and obsolete nested configuration is absent'
Check ($example.active -eq $false -and $example.coachUid -like 'REMPLACER*') 'Example inactive without real UID'
Check (([regex]::Matches($tests, "(?m)^test\('")).Count -eq 24 -and $tests.Contains("process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'")) 'Twenty-four engine test scenarios and local guard prepared'
Write-Output 'STATIC CHECKS PASSED. Rules were NOT compiled or evaluated by the Firestore engine.'
