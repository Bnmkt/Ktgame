import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { encodeCBOR } from "@levischuck/tiny-cbor";

const digest = value => createHash("sha256").update(value).digest();
const encoded = value => Buffer.from(value).toString("base64url");
export function virtualPasskey(userId) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x, "base64url"))], [-3, new Uint8Array(Buffer.from(jwk.y, "base64url"))]]);
  const credentialId = randomBytes(32), publicKeyBytes = Buffer.from(encodeCBOR(cose));
  const credential = { id: encoded(credentialId), publicKey: publicKeyBytes, counter: 0, transports: ["internal"] };
  return {
    credential,
    info: { credential, credentialDeviceType: "singleDevice", credentialBackedUp: false, userVerified: true },
    registration(options, { origin = "https://www.ktga.me", rpID = "www.ktga.me", uv = true } = {}) {
      const length = Buffer.alloc(2); length.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([digest(rpID), Buffer.from([uv ? 0x45 : 0x41]), Buffer.alloc(4), Buffer.alloc(16), length, credentialId, publicKeyBytes]);
      return { id: credential.id, rawId: credential.id, type: "public-key", response: { clientDataJSON: encoded(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin })), attestationObject: encoded(encodeCBOR(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", new Uint8Array(authData)]]))), transports: ["internal"] }, clientExtensionResults: { credProps: { rk: true } } };
    },
    assertion(options, { origin = "https://www.ktga.me", rpID = "www.ktga.me", uv = true, counter = 1 } = {}) {
      const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin }));
      const count = Buffer.alloc(4); count.writeUInt32BE(counter);
      const authData = Buffer.concat([digest(rpID), Buffer.from([uv ? 5 : 1]), count]);
      return { id: credential.id, rawId: credential.id, type: "public-key", response: { clientDataJSON: encoded(clientData), authenticatorData: encoded(authData), signature: encoded(sign("sha256", Buffer.concat([authData, digest(clientData)]), privateKey)), userHandle: encoded(digest(`ktga:passkey:${userId}`)) }, clientExtensionResults: {} };
    }
  };
}
