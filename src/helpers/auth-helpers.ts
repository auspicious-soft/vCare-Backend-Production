import axios from "axios";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import jwkToPem from "jwk-to-pem";

export const hashToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export async function verifyAppleToken(idToken: string) {
  const appleKeys = await axios.get("https://appleid.apple.com/auth/keys");
  const decodedHeader: any = jwt.decode(idToken, { complete: true })?.header;
  const key = appleKeys.data.keys.find((k: any) => k.kid === decodedHeader.kid);

  if (!key) throw new Error("Apple public key not found");

  const pubKey = jwkToPem(key);
  const payload: any = jwt.verify(idToken, pubKey, {
    algorithms: ["RS256"],
  });

  if (payload.iss !== "https://appleid.apple.com") {
    throw new Error("Invalid Apple token issuer");
  }

  return payload;
}