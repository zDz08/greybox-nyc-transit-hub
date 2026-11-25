import { useEffect, useState } from "react";
import SaveCommute from "./saveCommute.jsx";

function getDirectionLabel(stopId, labels, destinationLabels) {
    const destinations = destinationLabels?.[stopId];

    if (Array.isArray(destinations) && destinations.length > 0) {
        return `${destinations.join(" / ")}`;
    }

    const direction = stopId.slice(-1);

    if (direction === "N") {
        return labels?.N || "Northbound";
    }

    if (direction === "S") {
        return labels?.S || "Southbound";
    }

    return `Platform ${stopId}`;
}

function getMinutes(arrival, now) {
    return Math.max(
        0,
        Math.floor((Date.parse(arrival.predictedAt) - now) / 60000)
    );
}

export default function StationArrivals({
    stationId,
    stationName,
    routeId,
    directionLabels,
    destinationLabels,
    refreshRef,
    initialStopId,
    onSignIn,
}) {
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [selectedStopId, setSelectedStopId] = useState(
        initialStopId || `${stationId}N`
    );
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (initialStopId) setSelectedStopId(initialStopId);
    }, [initialStopId]);

    useEffect(() => {
        let disposed = false;
        let pending = false;
        let controller;

        async function refreshArrivals() {
            if (disposed || pending) return;

            pending = true;
            controller = new AbortController();

            const timeout = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch(
                    `/api/transit/stations/${encodeURIComponent(stationId)}` +
                    `/arrivals?routeId=${encodeURIComponent(routeId)}`,
                    {
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        `Arrivals request failed: HTTP ${response.status}`
                    );
                }

                const payload = await response.json();

                if (
                    payload.data?.stationId !== stationId ||
                    payload.data?.routeId !== routeId ||
                    !Array.isArray(payload.data?.directions) ||
                    !Number.isFinite(Date.parse(payload.meta?.feedUpdatedAt))
                ) {
                    throw new Error("Invalid arrivals response");
                }

                if (disposed) return;

                setResult(payload);
                setError("");
                setNow(Date.now());

                setSelectedStopId((previous) =>
                    payload.data.directions.some(
                        (direction) => direction.stopId === previous
                    )
                        ? previous
                        : payload.data.directions[0]?.stopId ?? null
                );
            } catch (requestError) {
                if (disposed) return;

                console.error("Could not load arrivals:", requestError);
                setError("Realtime predictions are temporarily unavailable.");
            } finally {
                clearTimeout(timeout);
                pending = false;
            }
        }

        refreshRef.current = refreshArrivals;
        void refreshArrivals();

        return () => {
            disposed = true;
            controller?.abort();

            if (refreshRef.current === refreshArrivals) {
                refreshRef.current = null;
            }
        };
    }, [stationId, routeId, refreshRef]);

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const feedAge = result
        ? now - Date.parse(result.meta.feedUpdatedAt)
        : null;

    const stale =
        feedAge !== null &&
        (feedAge > 120000 || feedAge < -60000);
    
    const directions = result?.data.directions ?? [
        { stopId: `${stationId}N`, arrivals: [] },
        { stopId: `${stationId}S`, arrivals: [] },
    ];

    const canShowPredictions = Boolean(result) && !error && !stale;

    return (
        <section className="station-arrivals" aria-label="Train directions">
            <div className="station-arrivals__header">
                <strong>Train directions</strong>

                {canShowPredictions && (
                    <span className="station-arrivals__live">
                        Live estimates
                    </span>
                )}
            </div>

            <div className="direction-list">
                {directions.map((direction) => {
                    const arrivals = canShowPredictions
                        ? direction.arrivals.filter(
                            (arrival) =>
                                Date.parse(arrival.predictedAt) >= now
                        )
                        : [];

                    const first = arrivals[0];
                    const following = arrivals.slice(1);
                    const minutes = first ? getMinutes(first, now) : null;

                    let detail = "\u00A0";

                    if (first) {
                        detail =
                            first.eventType === "departure"
                                ? "Departure estimate"
                                : "Arrival estimate";

                        if (following.length > 0) {
                            detail += ` · Then ${following
                                .map((arrival) => getMinutes(arrival, now))
                                .join(", ")} min`;
                        }
                    } else if (canShowPredictions) {
                        detail = "No predictions available";
                    }

                    return (
                        <button
                            key={direction.stopId}
                            type="button"
                            className="direction-card"
                            aria-pressed={
                                selectedStopId === direction.stopId
                            }
                            onClick={() =>
                                setSelectedStopId(direction.stopId)
                            }
                        >
                            <span
                                className="direction-card__arrow"
                                aria-hidden="true"
                            >
                                →
                            </span>

                            <span className="direction-card__body">
                                <strong>
                                    {getDirectionLabel(
                                        direction.stopId,
                                        directionLabels,
                                        destinationLabels
                                    )}
                                </strong>

                                <span className="direction-card__detail">
                                    {detail}
                                </span>
                            </span>

                            <span className="direction-card__time">
                                <strong>
                                    {minutes === null
                                        ? "—"
                                        : minutes}
                                </strong>

                                {minutes !== null && (
                                    <span>min</span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>

            {selectedStopId && (
                <SaveCommute
                    onSignIn={onSignIn}
                    commute={{
                        id: `${stationId}:${routeId}:${selectedStopId}`,
                        stationId,
                        stationName,
                        routeId,
                        stopId: selectedStopId,
                        directionLabel: getDirectionLabel(selectedStopId, directionLabels, destinationLabels),
                    }}
                />
            )}

            {error || stale ? (
                <p role="status" className="route-selection__note">
                    {error
                        ? "Realtime predictions unavailable."
                        : "Predictions outdated."}
                </p>
            ) : result && directions.length === 0 ? (
                <p className="route-selection__note">
                    No direction information available.
                </p>
            ) : null}

            {result && (
                <p className="route-selection__note">
                    Updated{" "}
                    {new Date(result.meta.feedUpdatedAt).toLocaleTimeString(
                        "en-US",
                        {
                            timeZone: "America/New_York",
                            hour: "numeric",
                            minute: "2-digit",
                            second: "2-digit",
                            timeZoneName: "short",
                        }
                    )}
                </p>
            )}
        </section>
    );
}
