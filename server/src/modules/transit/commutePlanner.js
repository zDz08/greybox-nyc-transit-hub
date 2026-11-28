import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { getStopDetailsById } from "./gtfsStops.js";
import { getTripSchedules } from "./tripSchedule.js";

const transfersUrl = new URL("../../../data/gtfs/transfers.txt", import.meta.url);
const MAX_OPTIONS = 6;
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

    const { rides, services } = buildRideGraph(patterns.values());

    return {
        rides,
        services,
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

function buildRideGraph(patterns) {
    const rides = new Map();
    const services = new Set();

    for (const pattern of patterns) {
        const { routeId, stops } = pattern;
        for (const service of pattern.services) services.add(service);

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
                    for (const service of pattern.services) {
                        const hops = Math.min(
                            prior.hopsByService.get(service) ?? Infinity,
                            end - start,
                        );
                        prior.hopsByService.set(service, hops);
                    }
                    // Only report intermediate stops shared by every matching pattern.
                    prior.via = prior.via.filter((id) => via.includes(id));
                } else {
                    departures.set(key, {
                        key,
                        routeId,
                        board,
                        exit,
                        via,
                        hopsByService: new Map(
                            [...pattern.services].map((service) => [service, end - start]),
                        ),
                    });
                }
            }
        }
    }

    return { rides, services };
}

function comparePaths(a, b) {
    if (a.hops !== b.hops) return a.hops - b.hops;
    return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0;
}

function keepBest(paths, candidate) {
    const existing = paths.findIndex((path) => path.signature === candidate.signature);
    if (existing !== -1) {
        if (comparePaths(paths[existing], candidate) <= 0) return;
        paths.splice(existing, 1);
    }
    if (paths.length === MAX_OPTIONS && comparePaths(paths.at(-1), candidate) <= 0) {
        return;
    }
    paths.push(candidate);
    paths.sort(comparePaths);
    if (paths.length > MAX_OPTIONS) paths.pop();
}

function extend(path, ride, hops) {
    return {
        signature: path.signature ? path.signature + "|" + ride.key : ride.key,
        hops: path.hops + hops,
        parts: [...path.parts, ride],
    };
}

export function findOptions(index, from, to) {
    if (from === to || !index.names.has(from) || !index.names.has(to)) return [];

    const start = { signature: "", hops: 0, parts: [] };
    const results = [];
    // Keep service IDs separate so all legs share one scheduled service pattern.
    const searches = [...index.services].map((service) => ({
        service,
        visited: new Set([from]),
        frontier: new Map([[from, [start]]]),
    }));

    while (searches.some(({ frontier }) => frontier.size)) {
        for (const { service, frontier } of searches) {
            for (const [board, paths] of frontier) {
                for (const ride of index.rides.get(board)?.values() ?? []) {
                    const hops = ride.hopsByService.get(service);
                    if (ride.exit.stationId !== to || hops === undefined) continue;

                    for (const path of paths) keepBest(results, extend(path, ride, hops));
                }
            }
        }

        // Every frontier represents the same number of rides. Finish the whole
        // layer before returning so other options with the same count can compete.
        if (results.length) break;

        for (const search of searches) {
            const { service, visited, frontier } = search;
            const next = new Map();

            for (const [board, paths] of frontier) {
                for (const ride of index.rides.get(board)?.values() ?? []) {
                    const hops = ride.hopsByService.get(service);
                    if (hops === undefined) continue;

                    for (const transfer of index.links.get(ride.exit.stationId) ?? []) {
                        if (visited.has(transfer) || !index.rides.has(transfer)) continue;
                        if (!next.has(transfer)) next.set(transfer, []);

                        for (const path of paths) {
                            keepBest(next.get(transfer), extend(path, ride, hops));
                        }
                    }
                }
            }

            // Keep alternatives reaching the same station at the same depth;
            // deeper visits cannot yield a route with fewer transfers.
            for (const station of next.keys()) visited.add(station);
            search.frontier = next;
        }
    }

    const station = (id) => ({ id, name: index.names.get(id) });

    return results.map(({ signature, parts }) => ({
        id: "plan-" + createHash("sha256").update(signature).digest("hex").slice(0, 32),
        legs: parts.map((ride) => ({
            routeId: ride.routeId,
            stopId: ride.board.stopId,
            board: station(ride.board.stationId),
            exit: station(ride.exit.stationId),
            via: ride.via.map(station),
        })),
    }));
}
