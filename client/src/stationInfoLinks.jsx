import React, { useEffect, useRef, useState } from "react";
import { useServiceAlerts } from "./serviceAlertsContext.jsx";
import "./stationInfoLinks.css";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

export function AccessibilityPage({ children, onBack }) {
    const heading = useRef(null);
    useEffect(() => { heading.current?.focus(); }, []);

    return (
        <section aria-label="Station accessibility">
            <div className="arrival-page__heading station-info__heading">
                <button type="button" className="arrival-back"
                    onClick={onBack} aria-label="Back to station information">←</button>
                <h3 ref={heading} tabIndex={-1}>Accessibility</h3>
            </div>
            {children}
        </section>
    );
}

export function StationInfoLinks({ routeId, onOpenAlerts, accessibilityEnabled, accessibility, onAccessibility }) {
    const { result, error } = useServiceAlerts();
    const related = (result?.data.alerts ?? []).filter(
        (alert) => routeId && alert.routeIds.includes(routeId)
    );
    const current = related.filter((alert) => alert.status === "current");
    const upcoming = related.filter((alert) => alert.status === "upcoming")
        .sort((a, b) => Date.parse(a.nextStart) - Date.parse(b.nextStart));
    const labels = {
        "fully-accessible": "Step-free access",
        "partially-accessible": "Partial step-free access",
        "not-accessible": "Not step-free",
    };
    const summary = labels[accessibility?.adaStatus] ?? "Status unavailable";
    const next = upcoming[0]?.nextStart;

    return (
        <div className="station-info-links">
            {routeId && (error || related.length > 0) && (
                <button type="button" className="station-info-link"
                    onClick={() => onOpenAlerts(routeId, current.length ? "current" : "upcoming")}>
                    <span>
                        <strong>Service alerts · {routeId}</strong>
                        <small>{error ? "Updates unavailable · View status" :
                            [
                                current.length ? `${current.length} current` : "",
                                upcoming.length ? `${upcoming.length} upcoming` : "",
                            ].filter(Boolean).join(" · ")}</small>
                        {!error && next && <small>Next change: {dateFormatter.format(new Date(next))}</small>}
                    </span>
                    <span aria-hidden="true">›</span>
                </button>
            )}
            {accessibilityEnabled && (
                <button type="button" className="station-info-link" onClick={onAccessibility}>
                    <span>
                        <strong>Accessibility</strong>
                        <small>{summary}</small>
                    </span>
                    <span aria-hidden="true">›</span>
                </button>
            )}
        </div>
    );
}

export function StationInfoOnly({ details, accessibilityEnabled, accessibility }) {
    const [open, setOpen] = useState(false);
    useEffect(() => { if (!accessibilityEnabled) setOpen(false); }, [accessibilityEnabled]);
    if (open && accessibilityEnabled) {
        return <AccessibilityPage onBack={() => setOpen(false)}>{details}</AccessibilityPage>;
    }
    return <StationInfoLinks accessibilityEnabled={accessibilityEnabled}
        accessibility={accessibility} onAccessibility={() => setOpen(true)} />;
}
