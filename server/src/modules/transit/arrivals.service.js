import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { getStationIdByStopId } from "./gtfsStops.js";

const FEED_BASE =
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F";

const feedGroups = [
    { suffix: "gtfs", routes: ["1", "2", "3", "4", "5", "6", "6X", "GS"] },
    { suffix: "gtfs-ace", routes: ["A", "C", "E", "H"] },
    { suffix: "gtfs-bdfm", routes: ["B", "D", "F", "FX", "M"] },
    { suffix: "gtfs-g", routes: ["G"] },
    { suffix: "gtfs-jz", routes: ["J", "Z"] },
    { suffix: "gtfs-l", routes: ["L"] },
    { suffix: "gtfs-nqrw", routes: ["N", "Q", "R", "W"] },
    { suffix: "gtfs-7", routes: ["7", "7X"] },
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

    const stationIds = await getStationIdByStopId();

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

        if (!trip || trip.routeId !== routeId) continue;

        if (
            trip.scheduleRelationship === "CANCELED" ||
            trip.scheduleRelationship === "DELETED"
        ) {
            continue;
        }

        for (const stop of update.stopTimeUpdate ?? []) {
            const direction = directions.get(stop.stopId);

            if (!direction) continue;

            if (
                stop.scheduleRelationship === "SKIPPED" ||
                stop.scheduleRelationship === "NO_DATA"
            ) {
                continue;
            }

            const arrivalTime = Number(stop.arrival?.time);
            const departureTime = Number(stop.departure?.time);

            let predictedTime;
            let eventType;

            if (Number.isFinite(arrivalTime) && arrivalTime > 0) {
                predictedTime = arrivalTime;
                eventType = "arrival";
            } else if (
                Number.isFinite(departureTime) &&
                departureTime > 0
            ) {
                predictedTime = departureTime;
                eventType = "departure";
            } else {
                continue;
            }

            if (predictedTime < nowSeconds) continue;

            const key = JSON.stringify([
                trip.tripId || entity.id,
                trip.startDate,
                trip.startTime,
                stop.stopId,
            ]);

            if (seen.has(key)) continue;
            seen.add(key);

            direction.arrivals.push({
                tripId: trip.tripId ?? entity.id,
                predictedAt: new Date(predictedTime * 1000).toISOString(),
                minutesAway: Math.ceil(
                    (predictedTime - nowSeconds) / 60
                ),
                eventType,
            });
        }
    }

    for (const direction of directions.values()) {
        direction.arrivals.sort(
            (a, b) => Date.parse(a.predictedAt) - Date.parse(b.predictedAt)
        );

        direction.arrivals = direction.arrivals.slice(0, 3);
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