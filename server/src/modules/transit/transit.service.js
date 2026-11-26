import { mockStations } from "./transit.mock.js";
import { toStationFeature } from "./station.mapper.js";
import {
    getOutagesFeed,
    getEquipmentsFeed,
    getStationAccessibility,
} from "./accessibility.service.js";

const STATION_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

let cachedRawStations = null;
let stationCacheExpiresAt = 0;
let pendingStationRequest = null;

function emptyAccessibility() {
    return {
        adaStatus: "unknown",
        adaNotes: null,
        outageFeedAvailable: true,
        equipmentFeedAvailable: true,
        hasOutage: false,
        elevatorsOutOfServiceCount: 0,
        escalatorsOutOfServiceCount: 0,
        availableElevatorCount: 0,
        availableEscalatorCount: 0,
        upcomingOutageCount: 0,
        elevatorsOutOfService: [],
        escalatorsOutOfService: [],
        availableElevators: [],
        availableEscalators: [],
        upcomingOutages: [],
        equipments: [],
    };
}

function normalizeMockFeature(feature) {
    const props = feature.properties ?? {};
    const acc = props.accessibility ?? {};
    const elevatorsOut = acc.elevatorsOutOfService ?? [];
    const escalatorsOut = acc.escalatorsOutOfService ?? [];
    const availableElevators = acc.availableElevators ?? [];
    const availableEscalators = acc.availableEscalators ?? [];
    const upcomingOutages = acc.upcomingOutages ?? [];

    return {
        ...feature,
        properties: {
            ...props,
            accessibility: {
                ...emptyAccessibility(),
                ...acc,
                elevatorsOutOfService: elevatorsOut,
                escalatorsOutOfService: escalatorsOut,
                availableElevators,
                availableEscalators,
                upcomingOutages,
                elevatorsOutOfServiceCount:
                    acc.elevatorsOutOfServiceCount ?? elevatorsOut.length,
                escalatorsOutOfServiceCount:
                    acc.escalatorsOutOfServiceCount ?? escalatorsOut.length,
                availableElevatorCount:
                    acc.availableElevatorCount ?? availableElevators.length,
                availableEscalatorCount:
                    acc.availableEscalatorCount ?? availableEscalators.length,
                upcomingOutageCount:
                    acc.upcomingOutageCount ?? upcomingOutages.length,
                hasOutage:
                    acc.hasOutage ??
                    (elevatorsOut.length > 0 || escalatorsOut.length > 0),
            },
        },
    };
}

async function fetchStationsOnce(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });

    if (!response.ok) {
        throw new Error(`Station request failed: HTTP ${response.status}`);
    }

    return response.json();
}

async function fetchRawStations() {
    console.log("Fetching stations data from NY Open Data API");

    const url = new URL("https://data.ny.gov/resource/39hk-dx4f.json");
    url.searchParams.set("$limit", "1000");
    url.searchParams.set("$order", "gtfs_stop_id");

    try {
        return await fetchStationsOnce(url);
    } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
            console.warn("Stations fetch timed out, retrying once...");
            return await fetchStationsOnce(url);
        }
        throw error;
    }
}

async function getRawStations() {
    if (cachedRawStations && Date.now() < stationCacheExpiresAt) {
        console.log("Using cached raw stations data");
        return cachedRawStations;
    }

    if (pendingStationRequest) {
        console.log("Waiting for pending stations request");
        return pendingStationRequest;
    }

    pendingStationRequest = fetchRawStations();

    try {
        cachedRawStations = await pendingStationRequest;
        stationCacheExpiresAt = Date.now() + STATION_CACHE_DURATION_MS;
        return cachedRawStations;
    } finally {
        pendingStationRequest = null;
    }
}

export async function getStations() {
    const mode = process.env.TRANSIT_DATA_MODE || "mock";

    if (mode === "mock") {
        return {
            data: {
                ...mockStations,
                features: (mockStations.features ?? []).map(normalizeMockFeature),
            },
            meta: {
                source: "mock",
                accessibilitySource: "mock",
            },
        };
    }

    if (mode !== "open-data") {
        const error = new Error("Unsupported transit data mode");
        error.code = "TRANSIT_MODE_NOT_IMPLEMENTED";
        throw error;
    }

    let outageFeedAvailable = true;
    let equipmentFeedAvailable = true;

    const [rawStations, outages, equipments] = await Promise.all([
        getRawStations(),
        getOutagesFeed().catch((err) => {
            outageFeedAvailable = false;
            console.warn(
                "Failed to load ENE outage feed, reporting status unavailable:",
                err.message
            );
            return [];
        }),
        getEquipmentsFeed().catch((err) => {
            equipmentFeedAvailable = false;
            console.warn(
                "Failed to load ENE equipments feed, continuing without equipment inventory:",
                err.message
            );
            return [];
        }),
    ]);

    return {
        data: {
            type: "FeatureCollection",
            features: rawStations.map((station) => {
                const accessibility = getStationAccessibility(
                    station,
                    outages,
                    equipments,
                    {
                        outageFeedAvailable,
                        equipmentFeedAvailable,
                    }
                );
                return toStationFeature(station, accessibility);
            }),
        },
        meta: {
            source: "ny-open-data",
            accessibilitySource: "mta-ene+equipments",
            outageFeedAvailable,
            equipmentFeedAvailable,
        },
    };
}