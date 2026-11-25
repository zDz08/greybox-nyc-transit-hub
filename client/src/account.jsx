import React, { useEffect, useState } from "react";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { auth } from "./firebaseAuth.js";
import { useAccount } from "./accountContext.jsx";
import "./account.css";

function accountErrorMessage(error, isSignUp) {
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
            return isSignUp ? "Could not create your account." : "Could not sign in.";
    }
}

function AccountForm() {
    const [isSignUp, setIsSignUp] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const title = isSignUp ? "Create account" : "Sign in";

    async function submit(event) {
        event.preventDefault();
        if (busy) return;

        const fields = new FormData(event.currentTarget);
        const email = fields.get("email").trim();
        const password = fields.get("password");
        const authenticate = isSignUp ? createUserWithEmailAndPassword : signInWithEmailAndPassword;

        setError("");
        setBusy(true);
        try {
            await authenticate(auth, email, password);
        } catch (error) {
            setError(accountErrorMessage(error, isSignUp));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="account-panel" id="account-panel" aria-labelledby="account-title">
            <h2 id="account-title">{title}</h2>
            <form onSubmit={submit}>
                <fieldset disabled={busy}>
                    <label>
                        Email
                        <input name="email" type="email" autoComplete="email" required />
                    </label>
                    <label key={title}>
                        Password
                        <input
                            name="password"
                            type="password"
                            autoComplete={isSignUp ? "new-password" : "current-password"}
                            minLength={isSignUp ? 6 : undefined}
                            required
                        />
                    </label>
                    {error && <p role="alert">{error}</p>}
                    <button className="account-primary" type="submit">
                        {busy ? "Please wait…" : title}
                    </button>
                    <button type="button" onClick={() => {
                        setIsSignUp(!isSignUp);
                        setError("");
                    }}>
                        {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
                    </button>
                </fieldset>
            </form>
        </section>
    );
}

export default function Account() {
    const { session, reloadProfile } = useAccount();
    const [showForm, setShowForm] = useState(false);
    const [signOutError, setSignOutError] = useState("");

    useEffect(() => {
        if (session.user) setShowForm(false);
    }, [session.user]);

    async function handleSignOut() {
        setSignOutError("");
        try {
            await signOut(auth);
        } catch {
            setSignOutError("Could not sign out. Please try again.");
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
                <button type="button" onClick={handleSignOut}>Sign out</button>
            </div>
            {signOutError && <p role="alert">{signOutError}</p>}
        </div>
    );
}
