import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const invalidTokenCodes = new Set([
    "auth/argument-error",
    "auth/invalid-argument",
    "auth/invalid-id-token",
    "auth/id-token-expired",
]);

if (process.env.FIREBASE_AUTH_EMULATOR_HOST && !["development", "test"].includes(process.env.NODE_ENV)) {
    throw new Error("The Firebase Auth emulator is only allowed in development or test");
}

let firebaseAuth;

function rejectToken(res) {
    res.set("WWW-Authenticate", "Bearer");
    return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "A valid Firebase ID token is required" },
    });
}

export async function requireAuth(req, res, next) {
    const token = req.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return rejectToken(res);

    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
        try {
            firebaseAuth ??= getAuth(initializeApp({ projectId }));
            req.auth = await firebaseAuth.verifyIdToken(token);
            return next();
        } catch (error) {
            if (invalidTokenCodes.has(error.code)) return rejectToken(res);
            console.error("Firebase token verification failed:", error.code);
        }
    }

    return res.status(503).json({
        error: { code: "AUTH_UNAVAILABLE", message: "Account verification is unavailable" },
    });
}
