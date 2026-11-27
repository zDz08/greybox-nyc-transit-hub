import React, { useState } from "react";
import { useServiceAlerts } from "./serviceAlertsContext.jsx";
import { useAccount } from "./accountContext.jsx";
import { getRouteStyle } from "./routeColors.js";
import "./serviceStatus.css";

const ROUTES = [
    "1", "2", "3", "4", "5", "6", "6X", "7", "7X",
    "A", "B", "C", "D", "E", "F", "FX", "G",
    "J", "Z", "L", "M", "N", "Q", "R", "W",
    "GS", "FS", "H", "SI",
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
});

function formatTime(value) {
    return value ? dateFormatter.format(new Date(value)) : "";
}

export default function ServiceStatus({ initialRouteId = "", initialTab = "current", onSignIn }) {
    const { result, error } = useServiceAlerts();
    const { session, reloadProfile } = useAccount();
    const [routeId, setRouteId] = useState(initialRouteId);
    const [tab, setTab] = useState(initialTab);

    const alerts = result?.data.alerts ?? [];

    const savedRoutes = new Set(
        session.status === "ready"
            ? (session.profile?.savedCommutes ?? []).map((item) => item.routeId)
            : []
    );
    const savedMessage = routeId !== "saved" ? "" :
        session.status === "loading" ? "Loading saved lines…" :
        session.status === "unavailable" ? "Accounts are unavailable." :
        !session.user ? "Sign in to view alerts for your saved lines." :
        session.status === "error" ? "Could not load your saved lines." :
        !savedRoutes.size ? "Save a commute to see alerts for your lines here." : "";

    const filtered = alerts.filter((alert) =>
        routeId === "saved"
            ? alert.routeIds.some((route) => savedRoutes.has(route))
            : !routeId || alert.routeIds.includes(routeId)
    );

    const visible = filtered
        .filter((alert) => alert.status === tab)
        .sort((a, b) =>
            tab === "upcoming"
                ? Date.parse(a.nextStart) - Date.parse(b.nextStart)
                : a.title.localeCompare(b.title)
        );

    const currentCount = filtered.filter(
        (alert) => alert.status === "current"
    ).length;

    const upcomingCount = filtered.filter(
        (alert) => alert.status === "upcoming"
    ).length;

    const availableRoutes = [
        ...new Set([
            ...ROUTES,
            ...alerts.flatMap((alert) => alert.routeIds),
        ]),
    ];

    return (
        <div className="service-status">
            <div className="service-status__controls">
                <label>
                    Line
                    <select
                        value={routeId}
                        onChange={(event) => setRouteId(event.target.value)}
                    >
                        <option value="">All subway lines</option>
                        <option value="saved">Saved lines</option>
                        {availableRoutes.map((route) => (
                            <option key={route} value={route}>
                                {route}
                            </option>
                        ))}
                    </select>
                </label>

                <div
                    className="service-status__tabs"
                    role="group"
                    aria-label="Alert timeframe"
                >
                    <button
                        type="button"
                        aria-pressed={tab === "current"}
                        onClick={() => setTab("current")}
                    >
                        Current {result ? `(${currentCount})` : ""}
                    </button>

                    <button
                        type="button"
                        aria-pressed={tab === "upcoming"}
                        onClick={() => setTab("upcoming")}
                    >
                        Upcoming {result ? `(${upcomingCount})` : ""}
                    </button>
                </div>
            </div>

            {savedMessage && (
                <div className="app-panel">
                    <p role="status">{savedMessage}</p>
                    {session.status === "guest" && (
                        <button type="button" onClick={onSignIn}>Sign in</button>
                    )}
                    {session.status === "error" && (
                        <button type="button" onClick={reloadProfile}>Retry account</button>
                    )}
                </div>
            )}

            {error && (
                <p className="service-status__warning" role="alert">
                    {error}
                    {result && " Showing the last successfully loaded data."}
                </p>
            )}

            {result && (
                <p className="service-status__updated">
                    MTA updated {formatTime(result.meta.feedUpdatedAt)}
                </p>
            )}

            {!result && !error && (
                <p role="status">Fetching service updates…</p>
            )}

            {result && !savedMessage && visible.length === 0 && (
                <div className="app-panel">
                    <p>
                        {tab === "current"
                            ? "No current alerts reported for this selection."
                            : "No upcoming changes reported for this selection."}
                    </p>
                </div>
            )}

            <div className="service-status__list">
                {visible.map((alert) => (
                    <article className="app-panel service-alert" key={alert.id}>
                        <div className="service-alert__header">
                            <div
                                className="service-alert__routes"
                                aria-label="Affected lines"
                            >
                                {alert.routeIds.map((route) => (
                                    <span
                                        key={route}
                                        className="service-alert__route"
                                        style={getRouteStyle(route)}
                                        aria-label={`${route} line`}
                                    >
                                        {route}
                                    </span>
                                ))}

                                {!alert.routeIds.length && (
                                    <span>Station / network notice</span>
                                )}
                            </div>

                            <span className="service-alert__type">
                                {alert.type}
                            </span>
                        </div>

                        <h2>{alert.title}</h2>

                        {alert.status === "upcoming" && alert.nextStart && (
                            <p>Starts {formatTime(alert.nextStart)}</p>
                        )}

                        {alert.schedule && (
                            <p className="service-alert__schedule">
                                {alert.schedule}
                            </p>
                        )}

                        {alert.description &&
                            alert.description !== alert.title && (
                                <details>
                                    <summary>View details</summary>
                                    <p className="service-alert__description">
                                        {alert.description}
                                    </p>
                                </details>
                            )}
                    </article>
                ))}
            </div>
        </div>
    );
}
