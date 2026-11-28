import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { getStopDetailsById } from "./gtfsStops.js";
import { getTripSchedules } from "./tripSchedule.js";

const transfersUrl = new URL("../../../data/gtfs/transfers.txt", import.meta.url);
let indexPromise;

export function buildIndex(trips, stops, transfers) {
    const routesAt = new Map();
    const transferTimes = new Map();

    for (const trip of trips) {
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
