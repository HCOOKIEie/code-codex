$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$result = [ordered]@{ schema=1; readOnly=$true; lookbackMinutes=10; checks=@() }
function Check([string]$phase, [scriptblock]$action) {
    $watch=[Diagnostics.Stopwatch]::StartNew()
    [Console]::WriteLine('CC_SUPPORT_STEP:' + (ConvertTo-Json -Compress -InputObject @{phase=$phase;status='started'}))
    try { $observation=& $action; $script:result.checks += [ordered]@{phase=$phase;status='observed';durationMs=$watch.ElapsedMilliseconds;observation=$observation} }
    catch { $script:result.checks += [ordered]@{phase=$phase;status='unavailable';durationMs=$watch.ElapsedMilliseconds;category=[string]$_.CategoryInfo.Category;errorId=$_.FullyQualifiedErrorId;exceptionType=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult;line=$_.InvocationInfo.ScriptLineNumber} }
    [Console]::WriteLine('CC_SUPPORT_STEP:' + (ConvertTo-Json -Depth 8 -Compress -InputObject $script:result.checks[-1]))
}
function Recent-Events($filter) {
    try { @(Get-WinEvent -FilterHashtable $filter -MaxEvents 50 -ErrorAction Stop) }
    catch { if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { @() } else { throw } }
}
Check 'PowerShell' { [ordered]@{version=$PSVersionTable.PSVersion.ToString();languageMode=[string]$ExecutionContext.SessionState.LanguageMode;process64Bit=[Environment]::Is64BitProcess;os64Bit=[Environment]::Is64BitOperatingSystem} }
Check 'Defender status' { $s=Get-MpComputerStatus; [ordered]@{antivirusEnabled=$s.AntivirusEnabled;realTimeEnabled=$s.RealTimeProtectionEnabled;signatureAgeDays=$s.AntivirusSignatureAge;signatureVersion=$s.AntivirusSignatureVersion;interpretation='Status only; no policy is changed.'} }
Check 'Recent application failures' {
    $events=@(Recent-Events @{LogName='Application';Id=@(1000,1001);StartTime=(Get-Date).AddMinutes(-10)})
    # Examine values locally, return only aggregate and standardized executable names.
    $matched=@($events | Where-Object { ($_.Properties.Value -join ' ') -match '(?i)(code-codex|codex|chatgpt)[.]exe' })
    [ordered]@{sampleLimit=50;sampled=$events.Count;matched=$matched.Count;events=@($matched | Select-Object -First 8 | ForEach-Object { [ordered]@{id=$_.Id;level=$_.Level;time=$_.TimeCreated.ToUniversalTime().ToString('o');provider=$_.ProviderName} });interpretation='Recent matching event metadata only; no event message, dump or private path collected. Zero matches is inconclusive.'}
}
Check 'Recent Defender detections' {
    $events=@(Recent-Events @{LogName='Microsoft-Windows-Windows Defender/Operational';Id=@(1116,1117);StartTime=(Get-Date).AddMinutes(-10)})
    $matched=@($events | Where-Object { ($_.Properties.Value -join ' ') -match '(?i)(code-codex|codecodex|codex|chatgpt)[^ ]*[.](exe|js)' })
    [ordered]@{sampleLimit=50;sampled=$events.Count;matched=$matched.Count;events=@($matched | Select-Object -First 8 | ForEach-Object { [ordered]@{id=$_.Id;level=$_.Level;time=$_.TimeCreated.ToUniversalTime().ToString('o')} });interpretation='Correlation only. Third-party security products and older detections are not covered.'}
}
Check 'Video driver metadata' { @(Get-CimInstance Win32_VideoController -OperationTimeoutSec 2 | Select-Object -First 4 | ForEach-Object { [ordered]@{driverVersion=$_.DriverVersion;status=$_.Status;configManagerErrorCode=$_.ConfigManagerErrorCode} }) }
Check 'System storage metadata' { @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -OperationTimeoutSec 2 | Select-Object -First 8 | ForEach-Object { [ordered]@{freeBytes=$_.FreeSpace;sizeBytes=$_.Size;fileSystem=$_.FileSystem} }); }
$result | ConvertTo-Json -Depth 8 -Compress
