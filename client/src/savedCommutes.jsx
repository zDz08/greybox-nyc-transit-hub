import React from "react";
import { useAccount } from "./accountContext.jsx";
import { getRouteStyle } from "./routeColors.js";

export default function SavedCommutes({ onOpen, onSignIn, onExplore }) {
    const { session, mutation, reloadProfile, changeSavedCommute } = useAccount();

    if (session.status === "loading") return <p role="status">Loading saved commutes…</p>;
    if (!session.user) {
        return (
            <div className="app-panel app-empty">
                <p>Sign in to save your regular stations and directions.</p>
                <button type="button" className="app-primary" onClick={onSignIn}>Go to account</button>
            </div>
        );
    }
    if (session.status === "error") {
        return (
            <div className="app-panel">
                <p role="alert">Could not load your saved commutes.</p>
                <button type="button" className="app-primary" onClick={reloadProfile}>Retry</button>
            </div>
        );
    }

    const commutes = session.profile.savedCommutes;
    return (
        <>
            {mutation.error && <p role="alert">{mutation.error}</p>}
            {commutes.length === 0 ? (
                <div className="app-panel app-empty">
                    <p>Choose a station, line, and direction on the map to save your commute.</p>
                    <button type="button" className="app-primary" onClick={onExplore}>Explore the map</button>
                </div>
            ) : (
                <ul className="saved-commutes">
                    {commutes.map((commute) => (
                        <li className="app-panel saved-commute" key={commute.id}>
                            <span className="route-badge saved-commute__line" style={getRouteStyle(commute.routeId)}>{commute.routeId}</span>
                            <div className="saved-commute__details">
                                <h2>{commute.stationName}</h2>
                                <p>{commute.directionLabel}</p>
                                <div className="saved-commute__actions">
                                    <button type="button" className="app-primary" onClick={() => onOpen(commute)}>View on map</button>
                                    <button
                                        type="button"
                                        className="saved-commute__remove"
                                        aria-label={`Remove ${commute.stationName}, line ${commute.routeId}, ${commute.directionLabel}`}
                                        disabled={mutation.busy}
                                        onClick={() => void changeSavedCommute(commute, true)}
                                    >Remove</button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
