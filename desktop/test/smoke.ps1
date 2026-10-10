param([switch]$Visual,[string]$Fixture)
$ErrorActionPreference='Stop'
if(!$Visual){throw 'Run with -Visual to inspect and capture the native window.'}
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ConsoleNative {
 [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls,string title);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h,int id);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h,string value);
 [DllImport("user32.dll",EntryPoint="SendMessageW",CharSet=CharSet.Unicode)] public static extern IntPtr SendText(IntPtr h,uint msg,IntPtr w,string text);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] public static extern int GetScrollPos(IntPtr h,int bar);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int height,bool repaint);
 public struct Rect { public int Left,Top,Right,Bottom; }
}
'@
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$output=Join-Path $root 'docs/previews/desktop-console'
$work=Join-Path $env:TEMP ("ktga-desktop-test-"+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $output,$work | Out-Null
$server=$null;$app=$null
function Check($ok,$message) {if(!$ok){throw $message}}
function Visible($id) { return ([ConsoleNative]::GetWindowLong([ConsoleNative]::GetDlgItem($script:window,$id),-16) -band 0x10000000) -ne 0 }
function Click($id) { [ConsoleNative]::SendMessage($script:window,0x111,[IntPtr]$id,[IntPtr]::Zero) | Out-Null }
function Fill($id,$value) {[ConsoleNative]::SendText([ConsoleNative]::GetDlgItem($script:window,$id),0xC,[IntPtr]::Zero,$value) | Out-Null}
function WaitFor($condition,$label) {for($i=0;$i -lt 100;$i++){if((& $condition)){return};Start-Sleep -Milliseconds 100};throw "Timed out: $label"}
function Capture($name) {
 [ConsoleNative+Rect]$bounds=New-Object ConsoleNative+Rect
 [ConsoleNative]::GetWindowRect($script:window,[ref]$bounds) | Out-Null
 $bitmap=New-Object System.Drawing.Bitmap (($bounds.Right-$bounds.Left),($bounds.Bottom-$bounds.Top))
 $graphics=[System.Drawing.Graphics]::FromImage($bitmap);$dc=$graphics.GetHdc()
 try {Check ([ConsoleNative]::PrintWindow($script:window,$dc,2)) 'Capture failed'} finally {$graphics.ReleaseHdc($dc);$graphics.Dispose()}
 try {$bitmap.Save((Join-Path $output ($name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png);Check ($bitmap.GetPixel(250,200).ToArgb() -ne [System.Drawing.Color]::Black.ToArgb()) 'Blank preview'} finally {$bitmap.Dispose()}
}
try {
 $server=Start-Process node -ArgumentList @((Join-Path $PSScriptRoot 'fixture.mjs'),$work) -WindowStyle Hidden -PassThru
 WaitFor {Test-Path (Join-Path $work 'port.txt')} 'fixture server'
 $port=Get-Content (Join-Path $work 'port.txt');$endpoint="http://127.0.0.1:$port"
 $style=if($Visual){'Normal'}else{'Hidden'}
 $arguments=if($Fixture){@('--fixture',('"'+(Resolve-Path -LiteralPath $Fixture).Path+'"'))}else{@('--server',$endpoint)}
 $app=Start-Process (Join-Path $root 'desktop/dist/KtgaConsole.exe') -ArgumentList $arguments -WindowStyle $style -PassThru
 WaitFor {$script:window=[ConsoleNative]::FindWindow('KtgaConsoleWindow','KTGA.ME - Console de supervision');$script:window -ne [IntPtr]::Zero} 'native window'
 Start-Sleep -Milliseconds 500
 if($Fixture){
   Capture 'production-vue-ensemble'
   Click 301;Start-Sleep -Milliseconds 300;Capture 'production-services'
   Click 302;Start-Sleep -Milliseconds 300;Capture 'production-metriques'
   Write-Output 'PASS: native previews using readonly production aggregates.'
   return
 }
 Capture 'connexion'
 Fill 100 'player@example.test';Fill 101 'FixturePassword!';Click 102
 Start-Sleep -Milliseconds 800
 Check (Visible 102) 'Player must not enter supervision';Check (!(Visible 202)) 'Player must not receive authenticated interface'
 Capture 'acces-joueur-refuse'
 Fill 100 'editor@example.test';Fill 101 'FixturePassword!';Click 102
 WaitFor {Visible 202} 'editor authentication';Start-Sleep -Milliseconds 800
 Capture 'vue-ensemble'
 Click 301;Start-Sleep -Milliseconds 300;Capture 'services'
 [ConsoleNative]::SendMessage($window,0x115,[IntPtr]3,[IntPtr]::Zero) | Out-Null
 Start-Sleep -Milliseconds 300;$scroll=[ConsoleNative]::GetScrollPos($window,1);Check ($scroll -gt 0) 'Vertical scrolling must work'
 Click 200;Start-Sleep -Milliseconds 700;Check ([ConsoleNative]::GetScrollPos($window,1) -eq $scroll) 'Polling must preserve scroll'
 Capture 'workers'
 Click 302;Start-Sleep -Milliseconds 300;Capture 'metriques'
 Click 303;Start-Sleep -Milliseconds 300;Capture 'incidents'
 Click 304;Start-Sleep -Milliseconds 300;Capture 'preferences'
 [ConsoleNative]::MoveWindow($window,20,20,1000,700,$true) | Out-Null
 Click 300;Start-Sleep -Milliseconds 300;Capture 'vue-compacte'
 Click 202;WaitFor {Visible 102} 'logout'
 Fill 100 'admin@example.test';Fill 101 'FixturePassword!';Click 102
 WaitFor {Visible 105} 'administrator MFA';Capture 'double-authentification'
 Fill 104 '000000';Click 105;Start-Sleep -Milliseconds 700;Check (Visible 105) 'Wrong code must not authenticate'
 Fill 104 '123456';Click 105;WaitFor {Visible 202} 'verified administrator'
 Start-Sleep -Milliseconds 700
 Invoke-RestMethod "$endpoint/test/revoke" | Out-Null
 Click 200;WaitFor {Visible 102} 'revoked session';Capture 'session-retiree'
 $counts=Invoke-RestMethod "$endpoint/test/counts"
 Check ($counts.'/api/desktop/overview' -ge 3) 'Native requests missing'
 Check ($counts.'/api/auth/mfa/verify' -eq 2) 'MFA checks missing'
 $counts | ConvertTo-Json | Set-Content (Join-Path $output 'requests.json')
 Write-Output 'PASS: native player refusal, editor access, administrator MFA, revocation, scrolling and 10 screenshots.'
} catch {
 if($window){Capture 'echec'}
 if($endpoint){Invoke-RestMethod "$endpoint/test/counts" | ConvertTo-Json | Write-Output}
 throw
} finally {
 if($app -and !$app.HasExited){[ConsoleNative]::PostMessage($window,0x10,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null;if(!$app.WaitForExit(12000)){$app.Kill();$app.WaitForExit()}}
 if($server -and !$server.HasExited){$server.Kill();$server.WaitForExit()}
}
