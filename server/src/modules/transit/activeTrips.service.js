import { getNewYorkTime } from "./transit.time.js";
import { getActiveServiceIds } from "./serviceCalendar.js";
import {
    getTripSchedules,
    parseGtfsTime,
} from "./tripSchedule.js";

function getServiceDay(referenceDate, offset) {
    const year = Number(referenceDate.slice(0, 4));
    const month = Number(referenceDate.slice(4, 6));
    const day = Number(referenceDate.slice(6, 8));

    const dateMarker = new Date(
        Date.UTC(year, month - 1, day + offset, 12)
    );

    const date = dateMarker
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "");

    const weekday = dateMarker
        .toLocaleDateString("en-US", {
            timeZone: "UTC",
            weekday: "long",
        })
        .toLowerCase();

    const localTime = getNewYorkTime(dateMarker);
    const secondsUntilNoon =
        12 * 3600 - parseGtfsTime(localTime.time);

    const localNoonMs =
        dateMarker.getTime() + secondsUntilNoon * 1000;

    const originMs = localNoonMs - 12 * 3600 * 1000;

    return { date, weekday, originMs };
}

export async function getActiveTrips(now = new Date()) {
    const windowStartMs = now.getTime();

    if (!Number.isFinite(windowStartMs)) {
        throw new Error("Invalid reference time");
    }

    const windowEndMs = windowStartMs + 30 * 60 * 1000;
    const localNow = getNewYorkTime(now);
    const schedules = await getTripSchedules();

    const maxEndSeconds = schedules.reduce(
        (maximum, trip) => Math.max(maximum, trip.endSeconds),
        0
    );

    const lookbackDays =
        Math.ceil(maxEndSeconds / 86400) + 1;

    const activeTrips = [];

    for (let offset = -lookbackDays; offset <= 1; offset++) {
        const serviceDay = getServiceDay(localNow.date, offset);

        const serviceIds = await getActiveServiceIds(serviceDay);

        if (serviceIds.size === 0) continue;

        for (const trip of schedules) {
            if (!serviceIds.has(trip.serviceId)) continue;

            const startsAtMs =
                serviceDay.originMs + trip.startSeconds * 1000;

            const endsAtMs =
                serviceDay.originMs + trip.endSeconds * 1000;

            const overlapsWindow =
                startsAtMs < windowEndMs &&
                endsAtMs > windowStartMs;

            if (!overlapsWindow) continue;

            activeTrips.push({
                ...trip,
                serviceDate: serviceDay.date,
                startsAt: new Date(startsAtMs).toISOString(),
                endsAt: new Date(endsAtMs).toISOString(),
            });
        }
    }

    return {
        trips: activeTrips,
        meta: {
            source: "mta-static-gtfs",
            timeZone: "America/New_York",
            windowStart: now.toISOString(),
            windowEnd: new Date(windowEndMs).toISOString(),
        },
    };
}