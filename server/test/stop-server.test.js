import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("l'arrêt sans PID cible le projet, jamais un autre serveur Node", { skip: process.platform !== "win32" }, () => {
  const scriptPath = fileURLToPath(new URL("../scripts/stop-server.ps1", import.meta.url));
  const code = `
    $ErrorActionPreference = 'Stop'
    . '${scriptPath.replaceAll("'", "''")}'
    $processes = @(
      [pscustomobject]@{ Name='node.exe'; ProcessId=1; CommandLine='node "D:\\dev\\dicegame\\server\\src\\index.js"' },
      [pscustomobject]@{ Name='node.exe'; ProcessId=2; CommandLine='node src/index.js' },
      [pscustomobject]@{ Name='node.exe'; ProcessId=3; CommandLine='node D:\\other\\server\\src\\index.js' },
      [pscustomobject]@{ Name='node.exe'; ProcessId=4; CommandLine='node src/index.js' },
      [pscustomobject]@{ Name='node.exe'; ProcessId=5; CommandLine='node D:\\dev\\dicegame\\server\\src\\index.js.backup' },
      [pscustomobject]@{ Name='other.exe'; ProcessId=6; CommandLine='D:\\dev\\dicegame\\server\\src\\index.js' },
      [pscustomobject]@{ Name='node.exe'; ProcessId=7; CommandLine='node ./server/src/index.js' },
      [pscustomobject]@{ Name='node.exe'; ProcessId=8; CommandLine='node D:\\dev\\dicegame-copy\\server\\src\\index.js' }
    )
    $absolute = @(Get-CasinoServerProcesses -ServerDir 'D:\\dev\\dicegame\\server' -Processes $processes | Select-Object -ExpandProperty ProcessId)
    $verified = @(Get-CasinoServerProcesses -ServerDir 'D:\\dev\\dicegame\\server' -Processes $processes -VerifiedListenerIds @(2,3,7) | Select-Object -ExpandProperty ProcessId)
    @{ absolute=$absolute; verified=$verified } | ConvertTo-Json -Compress
  `;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(code, "utf16le").toString("base64")], { encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout.trim());
  assert.deepEqual(data.absolute, [1], `${result.stderr}\n${code}`);
  assert.deepEqual(data.verified, [1, 2, 7]);
});
