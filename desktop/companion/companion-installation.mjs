import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const registryKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const registryName = "KTGACompanion";
const psQuote = (value) => `'${String(value).replace(/'/g, "''")}'`;

export function companionDirectory(env = process.env, platform = process.platform) {
  return platform === "win32" ? path.join(env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "KTGACompanion") : path.join(env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "ktga-companion");
}

function powershell(script, input = "") {
  const binary = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase() === "PSMODULEPATH") delete env[key];
  const result = spawnSync(binary, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, "utf16le").toString("base64")], { input, encoding: "utf8", env, windowsHide: true, timeout: 15000 });
  if (result.error || result.status !== 0) throw new Error("La configuration Windows du compagnon a échoué.");
  return result.stdout.trim();
}

export function protectConnection(value, platform = process.platform) {
  if (platform !== "win32") return { version: 1, protected: false, data: value };
  const data = powershell("$raw=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $raw -AsPlainText -Force; [Console]::Write((ConvertFrom-SecureString $secure))", JSON.stringify(value));
  return { version: 1, protected: true, data };
}

export function unprotectConnection(value, platform = process.platform) {
  if (value?.version !== 1 || !value.data) return null;
  if (!value.protected) return platform === "win32" ? null : value.data;
  if (platform !== "win32" || typeof value.data !== "string") return null;
  const plain = powershell("$secure=ConvertTo-SecureString ([Console]::In.ReadToEnd()); $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }", value.data);
  return JSON.parse(plain);
}

export function saveConnection(session, directory = companionDirectory()) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("Répertoire du compagnon invalide.");
  const filename = path.join(directory, "connection.json");
  if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink()) throw new Error("Fichier du compagnon invalide.");
  fs.writeFileSync(filename, JSON.stringify(protectConnection(session)), { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(filename, 0o600);
}

export function loadConnection(directory = companionDirectory()) {
  try {
    const filename = path.join(directory, "connection.json"), stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink() || stat.size > 65536 || (process.platform !== "win32" && (stat.mode & 0o077))) return null;
    const session = unprotectConnection(JSON.parse(fs.readFileSync(filename, "utf8")));
    if (!/^[A-Za-z0-9_-]{43}$/.test(session?.token) || !/^\d{16,22}$/.test(session?.clientId) || !session.remember || !(Date.parse(session.expiresAt) > Date.now())) return null;
    return session;
  } catch { return null; }
}

export function forgetConnection(directory = companionDirectory(), expectedToken = null) {
  if (expectedToken) {
    try {
      const saved = unprotectConnection(JSON.parse(fs.readFileSync(path.join(directory, "connection.json"), "utf8")));
      if (saved?.token !== expectedToken) return;
    } catch { return; }
  }
  fs.rmSync(path.join(directory, "connection.json"), { force: true });
}

export function startupSpecification({ platform = process.platform, directory = companionDirectory(), node = process.execPath, configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), systemRoot = process.env.SystemRoot || "C:\\Windows" } = {}) {
  if ([directory, node, configHome, systemRoot].some((value) => /[\r\n\0"]/.test(value))) throw new Error("Chemin du compagnon invalide.");
  const paths = platform === "win32" ? path.win32 : path.posix;
  const script = paths.join(directory, "discord-presence.mjs");
  if (platform === "win32") {
    const executable = paths.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const content = `$ErrorActionPreference='Stop'; Start-Process -FilePath ${psQuote(node)} -ArgumentList ${psQuote(`"${script}" --background`)} -WindowStyle Hidden`;
    const command = `"${executable}" -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${Buffer.from(content, "utf16le").toString("base64")}`;
    return { filename: paths.join(directory, "startup.ps1"), content,
      registry: `New-Item -Path ${psQuote(registryKey)} -Force | Out-Null; New-ItemProperty -Path ${psQuote(registryKey)} -Name ${psQuote(registryName)} -Value ${psQuote(command)} -PropertyType String -Force | Out-Null` };
  }
  if (platform === "linux") {
    const quote = (value) => `"${value.replace(/\\/g, "\\\\\\\\").replace(/[$`]/g, (character) => `\\${character}`).replace(/%/g, "%%")}"`;
    return { filename: paths.join(configHome, "autostart", "me.ktga.companion.desktop"), content: `[Desktop Entry]\nType=Application\nName=KTGA Companion\nExec=${quote(node)} ${quote(script)} --background\nTerminal=false\nX-GNOME-Autostart-enabled=true\n` };
  }
  throw new Error("Le démarrage automatique est disponible sur Windows et Linux.");
}

export function installStartup(directory = companionDirectory()) {
  if (!loadConnection(directory)) throw new Error("Génère un code avec l’option 30 jours cochée dans ton profil, puis connecte le compagnon.");
  for (const name of ["discord-presence.mjs", "companion-installation.mjs"]) {
    const source = fileURLToPath(new URL(name, import.meta.url)), target = path.join(directory, name);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error("Fichier du compagnon invalide.");
    if (path.resolve(source) !== path.resolve(target)) fs.copyFileSync(source, target);
  }
  const entry = startupSpecification({ directory });
  fs.mkdirSync(path.dirname(entry.filename), { recursive: true, mode: 0o700 });
  if (fs.existsSync(entry.filename) && fs.lstatSync(entry.filename).isSymbolicLink()) throw new Error("Fichier de démarrage invalide.");
  fs.writeFileSync(entry.filename, entry.content, { mode: 0o600 });
  if (entry.registry) powershell(entry.registry);
  return path.join(directory, "discord-presence.mjs");
}

export function removeStartup(directory = companionDirectory()) {
  if (process.platform === "win32") {
    powershell(`if (Test-Path ${psQuote(registryKey)}) { Remove-ItemProperty -Path ${psQuote(registryKey)} -Name ${psQuote(registryName)} -ErrorAction SilentlyContinue }`);
    fs.rmSync(path.join(directory, "startup.ps1"), { force: true });
  } else if (process.platform === "linux") fs.rmSync(startupSpecification({ directory }).filename, { force: true });
}

export function claimInstance(directory = companionDirectory()) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "instance.json");
  function claim() {
    const file = fs.openSync(filename, "wx", 0o600);
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid })); fs.closeSync(file);
  }
  try { claim(); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error("Verrou du compagnon invalide.");
    try { process.kill(owner.pid, 0); return null; } catch (probe) { if (probe.code !== "ESRCH") return null; }
    fs.unlinkSync(filename); claim();
  }
  return () => { try { if (JSON.parse(fs.readFileSync(filename, "utf8")).pid === process.pid) fs.unlinkSync(filename); } catch {} };
}
