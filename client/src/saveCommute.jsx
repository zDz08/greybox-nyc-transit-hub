import React, { useEffect, useState } from "react";
import { useAccount } from "./accountContext.jsx";

export default function SaveCommute({ commute, onSignIn }) {
    const { session, mutation, reloadProfile, changeSavedCommute } = useAccount();
    const [notice, setNotice] = useState("");

    const saved = Boolean(
        session.profile?.savedCommutes?.some((item) => item.id === commute.id)
    );
    const needsRetry = session.status === "error";
    const disabled =
        session.status === "loading" ||
        session.status === "unavailable" ||
        mutation.busy;

    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(""), 2000);
        return () => clearTimeout(timer);
    }, [notice]);

    async function handleClick() {
        setNotice("");

        if (needsRetry) return reloadProfile();
        if (!session.user) return onSignIn();

        const success = await changeSavedCommute(commute, saved);
        if (success) {
            setNotice(saved ? "Commute removed" : "Commute saved");
        }
    }

    const label = needsRetry ? "Retry loading saved commutes" :
        session.status === "unavailable" ? "Accounts unavailable" :
        !session.user ? "Sign in to save this commute" :
        `Save commute: ${commute.stationName}, ${commute.routeId}, ${commute.directionLabel}`;

    return (
        <div className="commute-favorite">
            <span className="commute-favorite__notice" role="status">
                {notice}
            </span>

            <button
                type="button"
                className="commute-favorite__button"
                aria-label={label}
                aria-pressed={session.status === "ready" ? saved : undefined}
                title={saved ? "Remove from Saved" : label}
                disabled={disabled}
                onClick={handleClick}
            >
                {needsRetry ? (
                    <span aria-hidden="true">↻</span>
                ) : (
                    <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill={saved ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
                    </svg>
                )}
            </button>

            {mutation.error && <small role="alert">{mutation.error}</small>}
        </div>
    );
}