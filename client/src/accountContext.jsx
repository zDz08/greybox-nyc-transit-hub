import { clearUserResults, forgetResults, initResults } from "./commuteResultsCache.js";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseAuth.js";

const AccountContext = createContext(null);

async function accountRequest(user, path, options = {}) {
    const token = await user.getIdToken();
    const signals = [AbortSignal.timeout(10000)];
    if (options.signal) signals.push(options.signal);

    const response = await fetch(path, {
        ...options,
        signal: AbortSignal.any(signals),
        cache: "no-store",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Could not load your account.");
    if (result.data?.uid !== user.uid) throw new Error("Could not verify your account.");
    return result.data;
}

export function AccountProvider({ children }) {
    const [session, setSession] = useState({ status: auth ? "loading" : "unavailable", user: null });
    const [retry, setRetry] = useState(0);
    const [mutation, setMutation] = useState({ busy: false, error: "" });
    const cacheOwner = useRef(null);
    const sessionVersion = useRef(0);
    const pendingMutation = useRef(null);

    useEffect(() => {
        if (!auth) return;
        let controller;

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (cacheOwner.current && cacheOwner.current !== user?.uid) {
                clearUserResults(cacheOwner.current);
            }
            cacheOwner.current = user?.uid ?? null;
            if (user) initResults(user.uid);
            const version = ++sessionVersion.current;
            controller?.abort();
            pendingMutation.current = null;
            setMutation({ busy: false, error: "" });
            if (!user) {
                setSession({ status: "guest", user: null });
                return;
            }

            setSession({ status: "loading", user });
            controller = new AbortController();
            const { signal } = controller;
            try {
                const profile = await accountRequest(user, "/api/users/me", { signal });
                if (version === sessionVersion.current && !signal.aborted) {
                    setSession({ status: "ready", user, profile });
                }
            } catch {
                if (version === sessionVersion.current && !signal.aborted) {
                    setSession({ status: "error", user });
                }
            }
        });

        return () => {
            ++sessionVersion.current;
            unsubscribe();
            controller?.abort();
        };
    }, [retry]);

    async function changeSavedCommute(commute, remove = false) {
        if (session.status !== "ready" || pendingMutation.current) return false;

        const operation = {};
        const version = sessionVersion.current;
        pendingMutation.current = operation;
        setMutation({ busy: true, error: "" });

        try {
            const profile = await accountRequest(
                session.user,
                `/api/users/me/saved-commutes/${encodeURIComponent(commute.id)}`,
                {
                    method: remove ? "DELETE" : "PUT",
                    body: remove ? undefined : JSON.stringify(commute),
                }
            );
            if (version === sessionVersion.current) {
                if (remove) forgetResults(session.user.uid, commute.id);
                setSession({ ...session, profile });
                return true;
            }
        } catch {
            if (version === sessionVersion.current) {
                setMutation({ busy: false, error: "Could not update your saved commutes. Please try again." });
            }
        } finally {
            if (pendingMutation.current === operation) {
                pendingMutation.current = null;
                setMutation((previous) => ({ ...previous, busy: false }));
            }
        }
        return false;
    }

    return (
        <AccountContext.Provider value={{
            session,
            mutation,
            reloadProfile: () => setRetry((previous) => previous + 1),
            changeSavedCommute,
        }}>
            {children}
        </AccountContext.Provider>
    );
}

export function useAccount() {
    return useContext(AccountContext);
}
