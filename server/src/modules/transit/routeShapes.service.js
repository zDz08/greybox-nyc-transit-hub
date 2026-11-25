import { readFile } from "node:fs/promises";
import { getActiveTrips } from "./activeTrips.service.js";
import { buildStationRoutes, buildStationDirections } from "./station.service.js";

const routeShapesUrl = new URL(
    "../../../data/generated/route-shapes.geojson",
    import.meta.url
);

let shapesPromise = null;

function getShapeKey(routeId, shapeId) {
    return JSON.stringify([routeId, shapeId]);
}

async function loadRouteShapes() {
    if (!shapesPromise) {
        shapesPromise = readFile(routeShapesUrl, "utf8")
            .then((text) => {
                const collection = JSON.parse(text);

                if (
                    collection.type !== "FeatureCollection" ||
                    !Array.isArray(collection.features)
                ) {
                    throw new Error("Invalid route shapes collection");
                }

                const shapesByKey = new Map();

                for (const feature of collection.features) {
                    const { routeId, shapeId } = feature.properties;

                    shapesByKey.set(
                        getShapeKey(routeId, shapeId),
                        feature
                    );
                }

                return shapesByKey;
            })
            .catch((error) => {
                shapesPromise = null;
                throw error;
            });
    }

    return shapesPromise;
}

export async function getRouteShapes(now = new Date()) {
    const [shapesByKey, active] = await Promise.all([
        loadRouteShapes(),
        getActiveTrips(now),
    ]);

    const selectedKeys = new Set();
    const features = [];

    for (const trip of active.trips) {
        const key = getShapeKey(trip.routeId, trip.shapeId);

        if (selectedKeys.has(key)) continue;

        const feature = shapesByKey.get(key);

        if (!feature) {
            throw new Error(
                `Missing route shape: ${trip.routeId} / ${trip.shapeId}`
            );
        }

        selectedKeys.add(key);
        features.push(feature);
    }

    return {
        data: {
            type: "FeatureCollection",
            features,
        },
        stationRoutes: buildStationRoutes(active),
        stationDirections: buildStationDirections(active),
        meta: {
            ...active.meta,
            serviceType: "scheduled",
            activeTripCount: active.trips.length,
            shapeCount: features.length,
        },
    };
}