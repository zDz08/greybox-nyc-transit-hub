export function buildStationRoutes(active) {
    const windowStartMs = Date.parse(active.meta.windowStart);
    const windowEndMs = Date.parse(active.meta.windowEnd);

    const routesByStation = new Map();

    for (const trip of active.trips) {
        const originMs =
            Date.parse(trip.startsAt) - trip.startSeconds * 1000;

        for (const stop of trip.stops) {
            const arrivalMs =
                originMs + stop.arrivalSeconds * 1000;

            const departureMs =
                originMs + stop.departureSeconds * 1000;

            const servesWithinWindow =
                departureMs >= windowStartMs &&
                arrivalMs < windowEndMs;

            if (!servesWithinWindow) continue;

            if (!routesByStation.has(stop.stationId)) {
                routesByStation.set(stop.stationId, new Set());
            }

            routesByStation.get(stop.stationId).add(trip.routeId);
        }
    }

    return Object.fromEntries(
        [...routesByStation].map(([stationId, routeIds]) => [
            stationId,
            [...routeIds].sort(),
        ])
    );
}