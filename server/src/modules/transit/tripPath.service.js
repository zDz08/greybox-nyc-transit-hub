import { readFile } from "node:fs/promises";
import { getTripSchedules } from "./tripSchedule.js";

const shapesUrl = new URL(
    "../../../data/generated/route-shapes.geojson",
    import.meta.url
);

let indexPromise = null;

async function loadIndex() {
    if (!indexPromise) {
        indexPromise = Promise.all([
            readFile(shapesUrl, "utf8"),
            getTripSchedules(),
        ])
            .then(([text, trips]) => {
                const collection = JSON.parse(text);
                const patterns = new Map();

                for (const trip of trips) {
                    const stopIds = trip.stops.map(
                        (stop) => stop.stopId
                    );

                    const key = JSON.stringify([
                        trip.routeId,
                        trip.shapeId,
                        stopIds,
                    ]);

                    patterns.set(key, {
                        routeId: trip.routeId,
                        shapeId: trip.shapeId,
                        stopIds,
                    });
                }

                return {
                    patterns: [...patterns.values()],
                    features: collection.features,
                };
            })
            .catch((error) => {
                indexPromise = null;
                throw error;
            });
    }

    return indexPromise;
}

function containsStopsInOrder(stopIds, remainingStops) {
    let next = 0;

    for (const stopId of stopIds) {
        if (stopId === remainingStops[next]?.stopId) {
            next++;
        }
    }

    return next === remainingStops.length;
}

function projectOntoLine(point, coordinates) {
    let best = null;

    const scaleX =
        111320 * Math.cos(point[1] * Math.PI / 180);
    const scaleY = 111320;

    for (let index = 0; index < coordinates.length - 1; index++) {
        const start = coordinates[index];
        const end = coordinates[index + 1];

        const dx = (end[0] - start[0]) * scaleX;
        const dy = (end[1] - start[1]) * scaleY;
        const px = (point[0] - start[0]) * scaleX;
        const py = (point[1] - start[1]) * scaleY;

        const lengthSquared = dx * dx + dy * dy;

        const fraction = Math.max(
            0,
            Math.min(
                1,
                lengthSquared === 0
                    ? 0
                    : (px * dx + py * dy) / lengthSquared
            )
        );

        const distance = Math.hypot(
            px - fraction * dx,
            py - fraction * dy
        );

        if (!best || distance < best.distance) {
            best = {
                distance,
                position: index + fraction,
                coordinate: [
                    start[0] + fraction * (end[0] - start[0]),
                    start[1] + fraction * (end[1] - start[1]),
                ],
            };
        }
    }

    return best;
}

function clipShape(feature, remainingStops) {
    if (feature.geometry?.type !== "LineString") return null;

    const coordinates = feature.geometry.coordinates;

    if (coordinates.length < 2) return null;

    const positions = remainingStops.map((stop) =>
        projectOntoLine(stop.coordinates, coordinates)
    );

    const invalid = positions.some(
        (position, index) =>
            !position ||
            position.distance > 150 ||
            (
                index > 0 &&
                position.position < positions[index - 1].position
            )
    );

    if (invalid) return null;

    const first = positions[0];
    const last = positions.at(-1);

    if (last.position <= first.position) return null;

    return [
        first.coordinate,
        ...coordinates.slice(
            Math.floor(first.position) + 1,
            Math.ceil(last.position)
        ),
        last.coordinate,
    ];
}

export async function getTripPath(routeId, remainingStops, tripId = null) {
    if (!Array.isArray(remainingStops) || remainingStops.length === 0) {
        return { status: "unavailable", reason: "no-stops" };
    }

    if (remainingStops.length === 1) {
        return { status: "single-stop", geometry: null };
    }

    const missingCoordinates = remainingStops.some(
        (stop) =>
            !stop.stopId ||
            !Array.isArray(stop.coordinates) ||
            stop.coordinates.length !== 2 ||
            !stop.coordinates.every(Number.isFinite)
    );

    if (missingCoordinates) {
        return {
            status: "unavailable",
            reason: "missing-stop-coordinates",
        };
    }

    const index = await loadIndex();

    const shapeIds = new Set(
        index.patterns
            .filter(
                (pattern) =>
                    pattern.routeId === routeId &&
                    containsStopsInOrder(
                        pattern.stopIds,
                        remainingStops
                    )
            )
            .map((pattern) => pattern.shapeId)
    );

    const preferredShapeId =
        typeof tripId === "string"
            ? tripId.slice(tripId.lastIndexOf("_") + 1)
            : null;

    const paths = new Map();

    for (const feature of index.features) {
        if (
            feature.properties.routeId !== routeId ||
            !shapeIds.has(feature.properties.shapeId)
        ) {
            continue;
        }

        const coordinates = clipShape(feature, remainingStops);

        if (!coordinates) continue;

        if (feature.properties.shapeId === preferredShapeId) {
            return {
                status: "matched",
                source: "static-shape-matched-to-realtime-stops",
                shapeId: feature.properties.shapeId,
                color: feature.properties.color,
                geometry: {
                    type: "LineString",
                    coordinates,
                },
            };
        }

        const signature = JSON.stringify(
            coordinates.map((coordinate) =>
                coordinate.map((value) =>
                    Number(value.toFixed(5))
                )
            )
        );

        if (!paths.has(signature)) {
            paths.set(signature, {
                coordinates,
                shapeId: feature.properties.shapeId,
                color: feature.properties.color,
            });
        }
    }

    if (paths.size !== 1) {
        return {
            status: "unavailable",
            reason: paths.size === 0
                ? "no-matching-shape"
                : "ambiguous-shapes",
        };
    }

    const path = [...paths.values()][0];

    return {
        status: "matched",
        source: "static-shape-matched-to-realtime-stops",
        shapeId: path.shapeId,
        color: path.color,
        geometry: {
            type: "LineString",
            coordinates: path.coordinates,
        },
    };
}