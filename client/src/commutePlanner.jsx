import { readResults, writeResults } from "./commuteResultsCache.js";
import React, { useEffect, useState } from "react";
import { useAccount } from "./accountContext.jsx";
import { useServiceAlerts } from "./serviceAlertsContext.jsx";
import "./commutePlanner.css";

const endpoint = "/api/transit/commute-planner";
const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
});

function formatTime(value) {
    return timeFormatter.format(new Date(value));
}

async function readPlanner(query, signal) {
    const response = await fetch(endpoint + query, { signal, cache: "no-store" });
    const result = await response.json();
    if (!response.ok)
        throw new Error(result.error?.message ?? "Could not load the subway planner.");
    return result.data;
}

function transferLabel(count) {
    if (count === 0) return "Direct";
    return count === 1 ? "1 transfer" : `${count} transfers`;
}

function legText(leg) {
    return leg.routeId + " · " + leg.board.name + " → " + leg.exit.name;
}

function endpoints(commute) {
    return [
        commute.origin ?? commute.legs?.[0]?.board,
        commute.destination ?? commute.legs?.at(-1)?.exit,
    ];
}

export function CommutePlanner() {
    const { changeSavedCommute, mutation, session } = useAccount();
    const [open, setOpen] = useState(false);
    const [catalog, setCatalog] = useState(null);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;

        const controller = new AbortController();
        readPlanner("", controller.signal)
            .then((stations) => {
                if (!controller.signal.aborted) setCatalog(stations);
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            });

        return () => controller.abort();
    }, [open]);

    const label = (station) =>
        station.name + " (" + station.routes.join(", ") + ") · " + station.id;
    const start = catalog?.find((station) => label(station) === from);
    const end = catalog?.find((station) => label(station) === to);
    const canSave = start && end && start.id !== end.id;
    const alreadySaved =
        canSave &&
        session.profile.savedCommutes.some((commute) => {
            const [origin, destination] = endpoints(commute);
            return origin?.id === start.id && destination?.id === end.id;
        });

    async function saveStations(event) {
        event.preventDefault();
        if (!canSave || alreadySaved) return;

        if (await changeSavedCommute({ id: `pair-${start.id}:${end.id}` })) {
            setFrom("");
            setTo("");
            setOpen(false);
        }
    }

    return (
        <section className="app-panel commute-planner">
            <button
                className="app-primary"
                type="button"
                aria-expanded={open}
                onClick={() => {
                    if (open) {
                        setFrom("");
                        setTo("");
                    }
                    setError("");
                    setOpen(!open);
                }}
            >
                {open ? "Cancel" : "Add commute"}
            </button>
            {open && error && <p role="alert">{error}</p>}
            {open && !error && !catalog && <p role="status">Loading stations…</p>}
            {open && catalog && (
                <form onSubmit={saveStations}>
                    {[
                        ["From", from, setFrom],
                        ["To", to, setTo],
                    ].map(([title, value, update]) => (
                        <label key={title}>
                            {title}
                            <input
                                list="commute-stations"
                                placeholder="Choose a station"
                                value={value}
                                onChange={(event) => update(event.target.value)}
                            />
                        </label>
                    ))}
                    <datalist id="commute-stations">
                        {catalog.map((station) => (
                            <option value={label(station)} key={station.id} />
                        ))}
                    </datalist>
                    <button
                        type="submit"
                        className="app-primary"
                        disabled={!canSave || alreadySaved || mutation.busy}
                    >
                        {alreadySaved ? "Already saved" : "Save commute"}
                    </button>
                </form>
            )}
        </section>
    );
}

export function SavedItinerary({ plan, onOpen, onOpenAlerts }) {
    const { session, changeSavedCommute, mutation } = useAccount();
    const uid = session.user.uid;
    const [origin, destination] = endpoints(plan);
    const [open, setOpen] = useState(false);
    const [snapshot, setSnapshot] = useState(() => readResults(uid, plan.id));
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [retryToken, setRetryToken] = useState(0);
    const options = snapshot?.routes;

    useEffect(() => {
        if (!open) return;
        const cached = readResults(uid, plan.id);
        if (cached && !refresh) {
            setSnapshot(cached);
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        const params = new URLSearchParams({ from: origin.id, to: destination.id });
        setLoading(true);
        const generatedAt = Date.now();
        readPlanner("?" + params, controller.signal)
            .then((routes) => {
                if (controller.signal.aborted) return;
                const next = { routes, generatedAt };
                writeResults(uid, plan.id, next);
                setSnapshot(next);
                setSelected(null);
                setRefresh(false);
                setLoading(false);
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                setError(error.message);
                setLoading(false);
            });

        return () => controller.abort();
    }, [open, origin.id, destination.id, uid, plan.id, refresh, retryToken]);

    return (
        <li className="app-panel commute-planner">
            <h2>
                {origin.name} → {destination.name}
            </h2>
            <button
                type="button"
                className="app-primary"
                aria-expanded={open}
                onClick={() => {
                    setError("");
                    setRefresh(false);
                    setOpen(!open);
                }}
            >
                {open ? "Hide routes" : "View routes"}
            </button>
            {open && (
                <>
                    {error && <p role="alert">{error}</p>}
                    {snapshot && <small>Calculated {formatTime(snapshot.generatedAt)}</small>}
                    {loading && <p role="status">Finding routes…</p>}
                    {options?.length === 0 && (
                        <p>No scheduled trip arrives in the next 12 hours.</p>
                    )}
                    {(options || error) && (
                        <button
                            type="button"
                            className="saved-commute__remove"
                            disabled={loading}
                            onClick={() => {
                                setError("");
                                setRefresh(true);
                                setRetryToken((previous) => previous + 1);
                            }}
                        >
                            {error ? "Try again" : "Regenerate routes"}
                        </button>
                    )}
                    {options?.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className="commute-choice"
                            aria-pressed={selected?.id === option.id}
                            onClick={() => setSelected(option)}
                        >
                            <strong>{option.labels.join(" · ")}</strong>
                            <span>{option.legs.map((leg) => leg.routeId).join(" → ")}</span>
                            <small>
                                Arrive {formatTime(option.arrivalAt)} ·{" "}
                                {transferLabel(option.legs.length - 1)}
                            </small>
                        </button>
                    ))}
                    {selected && (
                        <ItineraryDetails
                            plan={selected}
                            onOpen={onOpen}
                            onOpenAlerts={onOpenAlerts}
                        />
                    )}
                </>
            )}
            <button
                type="button"
                className="saved-commute__remove"
                disabled={mutation.busy}
                onClick={() => void changeSavedCommute(plan, true)}
            >
                Remove commute
            </button>
        </li>
    );
}

function ItineraryDetails({ plan, onOpen, onOpenAlerts }) {
    const { result, error } = useServiceAlerts();

    return (
        <>
            {plan.legs.map((leg, i) => {
                const mapSelection = {
                    stationId: leg.board.id,
                    stationName: leg.board.name,
                    routeId: leg.routeId,
                    stopId: leg.stopId,
                };
                const lineAlerts = (result?.data.alerts ?? []).filter((alert) =>
                    alert.routeIds.includes(leg.routeId),
                );
                const tab = lineAlerts.some((alert) => alert.status === "current")
                    ? "current"
                    : "upcoming";
                return (
                    <div key={i} className="commute-option">
                        <strong>{legText(leg)}</strong>
                        <small>
                            Board {formatTime(leg.departureAt)} · Exit{" "}
                            {formatTime(leg.arrivalAt)}
                        </small>
                        <button
                            type="button"
                            className="app-primary"
                            onClick={() => onOpen(mapSelection)}
                        >
                            View boarding station
                        </button>
                        {lineAlerts.length > 0 && (
                            <button
                                className="commute-notice"
                                type="button"
                                onClick={() => onOpenAlerts(leg.routeId, tab)}
                            >
                                Service alerts · {leg.routeId} ›
                            </button>
                        )}
                    </div>
                );
            })}
            {error && <small role="status">{error}</small>}
        </>
    );
}
