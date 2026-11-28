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

// Compare the directed polyline, not how densely it was sampled. This
// tolerance is only for coordinate arithmetic (well below a millimeter).
function pathSignature(coordinates) {
    const points = [];
    const epsilon = 1e-10;

    for (const point of coordinates) {
        const previous = points.at(-1);
        if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;

        while (points.length >= 2) {
            const [ax, ay] = points.at(-2);
            const [bx, by] = points.at(-1);
            const dx = point[0] - ax;
            const dy = point[1] - ay;
            const length = Math.hypot(dx, dy);
            if (length === 0) break;

            const along = (bx - ax) * dx + (by - ay) * dy;
            const cross = (bx - ax) * dy - (by - ay) * dx;
            // Keep reversals, including a turn back along the same track.
            if (along < 0 || along > dx * dx + dy * dy || Math.abs(cross) > epsilon * length) {
                break;
            }
            points.pop();
        }

        points.push(point);
    }

    return JSON.stringify(points.map(([x, y]) => [x.toFixed(10), y.toFixed(10)]));
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

        const signature = pathSignature(coordinates);

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