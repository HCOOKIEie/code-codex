param([string]$Output = 'artifacts/automatic-diagnostics-v0.4.9')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$outputPath=[IO.Path]::GetFullPath((Join-Path $root $Output))
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$source=Get-Content (Join-Path $root 'crates/launcher/src/bin/code-codex-launcher.rs') -Raw -Encoding UTF8
$scriptText=[regex]::Match($source,'(?s)const DIALOG_SCRIPT: &str = r#"(.*?)"#;').Groups[1].Value
if(-not $scriptText){throw 'Production dialog script missing'}
# Replace only clipboard output in the test, avoiding changes to the user's clipboard.
$scriptText=$scriptText.Replace('[System.Windows.Forms.Clipboard]::SetText($details)', '[IO.File]::WriteAllText($env:TEST_COPIED,$details)')
$hook=@'
$testTimer = New-Object System.Windows.Forms.Timer
$testTimer.Interval = 600
$script:testPhase=0
$testTimer.Add_Tick({
    try {
        if ($script:testPhase -eq 0) {
            if ($reason.Text -notlike '*FIRST_FAILURE*') {throw 'Original failure absent'}
            $bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height)
            $form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)))
            $bitmap.Save($env:TEST_INITIAL);$bitmap.Dispose()
            $full='FIRST_FAILURE' + "`n" + ('Detailed process record ' * 2000) + "`nFINAL_CHECK_EVIDENCE"
            if ($env:CLE_ERROR_REPORT) {[IO.File]::WriteAllText($env:CLE_ERROR_REPORT,$full)}
            $state=@{reason="FIRST_FAILURE`r`nAutomatic self-check: completed`r`nFINAL_CHECK_EVIDENCE";guidance='Checks completed; recovery not established';details=$full}
            [IO.File]::WriteAllText($env:CLE_ERROR_LIVE_STATE,(ConvertTo-Json $state -Compress))
            $script:testPhase=1
        } else {
            if($reason.Text -notlike '*FINAL_CHECK_EVIDENCE*'){throw 'Live details did not update'}
            $copy.PerformClick()
            $copied=[IO.File]::ReadAllText($env:TEST_COPIED)
            if($copied.Length -lt 40000 -or $copied -notlike '*FIRST_FAILURE*' -or $copied -notlike '*FINAL_CHECK_EVIDENCE*'){throw 'Copy lost original or final full record'}
            $bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height)
            $form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)))
            $bitmap.Save($env:TEST_FINAL);$bitmap.Dispose()
            [IO.File]::WriteAllText($env:TEST_RESULT,(ConvertTo-Json @{passed=$true;copyChars=$copied.Length;clientWidth=$form.ClientSize.Width;clientHeight=$form.ClientSize.Height;buttons=@($copy.Text,$open.Text,$close.Text)}))
            $testTimer.Stop();$form.Close()
        }
    } catch { [IO.File]::WriteAllText($env:TEST_RESULT,(ConvertTo-Json @{passed=$false;error=$_.Exception.Message}));$testTimer.Stop();$form.Close() }
})
$form.Add_Shown({$testTimer.Start()})
'@
$scriptText=$scriptText.Replace('[void]$form.ShowDialog()',($hook+"`n[void]`$form.ShowDialog()"))
$testScript=Join-Path $outputPath 'dialog-fixture.ps1';[IO.File]::WriteAllText($testScript,$scriptText,[Text.UTF8Encoding]::new($true))
foreach($mode in @('saved','unsaved')){
 $env:CLE_ERROR_TITLE='Code-Codex startup problem';$env:CLE_ERROR_SUMMARY='Fixture: startup connection failed';$env:CLE_ERROR_STAGE='Connecting to Codex Desktop';$env:CLE_ERROR_CODE='CC-START-CDP-001';$env:CLE_ERROR_REASON="FIRST_FAILURE`r`nAutomatic self-check: running";$env:CLE_ERROR_GUIDANCE='Automatic checks are running.';$env:CLE_ERROR_DETAILS='FIRST_FAILURE'
 $env:CLE_ERROR_LIVE_STATE=Join-Path $outputPath "dialog-$mode-state.json"
 if(Test-Path -LiteralPath $env:CLE_ERROR_LIVE_STATE){Remove-Item -LiteralPath $env:CLE_ERROR_LIVE_STATE -Force}
 $env:CLE_ERROR_REPORT=if($mode -eq 'saved'){Join-Path $outputPath 'dialog-report.txt'}else{''}
 $env:TEST_COPIED=Join-Path $outputPath "dialog-$mode-copy.txt";$env:TEST_INITIAL=Join-Path $outputPath "dialog-$mode-initial.png";$env:TEST_FINAL=Join-Path $outputPath "dialog-$mode-final.png";$env:TEST_RESULT=Join-Path $outputPath "dialog-$mode-result.json"
 & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -File $testScript
 if($LASTEXITCODE -ne 0){throw 'Dialog fixture process failed'}
 $result=Get-Content $env:TEST_RESULT -Raw | ConvertFrom-Json
 if(-not $result.passed){throw $result.error}
 $result | ConvertTo-Json -Compress
}
