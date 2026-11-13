import React, { useEffect, useState } from "react";
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { auth } from "./firebaseAuth.js";
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

async function verifySession(user, signal) {
    const token = await user.getIdToken();
    const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
    });

    if (!response.ok) throw new Error("Could not verify the session");
    const { data } = await response.json();
    return data;
}

export default function Account() {
    const [showForm, setShowForm] = useState(false);
    const [session, setSession] = useState({ status: "loading" });
    const [retry, setRetry] = useState(0);
    const [signOutError, setSignOutError] = useState("");

    useEffect(() => {
        if (!auth) return;

        let controller;
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            controller?.abort();
            if (!user) {
                setSession({ status: "guest" });
                return;
            }

            setShowForm(false);
            setSession({ status: "verifying" });
            controller = new AbortController();
            const { signal } = controller;

            try {
                const profile = await verifySession(user, signal);
                if (!signal.aborted) setSession({ status: "signed-in", profile });
            } catch {
                if (!signal.aborted) setSession({ status: "error" });
            }
        });

        return () => {
            unsubscribe();
            controller?.abort();
        };
    }, [retry]);

    async function handleSignOut() {
        setSignOutError("");
        try {
            await signOut(auth);
        } catch {
            setSignOutError("Could not sign out. Please try again.");
        }
    }

    if (!auth) return <p className="account">Accounts are unavailable.</p>;
    if (session.status === "loading") return <p className="account" role="status">Checking account…</p>;

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
                {session.status === "verifying" && <span role="status">Verifying session…</span>}
                {session.status === "signed-in" && <span>Signed in as {session.profile.email}</span>}
                {session.status === "error" && <>
                    <span role="alert">Could not verify your session.</span>
                    <button type="button" onClick={() => setRetry(retry + 1)}>Retry</button>
                </>}
                <button type="button" onClick={handleSignOut}>Sign out</button>
            </div>
            {signOutError && <p role="alert">{signOutError}</p>}
        </div>
    );
}
