import React, { useState } from "react";
import {
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { auth } from "./firebaseAuth.js";
import { useAccount } from "./accountContext.jsx";
import "./account.css";

function AccountIcon({ name, className = "" }) {
    const paths = {
        user: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20" /></>,
        bookmark: <path d="M6.5 4.5h11v16l-5.5-3.75-5.5 3.75z" />,
        check: <><circle cx="12" cy="12" r="8.25" /><path d="m8.5 12 2.25 2.25 4.75-4.75" /></>,
        refresh: <path d="M19.5 9A8 8 0 0 0 6 6L3.5 8.5M3.5 4v4.5H8M4.5 15A8 8 0 0 0 18 18l2.5-2.5M16 15.5h4.5V20" />,
        alert: <><path d="m10.5 4.5-8 14a1.7 1.7 0 0 0 1.5 2.5h16a1.7 1.7 0 0 0 1.5-2.5l-8-14a1.7 1.7 0 0 0-3 0Z" /><path d="M12 9v4.5M12 17h.01" /></>,
        exit: <path d="M10 4H5v16h5M14 8l4 4-4 4M9 12h11" />,
        arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    };
    return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {paths[name]}
    </svg>;
}

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
    const title = isSignUp ? "Make your commute yours." : isReset ? "Let's get you back in." : "Welcome back.";
    const description = isSignUp ? "Save your regular stations and directions in one place." :
        isReset ? "We'll help you reset your password using your account email." :
            "Sign in to keep your everyday commute close.";

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
        <section className="account-auth-card" aria-labelledby="account-title">
            <div className="account-auth-heading">
                <span className="account-icon-tile"><AccountIcon name="user" /></span>
                <span className="account-eyebrow">YOUR GREYBOX ACCOUNT</span>
                <h2 id="account-title">{title}</h2>
                <p>{description}</p>
            </div>
            {!isReset && <div className="account-auth-tabs" role="group" aria-label="Account access">
                <button type="button" disabled={busy} aria-pressed={!isSignUp} onClick={() => changeMode("signIn")}>Sign in</button>
                <button type="button" disabled={busy} aria-pressed={isSignUp} onClick={() => changeMode("signUp")}>Create account</button>
            </div>}
            <form onSubmit={submit}>
                <fieldset disabled={busy}>
                    <label>
                        Email address
                        <input name="email" type="email" placeholder="you@example.com" autoComplete="email" autoCapitalize="none" spellCheck={false} required />
                    </label>
                    {!isReset && <label key={title}>
                        Password
                        <input
                            name="password"
                            type="password"
                            placeholder={isSignUp ? "Create a password" : "Enter your password"}
                            autoComplete={isSignUp ? "new-password" : "current-password"}
                            minLength={isSignUp ? 6 : undefined}
                            required
                        />
                    </label>}
                    {isSignUp && <label>
                        Confirm password
                        <input name="confirmPassword" type="password" placeholder="Enter your password again" autoComplete="new-password" minLength={6} required />
                    </label>}
                    {isSignUp && <p className="account-field-hint">Use at least 6 characters for your password.</p>}
                    {error && <p className="account-form-error" role="alert">{error}</p>}
                    {notice && <p className="account-form-notice" role="status">{notice}</p>}
                    <button className="account-primary" type="submit">
                        {busy ? "Please wait…" : isReset ? "Send reset link" : isSignUp ? "Create account" : "Sign in"}
                        {!busy && <AccountIcon name="arrow" />}
                    </button>
                    {isReset && <button className="account-text-button" type="button" onClick={() => changeMode("signIn")}>Back to sign in</button>}
                    {mode === "signIn" && <button className="account-text-button" type="button" onClick={() => changeMode("reset")}>Forgot password?</button>}
                </fieldset>
            </form>
        </section>
    );
}

export default function Account() {
    const { session, reloadProfile } = useAccount();
    const [signOutError, setSignOutError] = useState("");
    const [signingOut, setSigningOut] = useState(false);

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

    if (!auth) return <div className="account"><div className="account-card account-state-message">
        <span className="account-icon-tile"><AccountIcon name="user" /></span>
        <h2>Accounts are unavailable</h2><p>Account access has not been configured for this app yet.</p>
    </div></div>;
    if (session.status === "loading" && !session.user) return <div className="account">
        <div className="account-card account-state-message" role="status">
            <span className="account-icon-tile"><AccountIcon name="refresh" className="account-spin" /></span>
            <h2>Getting things ready</h2><p>Checking your account…</p>
        </div>
    </div>;

    if (session.status === "guest") {
        return <div className="account account--guest"><AccountForm /></div>;
    }

    const syncFailed = session.status === "error";
    const syncing = session.status === "loading";
    const savedCount = session.profile?.savedCommutes.length ?? 0;
    const initial = (session.user.displayName || session.user.email || "G").trim().charAt(0).toUpperCase();

    return (
        <div className="account">
            <div className="account-card">
                <section className="account-identity" aria-labelledby="account-identity-title">
                    <div className="account-identity-top">
                        <span className="account-eyebrow">YOUR GREYBOX ACCOUNT</span>
                        <span className="account-sign-in-badge"><AccountIcon name="check" />Signed in</span>
                    </div>
                    <div className="account-profile">
                        <span className="account-avatar" aria-hidden="true">{initial}</span>
                        <div className="account-profile-text">
                            <h2 id="account-identity-title">{session.user.displayName || "Your account"}</h2>
                            <p>{session.user.email}</p>
                        </div>
                    </div>
                </section>
                <section className="account-sync" aria-labelledby="account-sync-title" aria-busy={syncing}>
                    <div className="account-section-heading">
                        <span className="account-icon-tile"><AccountIcon name="bookmark" /></span>
                        <div className="account-section-copy">
                            <h3 id="account-sync-title">Saved commutes</h3>
                            <p>Your regular stations and directions.</p>
                        </div>
                        <span className={`account-sync-badge ${syncFailed ? "is-warning" : syncing ? "is-pending" : "is-ready"}`}>
                            <span className="account-status-dot" />{syncFailed ? "Not synced" : syncing ? "Syncing" : "Synced"}
                        </span>
                    </div>
                    {syncFailed ? (
                        <div className="account-sync-warning" role="alert">
                            <AccountIcon name="alert" />
                            <div>
                                <strong>Couldn't sync your saved commutes</strong>
                                <p>You're signed in. Try again to load your saved stations and directions.</p>
                            </div>
                            <button type="button" className="account-retry" onClick={reloadProfile}><AccountIcon name="refresh" />Try again</button>
                        </div>
                    ) : syncing ? (
                        <p className="account-sync-detail" role="status"><AccountIcon name="refresh" className="account-spin" />Loading your saved commutes…</p>
                    ) : (
                        <div className="account-sync-detail">
                            <span><strong>{savedCount}</strong> {savedCount === 1 ? "saved commute" : "saved commutes"}</span>
                            <button type="button" className="account-refresh" onClick={reloadProfile}><AccountIcon name="refresh" />Refresh</button>
                        </div>
                    )}
                </section>
                <section className="account-session" aria-labelledby="account-session-title">
                    <div>
                        <h3 id="account-session-title">Account session</h3>
                        <p>Signing out won't delete your saved commutes.</p>
                    </div>
                    <button className="account-sign-out" type="button" disabled={signingOut} onClick={handleSignOut}>
                        <AccountIcon name="exit" />{signingOut ? "Signing out…" : "Sign out"}
                    </button>
                </section>
                {signOutError && <p className="account-form-error account-sign-out-error" role="alert">{signOutError}</p>}
            </div>
        </div>
    );
}
