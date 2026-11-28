import React, { useEffect, useState } from "react";
import { useAccount } from "./accountContext.jsx";
import { classifyImpact } from "./commuteImpact.js";
import { useServiceAlerts } from "./serviceAlertsContext.jsx";
import "./commutePlanner.css";

const endpoint = "/api/transit/commute-planner";

async function readPlanner(query, signal) {
    const response = await fetch(endpoint + query, { signal });
    if (!response.ok) throw new Error("Could not load the subway planner.");
    return (await response.json()).data;
}

function transferLabel(count) {
    if (count === 0) return "Direct";
    return count === 1 ? "1 transfer" : `${count} transfers`;
}

function legText(leg) {
    return leg.routeId + " · " + leg.board.name + " → " + leg.exit.name;
}

export function CommutePlanner() {
    const { changeSavedCommute, mutation, session } = useAccount();
    const [open, setOpen] = useState(false);
    const [catalog, setCatalog] = useState([]);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [query, setQuery] = useState(null);
    const [options, setOptions] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const suffix = query ? "?" + new URLSearchParams(query) : "";
        setError("");
        readPlanner(suffix, controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) (query ? setOptions : setCatalog)(data);
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setError("Could not load routes. Close and reopen the planner to retry.");
            });
        return () => controller.abort();
    }, [open, query]);

    function resetResults() {
        setOptions(null);
        setQuery(null);
        setError("");
    }

    const label = (s) => s.name + " (" + s.routes.join(", ") + ") · " + s.id;
    const start = catalog.find((s) => label(s) === from);
    const end = catalog.find((s) => label(s) === to);

    return (
        <section className="app-panel commute-planner">
            <button
                className="app-primary"
                type="button"
                aria-expanded={open}
                onClick={() => {
                    resetResults();
                    setOpen(!open);
                }}
            >
                {open ? "Close planner" : "Add commute"}
            </button>
            {open && (
                <>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (start && end && start.id !== end.id) {
                                setOptions(null);
                                setQuery({ from: start.id, to: end.id });
                            }
                        }}
                    >
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
                                    onChange={(e) => {
                                        resetResults();
                                        update(e.target.value);
                                    }}
                                />
                            </label>
                        ))}
                        <datalist id="commute-stations">
                            {catalog.map((s) => (
                                <option value={label(s)} key={s.id} />
                            ))}
                        </datalist>
                        <button
                            type="submit"
                            className="app-primary"
                            disabled={!start || !end || start.id === end.id}
                        >
                            Find routes
                        </button>
                    </form>
                    <small>
                        Scheduled routes with the fewest transfers. Check live service before
                        leaving.
                    </small>
                    {error && <p role="alert">{error}</p>}
                    {!error && query && !options && <p role="status">Finding routes…</p>}
                    {options?.length === 0 && (
                        <p>No scheduled subway route found between these stations.</p>
                    )}
                    {options?.map((option) => {
                        const saved = session.profile.savedCommutes.some(
                            (c) => c.id === option.id,
                        );
                        return (
                            <div className="commute-option" key={option.id}>
                                <strong>{transferLabel(option.legs.length - 1)}</strong>
                                {option.legs.map((leg, i) => (
                                    <p key={i}>{legText(leg)}</p>
                                ))}
                                <button
                                    type="button"
                                    className="app-primary"
                                    disabled={saved || mutation.busy}
                                    onClick={() =>
                                        void changeSavedCommute({ id: option.id, ...query })
                                    }
                                >
                                    {saved ? "Saved" : "Save commute"}
                                </button>
                            </div>
                        );
                    })}
                </>
            )}
        </section>
    );
}

export function SavedItinerary({ plan, onOpen, onOpenAlerts }) {
    const { changeSavedCommute, mutation } = useAccount();
    const { result, error } = useServiceAlerts();
    return (
        <li className="app-panel commute-planner">
            <h2>
                {plan.legs[0].board.name} → {plan.legs.at(-1).exit.name}
            </h2>
            {plan.legs.map((leg, i) => {
                const mapSelection = {
                    stationId: leg.board.id,
                    stationName: leg.board.name,
                    routeId: leg.routeId,
                    stopId: leg.stopId,
                    destination: { ...leg.exit, via: leg.via },
                };
                const notices = (result?.data.alerts ?? [])
                    .map((alert) => {
                        const impact = classifyImpact(mapSelection, alert);
                        if (!impact) return null;
                        let text = impact.text;
                        if (
                            (i > 0 && impact.rank === 0) ||
                            (i < plan.legs.length - 1 && impact.rank === 1)
                        ) {
                            text =
                                "Transfer stop skipped: " +
                                (impact.rank === 0 ? leg.board.name : leg.exit.name);
                        }
                        return { alert, text, rank: impact.rank };
                    })
                    .filter(Boolean)
                    .sort((a, b) => a.rank - b.rank);
                return (
                    <div key={i} className="commute-option">
                        <strong>{legText(leg)}</strong>
                        <button
                            type="button"
                            className="app-primary"
                            onClick={() => onOpen(mapSelection)}
                        >
                            View boarding station
                        </button>
                        {notices.map(({ alert, text }) => (
                            <button
                                key={alert.id}
                                className="commute-notice"
                                type="button"
                                onClick={() => onOpenAlerts(leg.routeId, "current", alert.id)}
                            >
                                {text} · {alert.type} ›
                            </button>
                        ))}
                    </div>
                );
            })}
            {error && <small role="status">{error}</small>}
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
