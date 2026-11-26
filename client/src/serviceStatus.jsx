import React, { useEffect, useState } from "react";
import { startAutoRefresh } from "./autoRefresh.js";
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

export default function ServiceStatus() {
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [routeId, setRouteId] = useState("");
    const [tab, setTab] = useState("current");

    useEffect(() => {
        let disposed = false;
        let controller;

        async function refresh() {
            controller = new AbortController();

            const timeout = setTimeout(
                () => controller.abort(),
                15000
            );

            try {
                const response = await fetch(
                    "/api/transit/service-alerts",
                    {
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                if (!response.ok) {
                    throw new Error("Service alerts request failed.");
                }

                const payload = await response.json();

                if (
                    !Array.isArray(payload.data?.alerts) ||
                    !payload.meta?.feedUpdatedAt
                ) {
                    throw new Error("Invalid service alerts response.");
                }

                if (!disposed) {
                    setResult(payload);
                    setError("");
                }
            } catch {
                if (!disposed) {
                    setError(
                        "Could not update service alerts. Retrying automatically."
                    );
                }
            } finally {
                clearTimeout(timeout);
            }
        }

        const stop = startAutoRefresh([
            {
                name: "service-alerts",
                run: refresh,
            },
        ]);

        return () => {
            disposed = true;
            stop();
            controller?.abort();
        };
    }, []);

    const alerts = result?.data.alerts ?? [];

    const filtered = alerts.filter(
        (alert) => !routeId || alert.routeIds.includes(routeId)
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

            {result && visible.length === 0 && (
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