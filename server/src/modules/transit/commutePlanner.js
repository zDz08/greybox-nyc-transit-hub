import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { getStopDetailsById } from "./gtfsStops.js";
import { getTripSchedules } from "./tripSchedule.js";

const transfersUrl = new URL("../../../data/gtfs/transfers.txt", import.meta.url);
let indexPromise;

export function buildIndex(trips, stops, transfers) {
    const patterns = new Map();
    const routesAt = new Map();
    const transferTimes = new Map();

    for (const trip of trips) {
        const key = [trip.routeId, ...trip.stops.map((s) => s.stopId)].join(":");
        if (patterns.has(key)) continue;
        patterns.set(key, trip);

        for (const { stationId } of trip.stops) {
            if (!routesAt.has(stationId)) routesAt.set(stationId, new Set());
            routesAt.get(stationId).add(trip.routeId);
        }
    }

    // This subway feed defines directed, station-level transfer pairs.
    for (const row of transfers) {
        if (!["", "0", "1", "2"].includes(row.transfer_type)) continue;
        if (!routesAt.has(row.from_stop_id) || !routesAt.has(row.to_stop_id)) continue;

        const seconds = row.min_transfer_time?.trim() ? Number(row.min_transfer_time) : 180;
        if (Number.isFinite(seconds) && seconds >= 0) {
            if (!transferTimes.has(row.from_stop_id))
                transferTimes.set(row.from_stop_id, new Map());
            const times = transferTimes.get(row.from_stop_id);
            times.set(row.to_stop_id, Math.max(times.get(row.to_stop_id) ?? 0, seconds));
        }
    }

    const stations = [...routesAt]
        .map(([id, routes]) => ({
            id,
            name: stops.get(id).stop_name,
            routes: [...routes].sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    return {
        rides: buildViaIndex(patterns.values()),
        transferTimes,
        stations,
        names: new Map(stations.map((s) => [s.id, s.name])),
    };
}

export function getIndex() {
    if (!indexPromise) {
        indexPromise = Promise.all([
            getTripSchedules(),
            getStopDetailsById(),
            readFile(transfersUrl, "utf8"),
        ])
            .then(([trips, stops, csv]) =>
                buildIndex(
                    trips,
                    stops,
                    parse(csv, { columns: true, bom: true, skip_empty_lines: true }),
                ),
            )
            .catch((error) => {
                indexPromise = undefined;
                throw error;
            });
    }
    return indexPromise;
}

function buildViaIndex(patterns) {
    const rides = new Map();

    for (const pattern of patterns) {
        const { routeId, stops } = pattern;

        for (let start = 0; start < stops.length - 1; start++) {
            const board = stops[start];
            if (!rides.has(board.stationId)) rides.set(board.stationId, new Map());
            const departures = rides.get(board.stationId);

            for (let end = start + 1; end < stops.length; end++) {
                const exit = stops[end];
                if (exit.stationId === board.stationId) continue;

                const key = [routeId, board.stopId, exit.stopId].join(":");
                const via = stops.slice(start + 1, end).map((stop) => stop.stationId);
                const prior = departures.get(key);

                if (prior) {
                    // Only report intermediate stops shared by every matching pattern.
                    prior.via = prior.via.filter((id) => via.includes(id));
                } else {
                    departures.set(key, { via });
                }
            }
        }
    }

    return rides;
}
