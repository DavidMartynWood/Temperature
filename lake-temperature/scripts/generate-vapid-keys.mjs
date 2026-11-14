// Generates a VAPID key pair for Web Push. Run once, then store the output as Worker secrets:
//   node scripts/generate-vapid-keys.mjs
const { publicKey, privateKey } = await crypto.subtle.generateKey(
	{ name: "ECDSA", namedCurve: "P-256" },
	true,
	["sign", "verify"],
);
const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
const encoded = Buffer.from(publicBytes).toString("base64url");
const jwk = await crypto.subtle.exportKey("jwk", privateKey);

console.log(`VAPID_PUBLIC_KEY=${encoded}`);
console.log(`VAPID_PRIVATE_KEY=${JSON.stringify(jwk)}`);
