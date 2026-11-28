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

function selectJourneys(trips, transferTimes, from, to, startMs, endMs) {
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

            for (const [board, seconds] of transferTimes.get(station) ?? []) {
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
    const options = selectJourneys(
        trips,
        index.transferTimes,
        from,
        to,
        +departure,
        +departure + SEARCH_HOURS * HOUR_MS,
    );

    return options.map(({ arrival, labels }) => {
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
    });
}

export async function findScheduledOptions(index, from, to, departure) {
    if (from === to || !index.names.has(from) || !index.names.has(to)) return [];
    const trips = await getTripsInWindow(departure, +departure + SEARCH_HOURS * HOUR_MS);
    return planScheduledJourney(index, trips, from, to, departure);
}
