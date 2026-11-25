import React from "react";
import { useAccount } from "./accountContext.jsx";

export default function SaveCommute({ commute, onSignIn }) {
    const { session, mutation, reloadProfile, changeSavedCommute } = useAccount();
    const saved = session.profile?.savedCommutes.some((item) => item.id === commute.id);

    if (session.status === "error") {
        return <button type="button" className="save-commute" onClick={reloadProfile}>Retry saved commutes</button>;
    }

    return (
        <div className="save-commute-actions">
            <button
                type="button"
                className="save-commute"
                aria-pressed={Boolean(saved)}
                disabled={session.status === "loading" || mutation.busy}
                onClick={() => {
                    if (!session.user) onSignIn();
                    else void changeSavedCommute(commute, saved);
                }}
            >
                {session.status === "loading" ? "Loading account…" :
                    !session.user ? "Sign in to save this direction" :
                    saved ? "Remove from Saved" : "Save this direction"}
            </button>
            {mutation.error && <p role="alert">{mutation.error}</p>}
        </div>
    );
}
