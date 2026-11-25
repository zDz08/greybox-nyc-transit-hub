import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

const stopsUrl = new URL(
    "../../../data/gtfs/stops.txt",
    import.meta.url
);

let stopsPromise = null;

async function loadStationIds() {
    const text = await readFile(stopsUrl, "utf8");

    const stops = parse(text, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
    });

    const stopsById = new Map(
        stops.map((stop) => [stop.stop_id, stop])
    );

    const stationIds = new Map();

    for (const stop of stops) {
        const type = stop.location_type || "0";

        if (type === "1") {
            stationIds.set(stop.stop_id, stop.stop_id);
            continue;
        }

        if (type !== "0") continue;

        const parentId = stop.parent_station;

        if (!parentId) {
            throw new Error(
                `Missing parent station for platform ${stop.stop_id}`
            );
        }

        const parent = stopsById.get(parentId);

        if (!parent || parent.location_type !== "1") {
            throw new Error(
                `Invalid parent station for platform ${stop.stop_id}`
            );
        }

        stationIds.set(stop.stop_id, parentId);
    }

    return { stationIds, stopsById };
}

async function getStopsData() {
    if (!stopsPromise) {
        stopsPromise = loadStationIds().catch((error) => {
            stopsPromise = null;
            throw error;
        });
    }

    return stopsPromise;
}

export async function getStationIdByStopId() {
    const data = await getStopsData();
    return data.stationIds;
}

export async function getStopDetailsById() {
    const data = await getStopsData();
    return data.stopsById;
}