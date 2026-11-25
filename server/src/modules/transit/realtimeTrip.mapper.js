function toIsoTime(event) {
    const seconds = Number(event?.time);

    if (!Number.isFinite(seconds) || seconds <= 0) {
        return null;
    }

    const date = new Date(seconds * 1000);

    return Number.isNaN(date.getTime())
        ? null
        : date.toISOString();
}

function getCoordinates(stop) {
    if (
        !stop ||
        !String(stop.stop_lon ?? "").trim() ||
        !String(stop.stop_lat ?? "").trim()
    ) {
        return null;
    }

    const longitude = Number(stop.stop_lon);
    const latitude = Number(stop.stop_lat);

    if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 ||
        Math.abs(latitude) > 90
    ) {
        return null;
    }

    return [longitude, latitude];
}

export function orderStopUpdates(updates = []) {
    const stops = [...updates];

    const hasSequences = stops.every(
        (stop) =>
            Number.isInteger(stop.stopSequence) &&
            stop.stopSequence >= 0
    );

    if (hasSequences) {
        stops.sort((a, b) => a.stopSequence - b.stopSequence);
    }

    return stops;
}

export function buildRemainingStops(
    orderedStops,
    startIndex,
    stopDetails,
    stationIds
) {
    return orderedStops
        .slice(startIndex)
        .filter((stop) => stop.scheduleRelationship !== "SKIPPED")
        .map((stop, index) => {
            const details = stopDetails.get(stop.stopId);
            const noPrediction =
                stop.scheduleRelationship === "NO_DATA";

            return {
                order: index + 1,
                stopId: stop.stopId ?? null,
                stationId: stationIds.get(stop.stopId) ?? null,
                name: details?.stop_name?.trim() || null,
                coordinates: getCoordinates(details),
                arrivalAt: noPrediction
                    ? null
                    : toIsoTime(stop.arrival),
                departureAt: noPrediction
                    ? null
                    : toIsoTime(stop.departure),
                predictionAvailable: !noPrediction && Boolean(
                    toIsoTime(stop.arrival) ||
                    toIsoTime(stop.departure)
                ),
            };
        });
}