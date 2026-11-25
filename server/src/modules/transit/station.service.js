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

export function buildStationDirections(active) {
    const windowStartMs = Date.parse(active.meta.windowStart);
    const windowEndMs = Date.parse(active.meta.windowEnd);

    const stations = new Map();

    for (const trip of active.trips) {
        if (!trip.headsign) continue;

        const originMs =
            Date.parse(trip.startsAt) - trip.startSeconds * 1000;

        for (const stop of trip.stops) {
            const arrivalMs =
                originMs + stop.arrivalSeconds * 1000;

            const departureMs =
                originMs + stop.departureSeconds * 1000;

            if (
                departureMs < windowStartMs ||
                arrivalMs >= windowEndMs
            ) {
                continue;
            }

            if (!stations.has(stop.stationId)) {
                stations.set(stop.stationId, new Map());
            }

            const routes = stations.get(stop.stationId);

            if (!routes.has(trip.routeId)) {
                routes.set(trip.routeId, new Map());
            }

            const platforms = routes.get(trip.routeId);

            if (!platforms.has(stop.stopId)) {
                platforms.set(stop.stopId, new Set());
            }

            platforms.get(stop.stopId).add(trip.headsign);
        }
    }

    return Object.fromEntries(
        [...stations].map(([stationId, routes]) => [
            stationId,
            Object.fromEntries(
                [...routes].map(([routeId, platforms]) => [
                    routeId,
                    Object.fromEntries(
                        [...platforms].map(([stopId, destinations]) => [
                            stopId,
                            [...destinations].sort(),
                        ])
                    ),
                ])
            ),
        ])
    );
}