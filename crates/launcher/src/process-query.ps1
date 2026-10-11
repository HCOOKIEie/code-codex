$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$script:ccStep = 'query setup'
$script:ccClock = [Diagnostics.Stopwatch]::StartNew()
function Write-CCObservation([string]$Phase, [string]$Outcome, $Fields) {
    $event = [ordered]@{phase=$Phase; outcome=$Outcome; elapsedMs=$script:ccClock.ElapsedMilliseconds}
    if ($Fields) { foreach ($key in $Fields.Keys) { $event[$key] = $Fields[$key] } }
    [Console]::Error.WriteLine('CC_PROCESS_QUERY=' + (ConvertTo-Json -InputObject $event -Compress -Depth 6))
}
function Invoke-CCStep([string]$Phase, [scriptblock]$Action) {
    $script:ccStep = $Phase
    Write-CCObservation $Phase 'started' @{}
    $result = & $Action
    Write-CCObservation $Phase 'passed' @{}
    return $result
}
try {
  try {
    Write-CCObservation 'environment' 'observed' @{
        powershellVersion=$PSVersionTable.PSVersion.ToString()
        clrVersion=[Environment]::Version.ToString()
        windowsVersion=[Environment]::OSVersion.Version.ToString()
        process64Bit=[Environment]::Is64BitProcess
        os64Bit=[Environment]::Is64BitOperatingSystem
        languageMode=$ExecutionContext.SessionState.LanguageMode.ToString()
        currentCulture=[Globalization.CultureInfo]::CurrentCulture.Name
        currentUICulture=[Globalization.CultureInfo]::CurrentUICulture.Name
        elevated=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        cimCommandPresent=($null -ne (Get-Command Get-CimInstance -ErrorAction SilentlyContinue))
        tcpCommandPresent=($null -ne (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue))
    }
  } catch {
    Write-CCObservation 'environment' 'unavailable' @{exceptionType=$_.Exception.GetType().FullName; message=$_.Exception.Message}
  }
    # The body is compiled into the launcher. Dynamic PID/path inputs remain in
    # the environment; they are never interpolated into PowerShell source.
    __CC_QUERY_BODY__
    Write-CCObservation 'query' 'completed' @{}
} catch {
    $record = $_
    $causes = @()
    $exception = $record.Exception
    for ($i=0; $null -ne $exception -and $i -lt 4; $i++) {
        $native = $null
        if ($exception -is [ComponentModel.Win32Exception]) { $native = $exception.NativeErrorCode }
        $causes += [ordered]@{exceptionType=$exception.GetType().FullName; message=$exception.Message; hresult=$exception.HResult; nativeErrorCode=$native}
        $exception = $exception.InnerException
    }
    Write-CCObservation $script:ccStep 'failed' @{
        fullyQualifiedErrorId=$record.FullyQualifiedErrorId
        category=$record.CategoryInfo.Category.ToString()
        reason=$record.CategoryInfo.Reason
        scriptLine=$record.InvocationInfo.ScriptLineNumber
        scriptOffset=$record.InvocationInfo.OffsetInLine
        scriptLineScope='embedded PowerShell query, not repository source line'
        causes=$causes
    }
    exit 1
}
