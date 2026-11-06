export function toStationFeature(station) {
    return {
        type: "Feature",
        geometry: station.georeference,
        properties: {
            id: station.gtfs_stop_id,
            name: station.stop_name,
            routes: (station.daytime_routes ?? "").trim().split(/\s+/).filter(Boolean),
        },
    };
}