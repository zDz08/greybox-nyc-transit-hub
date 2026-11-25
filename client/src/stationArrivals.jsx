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
    stationDetails,
}) {
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [selectedStopId, setSelectedStopId] = useState(
        initialStopId ?? null
    );
    const [selectedArrivalId, setSelectedArrivalId] = useState(null);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        setSelectedStopId(initialStopId ?? null);
        setSelectedArrivalId(null);
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

    function upcomingArrivals(direction) {
        if (!canShowPredictions) return [];

        return (direction?.arrivals ?? []).filter(
            (arrival) => Date.parse(arrival.predictedAt) >= now
        );
    }

    const selectedDirection = directions.find(
        (direction) => direction.stopId === selectedStopId
    );

    const upcoming = upcomingArrivals(selectedDirection);

    const selectedArrival = upcoming.find(
        (arrival) => arrival.id === selectedArrivalId
    );

    const directionLabel = selectedStopId
        ? getDirectionLabel(
            selectedStopId,
            directionLabels,
            destinationLabels
        )
        : "";

    const pageTitle = selectedArrivalId
        ? "Remaining stops"
        : selectedStopId
            ? "Upcoming trains"
            : "Train directions";

    function goBack() {
        if (selectedArrivalId) {
            setSelectedArrivalId(null);
        } else {
            setSelectedStopId(null);
        }
    }

    return (
        <section className="station-arrivals" aria-label={pageTitle}>
            <div className="station-arrivals__header">
                <div className="arrival-page__heading">
                    {selectedStopId && (
                        <button
                            type="button"
                            className="arrival-back"
                            onClick={goBack}
                            aria-label={
                                selectedArrivalId
                                    ? "Back to upcoming trains"
                                    : "Back to directions"
                            }
                        >
                            ←
                        </button>
                    )}
                    <strong>{pageTitle}</strong>
                </div>

                {canShowPredictions && (
                    <span className="station-arrivals__live">
                        Live estimates
                    </span>
                )}
            </div>

            {!selectedStopId ? (
                <div className="direction-list">
                    {directions.map((direction) => {
                        const arrivals = upcomingArrivals(direction);
                        const first = arrivals[0];
                        const following = arrivals.slice(1, 3);

                        const detail = first
                            ? following.length > 0
                                ? `Then ${following
                                    .map((arrival) => getMinutes(arrival, now))
                                    .join(", ")} min`
                                : "Next arrival"
                            : canShowPredictions
                                ? "No predictions available"
                                : "\u00A0";

                        return (
                            <button
                                key={direction.stopId}
                                type="button"
                                className="direction-card"
                                onClick={() => {
                                    setSelectedStopId(direction.stopId);
                                    setSelectedArrivalId(null);
                                }}
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
                                        {first ? getMinutes(first, now) : "—"}
                                    </strong>
                                    {first && <span>min</span>}
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : !selectedArrivalId ? (
                <>
                    <p className="arrival-page__subtitle">
                        {directionLabel}
                    </p>

                    <div className="trip-list">
                        {upcoming.map((arrival) => (
                            <button
                                key={arrival.id}
                                type="button"
                                className="trip-row"
                                onClick={() => setSelectedArrivalId(arrival.id)}
                            >
                                <span className="trip-row__body">
                                    <strong>
                                        {arrival.destination?.name ??
                                            "Destination unavailable"}
                                    </strong>
                                    <span>
                                        {formatArrivalTime(arrival.predictedAt)}
                                        {" · "}
                                        {arrival.remainingStops?.length ?? 0} stops
                                    </span>
                                </span>

                                <span className="direction-card__time">
                                    <strong>{getMinutes(arrival, now)}</strong>
                                    <span>min</span>
                                </span>
                            </button>
                        ))}
                    </div>

                    {canShowPredictions && upcoming.length === 0 && (
                        <p role="status" className="route-selection__note">
                            No upcoming predictions for this direction.
                        </p>
                    )}

                    <SaveCommute
                        onSignIn={onSignIn}
                        commute={{
                            id: `${stationId}:${routeId}:${selectedStopId}`,
                            stationId,
                            stationName,
                            routeId,
                            stopId: selectedStopId,
                            directionLabel,
                        }}
                    />
                </>
            ) : selectedArrival ? (
                <>
                    <div className="trip-summary">
                        <strong>
                            {selectedArrival.destination?.name ??
                                "Destination unavailable"}
                        </strong>
                        <span>
                            {getMinutes(selectedArrival, now)} min
                            {" · "}
                            {formatArrivalTime(selectedArrival.predictedAt)}
                            {" at "}
                            {stationName}
                        </span>
                    </div>

                    <ol className="trip-stops">
                        {(selectedArrival.remainingStops ?? []).map(
                            (stop, index) => (
                                <li
                                    key={`${stop.stopId ?? "unknown"}:${index}`}
                                >
                                    <span className="trip-stops__number">
                                        {index + 1}
                                    </span>

                                    <span className="trip-stops__name">
                                        {stop.name ??
                                            `Unknown stop (${stop.stopId ?? "—"})`}
                                        {index === 0 && (
                                            <small>Selected station</small>
                                        )}
                                    </span>

                                    <span className="trip-stops__time">
                                        {formatArrivalTime(stop.arrivalAt)}
                                    </span>
                                </li>
                            )
                        )}
                    </ol>
                </>
            ) : (
                <p role="status" className="route-selection__note">
                    {canShowPredictions
                        ? "This train is no longer in the current predictions. Go back to choose another train."
                        : "This train's predictions are temporarily unavailable."}
                </p>
            )}

            {(error || stale) && (
                <p role="status" className="route-selection__note">
                    {error
                        ? "Realtime predictions unavailable."
                        : "Predictions outdated."}
                </p>
            )}

            {!selectedStopId && result && directions.length === 0 && (
                <p className="route-selection__note">
                    No direction information available.
                </p>
            )}

            {result && (
                <p className="route-selection__note">
                    Updated {formatArrivalTime(result.meta.feedUpdatedAt)}
                    {" · New York time"}
                </p>
            )}
            {selectedStopId === null && stationDetails}
        </section>
    );
}

function formatArrivalTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
    });
}
