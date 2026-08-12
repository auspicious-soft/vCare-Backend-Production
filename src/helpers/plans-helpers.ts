import axios from "axios";
import { jwtVerify, importJWK, importX509 } from "jose";

export async function decodeSignedPayload(signedPayload: any) {
	try {
		const headerB64 = signedPayload.split(".")[0];
		if (!headerB64) {
			throw new Error("Invalid signed payload");
		}

		const header = JSON.parse(Buffer.from(headerB64, "base64").toString("utf8"));
		let publicKey;

		if (header.x5c && header.x5c.length > 0) {
			// ✅ Case 1: Certificate chain provided in the header
			const cert = `-----BEGIN CERTIFICATE-----\n${header.x5c[0]}\n-----END CERTIFICATE-----`;
			publicKey = await importX509(cert, header.alg);
			console.log("✅ Using x5c public certificate from header");
		} else if (header.kid) {
			// ✅ Case 2: Only key ID provided → fetch Apple JWKS
			const { data } = await axios.get("https://apple-public.keys.appstoreconnect.apple.com/keys");
			const appleKey = data.keys.find((k: any) => k.kid === header.kid);
			if (!appleKey) throw new Error(`Apple public key not found for kid: ${header.kid}`);
			publicKey = await importJWK(appleKey, "ES256");
			console.log("✅ Using Apple JWKS public key");
		} else {
			throw new Error("No valid public key source found (x5c or kid missing)");
		}

		const { payload } = await jwtVerify(signedPayload, publicKey);
		return {
			...payload
		};
	} catch (err) {
		console.error("⚠️ Failed to decode signed payload:", err);
		return null;
	}
}
