$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$script:SetupChecks=@()
function Setup-Check([string]$Phase,[scriptblock]$Action) {
    $watch=[Diagnostics.Stopwatch]::StartNew()
    [Console]::WriteLine('CC_SETUP_CHECK_STEP:'+(ConvertTo-Json -Compress -InputObject @{phase=$Phase;status='started'}))
    try { $observation=&$Action; $entry=@{phase=$Phase;status='observed';durationMs=$watch.ElapsedMilliseconds;observation=$observation} }
    catch { $entry=@{phase=$Phase;status='unavailable';durationMs=$watch.ElapsedMilliseconds;reason=$_.Exception.Message;exception=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult;line=$_.InvocationInfo.ScriptLineNumber;errorId=$_.FullyQualifiedErrorId} }
    $script:SetupChecks+=$entry
    [Console]::WriteLine('CC_SETUP_CHECK_STEP:'+(ConvertTo-Json -Depth 7 -Compress -InputObject $entry))
}
Setup-Check 'Installer environment' { @{powerShell=$PSVersionTable.PSVersion.ToString();languageMode=[string]$ExecutionContext.SessionState.LanguageMode;process64Bit=[Environment]::Is64BitProcess;os64Bit=[Environment]::Is64BitOperatingSystem;localDataConfigured=[bool]$env:LOCALAPPDATA;readOnly=$true} }
Setup-Check 'Installation locator and storage marker' {
    $script:CheckRoot=([IO.Path]::GetFullPath($env:CLE_CHECK_INSTALL_ROOT)).TrimEnd('\')
    $root=Get-Item -LiteralPath $script:CheckRoot -ErrorAction Stop
    if (-not $root.PSIsContainer -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'Installation locator is not a regular directory'}
    $marker=Join-Path $script:CheckRoot 'storage-layout.json'
    if (-not [IO.File]::Exists($marker)) { return @{rootExists=$true;markerPresent=$false;interpretation='No centralized marker; may be first install or legacy installation'} }
    $m=Get-Item -LiteralPath $marker
    if ($m.Length -gt 4096 -or ($m.Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'Storage marker is oversized or redirected'}
    $value=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
    @{rootExists=$true;schema=$value.schema;product=$value.product;knownSchema=($value.schema -eq 1 -and $value.product -eq 'Code-Codex')}
}
Setup-Check 'Installed version and components' {
    $pointer=Join-Path $script:CheckRoot 'current-version'
    $version=if ([IO.File]::Exists($pointer)) { $m=Get-Item -LiteralPath $pointer;if($m.Length -gt 128 -or ($m.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid version pointer'};[IO.File]::ReadAllText($pointer).Trim() }else{''}
    if ($version -and $version -notmatch '^\d+\.\d+\.\d+$') {throw 'Installed version pointer format is invalid'}
    $components=@('CodeCodex.exe','CodeCodex.Shortcut.exe','Uninstall-CodeCodex.exe')
    if ($version) {$components+=@("versions/$version/code-codex.exe","versions/$version/CodeCodex.exe")}
    @{version=$version;components=@($components|ForEach-Object{@{component=$_;exists=[IO.File]::Exists((Join-Path $script:CheckRoot $_))}});interpretation='Existence only; not binary authenticity or successful UI injection'}
}
Setup-Check 'Storage directories' { @{directories=@(@('data','plugins','logs','temp','backups','integration')|ForEach-Object{$p=Join-Path $script:CheckRoot $_;$m=Get-Item -LiteralPath $p -ErrorAction SilentlyContinue;@{name=$_;exists=[bool]$m;regularDirectory=($m -and $m.PSIsContainer -and -not ($m.Attributes -band [IO.FileAttributes]::ReparsePoint))}})} }
Setup-Check 'Available disk space' { $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($script:CheckRoot));@{ready=$drive.IsReady;type=[string]$drive.DriveType;freeBytes=$drive.AvailableFreeSpace;sizeBytes=$drive.TotalSize} }
Setup-Check 'Official Codex package metadata' { $p=Get-AppxPackage -Name OpenAI.Codex -ErrorAction Stop|Select-Object -First 1;@{available=[bool]$p;version=[string]$p.Version;status=[string]$p.Status;interpretation='Package metadata only; application not started or modified'} }
@{schema=1;readOnly=$true;checks=$script:SetupChecks}|ConvertTo-Json -Depth 8 -Compress
