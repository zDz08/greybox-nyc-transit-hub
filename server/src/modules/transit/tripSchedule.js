import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { getStationIdByStopId } from "./gtfsStops.js";

let schedulePromise = null;

export function parseGtfsTime(value) {
    if (!/^\d{2,}:[0-5]\d:[0-5]\d$/.test(value)) {
        throw new Error(`Invalid GTFS time: ${value}`);
    }

    const [hours, minutes, seconds] = value.split(":").map(Number);

    return hours * 3600 + minutes * 60 + seconds;
}

async function readGtfs(filename) {
    const fileUrl = new URL(
        `../../../data/gtfs/${filename}`,
        import.meta.url
    );

    const text = await readFile(fileUrl, "utf8");

    return parse(text, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
    });
}

async function buildTripSchedules() {
    const [trips, stopTimes, stationIds] = await Promise.all([
        readGtfs("trips.txt"),
        readGtfs("stop_times.txt"),
        getStationIdByStopId(),
    ]);

    const endpointsByTrip = new Map();
    const stopsByTrip = new Map();

    for (const stop of stopTimes) {
        const stationId = stationIds.get(stop.stop_id);

        if (!stationId) {
            throw new Error(`Unknown station for stop ${stop.stop_id}`);
        }

        const arrivalSeconds = parseGtfsTime(stop.arrival_time);
        const departureSeconds = parseGtfsTime(stop.departure_time);

        if (departureSeconds < arrivalSeconds) {
            throw new Error(
                `Invalid stop time range for ${stop.trip_id} at ${stop.stop_id}`
            );
        }

        if (!stopsByTrip.has(stop.trip_id)) {
            stopsByTrip.set(stop.trip_id, []);
        }

        stopsByTrip.get(stop.trip_id).push({
            stationId,
            stopId: stop.stop_id,
            sequence: Number(stop.stop_sequence),
            arrivalSeconds,
            departureSeconds,
            ...(stop.pickup_type && stop.pickup_type !== "0" ? { noPickup: true } : {}),
            ...(stop.drop_off_type && stop.drop_off_type !== "0" ? { noDropOff: true } : {}),
        });
        const sequence = Number(stop.stop_sequence);

        if (!Number.isInteger(sequence) || sequence < 0) {
            throw new Error(`Invalid stop sequence for ${stop.trip_id}`);
        }

        const endpoints = endpointsByTrip.get(stop.trip_id);

        if (!endpoints) {
            endpointsByTrip.set(stop.trip_id, {
                first: stop,
                last: stop,
            });
            continue;
        }

        if (sequence < Number(endpoints.first.stop_sequence)) {
            endpoints.first = stop;
        }

        if (sequence > Number(endpoints.last.stop_sequence)) {
            endpoints.last = stop;
        }
    }

    return trips.map((trip) => {
        const endpoints = endpointsByTrip.get(trip.trip_id);

        if (!endpoints) {
            throw new Error(`Missing stop times for ${trip.trip_id}`);
        }

        const startSeconds = parseGtfsTime(
            endpoints.first.departure_time
        );

        const endSeconds = parseGtfsTime(
            endpoints.last.arrival_time
        );

        if (endSeconds < startSeconds) {
            throw new Error(`Invalid time range for ${trip.trip_id}`);
        }

        return {
            tripId: trip.trip_id,
            routeId: trip.route_id,
            serviceId: trip.service_id,
            shapeId: trip.shape_id,
            directionId: trip.direction_id,
            headsign: trip.trip_headsign?.trim() || "",
            startSeconds,
            endSeconds,
            stops: [...stopsByTrip.get(trip.trip_id)].sort(
                (a, b) => a.sequence - b.sequence
            ),
        };
    });
}

export async function getTripSchedules() {
    if (!schedulePromise) {
        schedulePromise = buildTripSchedules().catch((error) => {
            schedulePromise = null;
            throw error;
        });
    }

    return schedulePromise;
}