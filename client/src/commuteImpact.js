// A selector can include transfer alternatives. Confirm the stop in the headline too.
export function classifyImpact(c, alert) {
    if (alert.status !== "current" || !alert.routeIds.includes(c.routeId)) return null;

    const targets = (alert.targets ?? []).filter((t) => t.routeId === c.routeId);
    const south = c.stopId.endsWith("S");

    const match = alert.title.match(/\b(uptown|downtown)\s+\[1\]\s+skips?\s+(.+)$/i);

    const precise = c.routeId === "1" && match && alert.type === "Planned - Stops Skipped";

    if (precise && (match[1].toLowerCase() === "downtown") !== south) return null;

    if (!precise) return { rank: 3, text: "Line notice · impact on your trip unconfirmed" };

    const names = match[2]
        .replace(/[.!]$/, "")
        .split(/,\s*|\s+and\s+/i)
        .map((n) => n.trim().toLowerCase());

    const hits = (s) =>
        s &&
        names.includes(s.name.toLowerCase()) &&
        targets.some(
            (t) =>
                !t.tripId &&
                !t.startTime &&
                !t.startDate &&
                t.routeType == null &&
                t.directionId != null &&
                Number(t.directionId) === (south ? 1 : 0) &&
                (t.stopId === s.id || t.stopId === s.id + (south ? "S" : "N")),
        );

    if (hits({ id: c.stationId, name: c.stationName }))
        return { rank: 0, text: "Boarding stop skipped: " + c.stationName };

    if (hits(c.destination))
        return { rank: 1, text: "Exit stop skipped: " + c.destination.name };

    const via = c.destination?.via.filter(hits) ?? [];

    if (via.length)
        return {
            rank: 2,
            text: "Skipped along your commute: " + via.map((s) => s.name).join(", "),
        };

    return {
        rank: 3,
        text: "Line notice · no confirmed match to your saved stops",
    };
}
