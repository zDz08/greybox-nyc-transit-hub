import React, { useEffect, useState } from "react";
import {
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { auth } from "./firebaseAuth.js";
import { useAccount } from "./accountContext.jsx";
import "./account.css";

function accountErrorMessage(error, mode) {
    switch (error.code) {
        case "auth/invalid-email":
            return "Enter a valid email address.";
        case "auth/email-already-in-use":
            return "Could not create an account. Try signing in if you already have one.";
        case "auth/weak-password":
        case "auth/password-does-not-meet-requirements":
            return "Choose a stronger password and try again.";
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
            return "Check your email and password and try again.";
        case "auth/too-many-requests":
            return "Too many attempts. Please try again later.";
        case "auth/network-request-failed":
            return "Could not connect. Check your connection and try again.";
        default:
            return mode === "signUp" ? "Could not create your account." :
                mode === "reset" ? "Could not send the reset email. Please try again." : "Could not sign in.";
    }
}

function AccountForm() {
    const [mode, setMode] = useState("signIn");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const isSignUp = mode === "signUp";
    const isReset = mode === "reset";
    const title = isSignUp ? "Create account" : isReset ? "Reset password" : "Sign in";

    function changeMode(nextMode) {
        setMode(nextMode);
        setError("");
        setNotice("");
    }

    async function submit(event) {
        event.preventDefault();
        if (busy) return;

        const fields = new FormData(event.currentTarget);
        const email = fields.get("email").trim();
        const password = fields.get("password");

        setError("");
        setNotice("");
        if (isSignUp && password !== fields.get("confirmPassword")) {
            setError("Your passwords do not match. Please enter them again.");
            return;
        }

        setBusy(true);
        try {
            if (isReset) {
                await sendPasswordResetEmail(auth, email);
                setNotice("If an account exists for this email, you'll receive a password reset link. Check your spam folder too.");
            } else {
                const authenticate = isSignUp ? createUserWithEmailAndPassword : signInWithEmailAndPassword;
                await authenticate(auth, email, password);
            }
        } catch (error) {
            if (isReset && error.code === "auth/user-not-found") {
                setNotice("If an account exists for this email, you'll receive a password reset link. Check your spam folder too.");
            } else {
                setError(accountErrorMessage(error, mode));
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="account-panel" id="account-panel" aria-labelledby="account-title">
            <h2 id="account-title">{title}</h2>
            {isReset && <p className="account-help">Enter your account email to request a password reset link.</p>}
            <form onSubmit={submit}>
                <fieldset disabled={busy}>
                    <label>
                        Email
                        <input name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required />
                    </label>
                    {!isReset && <label key={title}>
                        Password
                        <input
                            name="password"
                            type="password"
                            autoComplete={isSignUp ? "new-password" : "current-password"}
                            minLength={isSignUp ? 6 : undefined}
                            required
                        />
                    </label>}
                    {isSignUp && <label>
                        Confirm password
                        <input name="confirmPassword" type="password" autoComplete="new-password" minLength={6} required />
                    </label>}
                    {error && <p role="alert">{error}</p>}
                    {notice && <p className="account-notice" role="status">{notice}</p>}
                    <button className="account-primary" type="submit">
                        {busy ? "Please wait…" : isReset ? "Send reset link" : title}
                    </button>
                    <button type="button" onClick={() => changeMode(mode === "signIn" ? "signUp" : "signIn")}>
                        {isSignUp ? "Already have an account? Sign in" : isReset ? "Back to sign in" : "New here? Create an account"}
                    </button>
                    {mode === "signIn" && <button type="button" onClick={() => changeMode("reset")}>Forgot password?</button>}
                </fieldset>
            </form>
        </section>
    );
}

export default function Account() {
    const { session, reloadProfile } = useAccount();
    const [showForm, setShowForm] = useState(false);
    const [signOutError, setSignOutError] = useState("");
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        if (session.user) setShowForm(false);
    }, [session.user]);

    async function handleSignOut() {
        if (signingOut) return;
        setSignOutError("");
        setSigningOut(true);
        try {
            await signOut(auth);
        } catch {
            setSignOutError("Could not sign out. Please try again.");
        } finally {
            setSigningOut(false);
        }
    }

    if (!auth) return <p className="account">Accounts are unavailable.</p>;
    if (session.status === "loading" && !session.user) return <p className="account" role="status">Checking account…</p>;

    if (session.status === "guest") {
        return (
            <div className="account">
                <button type="button" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>
                    {showForm ? "Close account form" : "Sign in / Sign up"}
                </button>
                {showForm && <AccountForm />}
            </div>
        );
    }

    return (
        <div className="account">
            <div className="account-actions">
                <span>Signed in as {session.user.email}</span>
                {session.status === "loading" && <span role="status">Loading saved commutes…</span>}
                {session.status === "error" && <>
                    <span role="alert">Could not load your saved commutes.</span>
                    <button type="button" onClick={reloadProfile}>Retry</button>
                </>}
                <button type="button" disabled={signingOut} onClick={handleSignOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
            </div>
            {signOutError && <p role="alert">{signOutError}</p>}
        </div>
    );
}
