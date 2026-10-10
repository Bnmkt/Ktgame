param([string]$Compiler = $env:KTGA_CXX)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $Compiler) {
    $known = Join-Path $env:TEMP 'ktga-cpp-toolchain/llvm-mingw-20261006-ucrt-x86_64/bin/clang++.exe'
    if (Test-Path -LiteralPath $known) { $Compiler = $known }
    else { $Compiler = (Get-Command clang++,g++ -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
}
if (-not $Compiler -or -not (Test-Path -LiteralPath $Compiler)) { throw 'Install an x64 MinGW-w64 C++ compiler and pass -Compiler PATH, or use CMake with Visual Studio.' }
$dependencies = Join-Path $root '.deps/nlohmann'
New-Item -ItemType Directory -Force -Path $dependencies | Out-Null
$header = Join-Path $dependencies 'json.hpp'
$expected = 'AAF127C04CB31C406E5B04A63F1AE89369FCCDE6D8FA7CDDA1ED4F32DFC5DE63'
if (-not (Test-Path -LiteralPath $header)) { Invoke-WebRequest 'https://github.com/nlohmann/json/releases/download/v3.12.0/json.hpp' -OutFile $header }
if ((Get-FileHash -LiteralPath $header -Algorithm SHA256).Hash -ne $expected) { throw 'JSON dependency checksum mismatch.' }
$output = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$arguments = @('-std=c++20','-O2','-Wall','-Wextra','-Wpedantic','-municode','-mwindows','-static','-s',
    '-DUNICODE','-D_UNICODE','-DNOMINMAX','-DWIN32_LEAN_AND_MEAN','-D_WIN32_WINNT=0x0A00',
    '-I', (Join-Path $root '.deps'), (Join-Path $root 'src/main.cpp'), (Join-Path $root 'src/api.cpp'), (Join-Path $root 'src/model.cpp'),
    '-o', (Join-Path $output 'KtgaConsole.exe'), '-lwinhttp','-lgdi32','-luser32','-lcomctl32','-lcomdlg32','-lshell32','-ldwmapi','-lole32')
& $Compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'C++ build failed.' }
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination (Join-Path $output 'README.md')
$licenses = Join-Path $output 'licenses'
New-Item -ItemType Directory -Force -Path $licenses | Out-Null
Invoke-WebRequest 'https://raw.githubusercontent.com/nlohmann/json/v3.12.0/LICENSE.MIT' -OutFile (Join-Path $licenses 'nlohmann-json-MIT.txt')
$compilerRoot = Split-Path (Split-Path $Compiler -Parent) -Parent
if (Test-Path -LiteralPath (Join-Path $compilerRoot 'LICENSE.TXT')) { Copy-Item -LiteralPath (Join-Path $compilerRoot 'LICENSE.TXT') -Destination (Join-Path $licenses 'compiler-runtime.txt') }
Write-Output (Join-Path $output 'KtgaConsole.exe')
