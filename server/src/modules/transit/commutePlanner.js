import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { getStopDetailsById } from "./gtfsStops.js";
import { getTripSchedules } from "./tripSchedule.js";

const transfersUrl = new URL("../../../data/gtfs/transfers.txt", import.meta.url);
let indexPromise;

export function buildIndex(trips, stops, transfers) {
    const patterns = new Map();
    const routesAt = new Map();
    const links = new Map();

    for (const trip of trips) {
        const key = [trip.routeId, ...trip.stops.map((s) => s.stopId)].join(":");
        if (patterns.has(key)) {
            patterns.get(key).services.add(trip.serviceId);
            continue;
        }
        patterns.set(key, { ...trip, services: new Set([trip.serviceId]) });

        for (const { stationId } of trip.stops) {
            if (!routesAt.has(stationId)) routesAt.set(stationId, new Set());
            routesAt.get(stationId).add(trip.routeId);
        }
    }

    // This subway feed defines directed, station-level transfer pairs.
    for (const row of transfers) {
        if (!["", "0", "1", "2"].includes(row.transfer_type)) continue;
        if (!routesAt.has(row.from_stop_id) || !routesAt.has(row.to_stop_id)) continue;
        if (!links.has(row.from_stop_id)) links.set(row.from_stop_id, new Set());
        links.get(row.from_stop_id).add(row.to_stop_id);
    }

    const stations = [...routesAt]
        .map(([id, routes]) => ({
            id,
            name: stops.get(id).stop_name,
            routes: [...routes].sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    return {
        patterns: [...patterns.values()],
        links,
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

export function findOptions(index, from, to) {
    if (from === to || !index.names.has(from) || !index.names.has(to)) return [];
    const departures = new Map();
    const arrivals = new Map();
    const station = (id) => ({ id, name: index.names.get(id) });

    function add(table, junction, trip, start, end) {
        if (!table.has(junction)) table.set(junction, new Map());
        const group = table.get(junction);
        const board = trip.stops[start],
            exit = trip.stops[end];
        const key = [trip.routeId, board.stopId, exit.stopId].join(":");
        const via = trip.stops.slice(start + 1, end).map((s) => s.stationId);
        const prior = group.get(key);
        if (prior) {
            prior.via = prior.via.filter((id) => via.includes(id));
            for (const service of trip.services) prior.services.add(service);
            prior.hops = Math.min(prior.hops, end - start);
            return;
        }
        group.set(key, {
            key,
            routeId: trip.routeId,
            board,
            exit,
            via,
            services: new Set(trip.services),
            hops: end - start,
        });
    }

    for (const trip of index.patterns) {
        const stops = trip.stops;
        for (let i = 0; i < stops.length; i++) {
            if (stops[i].stationId === from) {
                for (let j = i + 1; j < stops.length; j++) {
                    add(departures, stops[j].stationId, trip, i, j);
                    if (stops[j].stationId === to) break;
                }
            }
            if (stops[i].stationId === to) {
                for (let j = i - 1; j >= 0; j--) {
                    add(arrivals, stops[j].stationId, trip, j, i);
                    if (stops[j].stationId === from) break;
                }
            }
        }
    }

    const options = [];
    function collect(parts) {
        const signature = parts.map((p) => p.key).join("|");
        const id = "plan-" + createHash("sha256").update(signature).digest("hex").slice(0, 32);
        const legs = parts.map((p) => ({
            routeId: p.routeId,
            stopId: p.board.stopId,
            board: station(p.board.stationId),
            exit: station(p.exit.stationId),
            via: p.via.map(station),
        }));
        options.push({ id, legs, hops: parts.reduce((sum, p) => sum + p.hops, 0) });
    }

    for (const direct of departures.get(to)?.values() ?? []) collect([direct]);
    const directHops = Math.min(...options.map((option) => option.hops));
    for (const [off, first] of departures) {
        if (off === from || off === to) continue;
        for (const on of index.links.get(off) ?? []) {
            if (on === from || on === to) continue;
            for (const a of first.values()) {
                for (const b of arrivals.get(on)?.values() ?? []) {
                    if (a.routeId === b.routeId || a.via.some((id) => b.via.includes(id)))
                        continue;
                    if (a.hops + b.hops >= directHops) continue;
                    if (![...a.services].some((service) => b.services.has(service))) continue;
                    collect([a, b]);
                }
            }
        }
    }

    options.sort(
        (a, b) => a.legs.length - b.legs.length || a.hops - b.hops || a.id.localeCompare(b.id),
    );
    // Offer one representative transfer for each line combination.
    const seen = new Set();
    return options
        .filter((option) => {
            const pair = option.legs.map((l) => l.routeId).join(":");
            if (seen.has(pair)) return false;
            seen.add(pair);
            return true;
        })
        .slice(0, 6)
        .map(({ id, legs }) => ({ id, legs }));
}
