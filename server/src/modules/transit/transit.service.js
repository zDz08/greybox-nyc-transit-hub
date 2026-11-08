import { mockStations } from "./transit.mock.js"
import { toStationFeature } from "./station.mapper.js";

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

let cachedStations = null;
let cacheExpiresAt = 0;
let pendingRequest = null;

async function fetchStationsData() {
    console.log("Fetching stations data from NY Open Data API");

    const url = new URL("https://data.ny.gov/resource/39hk-dx4f.json");
    url.searchParams.set("$limit", "1000");
    url.searchParams.set("$order", "gtfs_stop_id");

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if(!response.ok) 
        throw new Error(`Station request failed: HTTP ${response.status}`);

    const stations = await response.json();

    return {
        data: {
            type: "FeatureCollection",
            features: stations.map(toStationFeature),
        },
        meta: { source: "ny-open-data" },
    };
}

export async function getStations() {
    const mode = process.env.TRANSIT_DATA_MODE || "mock";
    
    if(mode === "mock") {
        return {
            data: mockStations,
            meta: { source: "mock" },
        };
    }

    if(mode !== "open-data") {
        const error = new Error("Unsupported transit data mode");
        error.code = "TRANSIT_MODE_NOT_IMPLEMENTED";
        throw error;
    }

    if(cachedStations && (Date.now() < cacheExpiresAt)) {
        console.log("Using cached stations data");
        return cachedStations;
    }

    if(pendingRequest) {
        console.log("Waiting for pending stations request");
        return pendingRequest;
    }

    pendingRequest = fetchStationsData();

    try {
        cachedStations = await pendingRequest;
        cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
        return cachedStations;
    }finally {
        pendingRequest = null;
    }
}