import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { getStationIdByStopId, getStopDetailsById } from "./gtfsStops.js";
import { orderStopUpdates, buildRemainingStops } from "./realtimeTrip.mapper.js";
import { getTripPath } from "./tripPath.service.js";

const FEED_BASE =
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F";

const feedGroups = [
    { suffix: "gtfs", routes: ["1", "2", "3", "4", "5", "6", "6X", "7", "7X", "GS"] },
    { suffix: "gtfs-ace", routes: ["A", "C", "E", "H"] },
    { suffix: "gtfs-bdfm", routes: ["B", "D", "F", "FX", "M", "FS"] },
    { suffix: "gtfs-g", routes: ["G"] },
    { suffix: "gtfs-jz", routes: ["J", "Z"] },
    { suffix: "gtfs-l", routes: ["L"] },
    { suffix: "gtfs-nqrw", routes: ["N", "Q", "R", "W"] },
    { suffix: "gtfs-si", routes: ["SI"] },
];

const feedsByRoute = new Map(
    feedGroups.flatMap(({ suffix, routes }) =>
        routes.map((routeId) => [routeId, suffix])
    )
);

const feedCache = new Map();
const pendingRequests = new Map();

function serviceError(code, message, status) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

async function fetchFeed(suffix) {
    const response = await fetch(`${FEED_BASE}${suffix}`, {
        signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
        throw new Error(`MTA feed request failed: HTTP ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    const message =
        GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);

    return GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(
        message,
        {
            longs: String,
            enums: String,
        }
    );
}

async function getFeed(suffix) {
    const cached = feedCache.get(suffix);

    if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
    }

    if (pendingRequests.has(suffix)) {
        return pendingRequests.get(suffix);
    }

    const request = fetchFeed(suffix)
        .then((data) => {
            feedCache.set(suffix, {
                data,
                expiresAt: Date.now() + 15000,
            });

            return data;
        })
        .finally(() => {
            pendingRequests.delete(suffix);
        });

    pendingRequests.set(suffix, request);

    return request;
}

export async function getArrivals(stationId, routeId) {
    const suffix = feedsByRoute.get(routeId);

    if (!suffix) {
        throw serviceError(
            "UNSUPPORTED_REALTIME_ROUTE",
            "Realtime predictions are not configured for this route.",
            400
        );
    }

    const [stationIds, stopDetails] = await Promise.all([
        getStationIdByStopId(),
        getStopDetailsById(),
    ]);

    if (stationIds.get(stationId) !== stationId) {
        throw serviceError(
            "UNKNOWN_STATION",
            "Unknown station ID.",
            404
        );
    }

    let feed;

    try {
        feed = await getFeed(suffix);
    } catch (error) {
        console.error("MTA realtime request failed:", error);

        throw serviceError(
            "REALTIME_UNAVAILABLE",
            "Realtime predictions are temporarily unavailable.",
            502
        );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const feedTimestamp = Number(feed.header?.timestamp);

    if (
        !Number.isFinite(feedTimestamp) ||
        nowSeconds - feedTimestamp > 120 ||
        feedTimestamp - nowSeconds > 60
    ) {
        throw serviceError(
            "REALTIME_STALE",
            "Realtime predictions are outdated or have an invalid timestamp.",
            503
        );
    }

    const directions = new Map();

    for (const [stopId, parentId] of stationIds) {
        if (parentId !== stationId || stopId === stationId) continue;

        directions.set(stopId, {
            stopId,
            arrivals: [],
        });
    }

    const seen = new Set();

    for (const entity of feed.entity ?? []) {
        if (entity.isDeleted) continue;

        const update = entity.tripUpdate;
        const trip = update?.trip;

        if (
            !trip ||
            trip.routeId !== routeId ||
            !trip.tripId
        ) {
            continue;
        }

        if (
            trip.scheduleRelationship === "CANCELED" ||
            trip.scheduleRelationship === "DELETED"
        ) {
            continue;
        }

        const orderedStops = orderStopUpdates(
            update.stopTimeUpdate ?? []
        );

        const tripKey = JSON.stringify([
            routeId,
            trip.tripId,
            trip.startDate ?? null,
            trip.startTime ?? null,
        ]);

        for (const [index, stop] of orderedStops.entries()) {
            const direction = directions.get(stop.stopId);

            if (!direction) continue;

            if (
                stop.scheduleRelationship === "SKIPPED" ||
                stop.scheduleRelationship === "NO_DATA"
            ) {
                continue;
            }

            const predictedTime = Number(stop.arrival?.time);

            if (
                !Number.isFinite(predictedTime) ||
                predictedTime <= 0 ||
                predictedTime < nowSeconds
            ) {
                continue;
            }

            const callKey = JSON.stringify([
                tripKey,
                stop.stopId,
                stop.stopSequence ?? null,
            ]);

            if (seen.has(callKey)) continue;
            seen.add(callKey);

            const remainingStops = buildRemainingStops(
                orderedStops,
                index,
                stopDetails,
                stationIds
            );

            const lastStop = remainingStops.at(-1);

            direction.arrivals.push({
                id: callKey,
                tripKey,
                tripId: trip.tripId,
                startDate: trip.startDate ?? null,
                routeId,
                stopId: stop.stopId,
                predictedAt: new Date(
                    predictedTime * 1000
                ).toISOString(),
                minutesAway: Math.floor(
                    (predictedTime - nowSeconds) / 60
                ),
                eventType: "arrival",
                destination: lastStop
                    ? {
                        stopId: lastStop.stopId,
                        stationId: lastStop.stationId,
                        name: lastStop.name,
                    }
                    : null,
                remainingStops,
            });
        }
    }

    for (const direction of directions.values()) {
        direction.arrivals.sort(
            (a, b) => Date.parse(a.predictedAt) - Date.parse(b.predictedAt)
        );

        direction.arrivals = direction.arrivals.slice(0, 10);
        for (const arrival of direction.arrivals) {
            try {
                arrival.path = await getTripPath(
                    routeId,
                    arrival.remainingStops,
                    arrival.tripId
                );
            } catch (error) {
                console.error("Could not build trip path:", error);

                arrival.path = {
                    status: "unavailable",
                    reason: "path-data-unavailable",
                };
            }
        }
    }

    return {
        data: {
            stationId,
            routeId,
            directions: [...directions.values()],
        },
        meta: {
            source: "mta-gtfs-realtime",
            feedUpdatedAt: new Date(feedTimestamp * 1000).toISOString(),
            fetchedAt: new Date().toISOString(),
        },
    };
}