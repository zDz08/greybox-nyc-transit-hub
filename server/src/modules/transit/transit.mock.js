// Illustrative test data, not live MTA data
// Coordinates use GeoJSON order: [longitude, latitude]

export const mockStations = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [-73.9875, 40.7553],
            },
            properties: {
                id: "mock-times-square",
                name: "Times Sq-42 St",
                routes: ["N", "Q", "R", "W"],
                accessibility: {
                    adaStatus: "fully-accessible", // "fully-accessible" | "partially-accessible" | "not-accessible" | "unknown"
                    adaNotes: null,
                    hasOutage: true,
                    elevatorsOutOfServiceCount: 1,
                    escalatorsOutOfServiceCount: 0,
                    upcomingOutageCount: 0,
                    elevatorsOutOfService: [
                        {
                            equipment: "EL999",
                            type: "EL",
                            serving: "Mezzanine to N/Q/R/W platform",
                            ada: true,
                            reason: "Planned Work",
                            outageDate: "11/20/2026 08:00:00 AM",
                            estimatedReturnToService: "11/20/2026 04:00:00 PM",
                            isUpcomingOutage: false,
                            isMaintenanceOutage: false,
                        },
                    ],
                    escalatorsOutOfService: [],
                    upcomingOutages: [],
                },
            },
        },
        {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [-73.9904, 40.7359],
            },
            properties: {
                id: "mock-union-square",
                name: "14 St-Union Sq",
                routes: ["N", "Q", "R", "W"],
                accessibility: {
                    adaStatus: "fully-accessible",
                    adaNotes: null,
                    hasOutage: false,
                    elevatorsOutOfServiceCount: 0,
                    escalatorsOutOfServiceCount: 0,
                    upcomingOutageCount: 0,
                    elevatorsOutOfService: [],
                    escalatorsOutOfService: [],
                    upcomingOutages: [],
                },
            },
        },
    ],
};