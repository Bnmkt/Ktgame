import fs from "node:fs";
import path from "node:path";
import selfsigned from "selfsigned";

const domain = process.argv[2] || "api.ktga.me";
const certDir = path.resolve(process.cwd(), "certs");
const keyPath = path.join(certDir, `${domain}-key.pem`);
const certPath = path.join(certDir, `${domain}-cert.pem`);

fs.mkdirSync(certDir, { recursive: true });

const pems = await selfsigned.generate(
  [{ name: "commonName", value: domain }],
  {
    algorithm: "sha256",
    days: 365,
    keySize: 2048,
    extensions: [
      { name: "basicConstraints", cA: true },
      { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames: [{ type: 2, value: domain }] }
    ]
  }
);

fs.writeFileSync(keyPath, pems.private, "utf8");
fs.writeFileSync(certPath, pems.cert, "utf8");

console.log(`Created ${path.relative(process.cwd(), keyPath)}`);
console.log(`Created ${path.relative(process.cwd(), certPath)}`);
console.log("This certificate is self-signed. Browsers will not trust it unless you import it as trusted locally.");
