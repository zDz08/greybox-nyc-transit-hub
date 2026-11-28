import { createHash } from "node:crypto";
import { getActiveServiceIds } from "./serviceCalendar.js";
import { getNewYorkTime, getServiceDay } from "./transit.time.js";
import { getTripSchedules } from "./tripSchedule.js";

const SEARCH_HOURS = 12;
const HOUR_MS = 3600000;

async function getTripsInWindow(departure, endMs) {
    const schedules = await getTripSchedules();
    const local = getNewYorkTime(departure);
    const maxEnd = schedules.reduce((max, trip) => Math.max(max, trip.endSeconds), 0);
    const lookback = Math.ceil(maxEnd / 86400);
    const days = await Promise.all(
        Array.from({ length: lookback + 2 }, async (_, i) => {
            const day = getServiceDay(local.date, i - lookback);
            return { ...day, services: await getActiveServiceIds(day) };
        }),
    );

    return days.flatMap(({ originMs, services }) =>
        schedules
            .filter(
                (trip) =>
                    services.has(trip.serviceId) &&
                    originMs + trip.endSeconds * 1000 >= +departure &&
                    originMs + trip.startSeconds * 1000 <= endMs,
            )
            .map((trip) => ({ trip, originMs })),
    );
}

function selectJourneys(trips, transferTimes, from, to, startMs, endMs, avoidTransfers) {
    const start = { time: startMs, previous: null };
    const bestReady = new Map([[from, startMs]]);
    const bestArrivals = new Map();
    let ready = new Map([[from, start]]);
    let fewest;
    let earliest;

    // One round boards one more train. Earlier labels with fewer rides dominate.
    while (ready.size) {
        const arrivals = new Map();

        for (const { trip, originMs } of trips) {
            let boarding;
            for (const stop of trip.stops) {
                const arrival = originMs + stop.arrivalSeconds * 1000;
                if (arrival > endMs) break;

                if (
                    boarding &&
                    !stop.noDropOff &&
                    arrival < (arrivals.get(stop.stationId)?.time ?? Infinity) &&
                    arrival < (bestArrivals.get(stop.stationId) ?? Infinity)
                ) {
                    arrivals.set(stop.stationId, {
                        time: arrival,
                        previous: boarding.label,
                        routeId: trip.routeId,
                        board: boarding.stop,
                        exit: stop,
                        departure: boarding.departure,
                    });
                }

                const label = ready.get(stop.stationId);
                const departure = originMs + stop.departureSeconds * 1000;
                if (!boarding && label && !stop.noPickup && label.time <= departure) {
                    boarding = { stop, departure, label };
                }
            }
        }

        if (arrivals.has(to)) {
            earliest = arrivals.get(to);
            fewest ??= earliest;
        }

        const next = new Map();
        for (const [station, arrival] of arrivals) {
            bestArrivals.set(station, arrival.time);
            if (arrival.time >= (earliest?.time ?? endMs)) continue;

            if (avoidTransfers?.has(station)) continue;
            for (const [board, seconds] of transferTimes.get(station) ?? []) {
                if (avoidTransfers?.has(board)) continue;
                const time = arrival.time + seconds * 1000;
                if (
                    time >= (earliest?.time ?? endMs) ||
                    time >= (bestReady.get(board) ?? Infinity)
                )
                    continue;

                bestReady.set(board, time);
                next.set(board, { time, previous: arrival });
            }
        }
        ready = next;
    }

    if (!earliest) return [];
    return earliest === fewest
        ? [{ arrival: earliest, labels: ["Earliest arrival", "Fewest transfers"] }]
        : [
              { arrival: earliest, labels: ["Earliest arrival"] },
              { arrival: fewest, labels: ["Fewest transfers"] },
          ];
}

export function planScheduledJourney(index, trips, from, to, departure) {
    if (from === to || !index.names.has(from) || !index.names.has(to)) return [];

    const station = (id) => ({ id, name: index.names.get(id) });
    const startMs = +departure;
    const endMs = startMs + SEARCH_HOURS * HOUR_MS;
    const search = (pool, avoidTransfers) =>
        selectJourneys(pool, index.transferTimes, from, to, startMs, endMs, avoidTransfers);

    function formatOption({ arrival, labels }) {
        const legs = [];
        const keys = [];

        for (let leg = arrival; leg?.board; leg = leg.previous?.previous) {
            const key = [leg.routeId, leg.board.stopId, leg.exit.stopId].join(":");
            keys.push(key);

            legs.push({
                routeId: leg.routeId,
                stopId: leg.board.stopId,
                board: station(leg.board.stationId),
                exit: station(leg.exit.stationId),
                departureAt: new Date(leg.departure).toISOString(),
                arrivalAt: new Date(leg.time).toISOString(),
            });
        }

        const signature = keys.reverse().join("|");
        const id = "plan-" + createHash("sha256").update(signature).digest("hex").slice(0, 32);
        return {
            id,
            labels,
            arrivalAt: new Date(arrival.time).toISOString(),
            legs: legs.reverse(),
        };
    }

    const primary = search(trips).map(formatOption);
    if (!primary.length) return [];

    const selected = [...primary];
    const reroutes = new Map();

    // Each reroute avoids an entire line or a transfer station (on either side
    // of the walk). A later train following the same itinerary is not a backup.
    for (let i = 0; i < 2; i++) {
        const lines = new Set();
        const transfers = new Set();
        for (const option of selected) {
            option.legs.forEach((leg, n) => {
                lines.add(leg.routeId);
                if (n > 0) transfers.add(leg.board.id);
                if (n + 1 < option.legs.length) transfers.add(leg.exit.id);
            });
        }

        function tryAvoid(kind, ids) {
            if (!ids.size) return null;
            const key = JSON.stringify([kind, [...ids].sort()]);
            if (!reroutes.has(key)) {
                const pool =
                    kind === "lines"
                        ? trips.filter(({ trip }) => !ids.has(trip.routeId))
                        : trips;
                reroutes.set(
                    key,
                    search(pool, kind === "transfers" ? ids : undefined).map(formatOption),
                );
            }
            for (const option of reroutes.get(key)) {
                if (!selected.some((prior) => prior.id === option.id)) {
                    return { ...option, labels: ["Alternative " + (i + 1)] };
                }
            }
            return null;
        }

        let backup = tryAvoid("lines", lines) ?? tryAvoid("transfers", transfers);
        if (!backup) {
            const candidates = [];
            for (const [kind, ids] of [
                ["lines", lines],
                ["transfers", transfers],
            ]) {
                for (const id of ids) {
                    const option = tryAvoid(kind, new Set([id]));
                    if (option) candidates.push(option);
                }
            }
            candidates.sort(
                (a, b) =>
                    a.arrivalAt.localeCompare(b.arrivalAt) || a.legs.length - b.legs.length,
            );
            backup = candidates[0];
        }
        if (!backup) break;
        selected.push(backup);
    }
    return selected;
}

export async function findScheduledOptions(index, from, to, departure) {
    if (from === to || !index.names.has(from) || !index.names.has(to)) return [];
    const trips = await getTripsInWindow(departure, +departure + SEARCH_HOURS * HOUR_MS);
    return planScheduledJourney(index, trips, from, to, departure);
}
