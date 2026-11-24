import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./transitMap.css";
import { getRouteStyle } from "./routeColors";

maplibregl.setWorkerUrl(workerUrl);

const scheduleTimeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
});

function formatScheduleTime(value) {
    return scheduleTimeFormatter.format(new Date(value));
}

const ADA_LABELS = {
    "fully-accessible": "Fully accessible",
    "partially-accessible": "Partially accessible",
    "not-accessible": "Not accessible",
    unknown: "ADA status unknown",
};

function isAdaStepFree(station) {
    const status = station?.properties?.accessibility?.adaStatus;
    return status === "fully-accessible" || status === "partially-accessible";
}

function applyMarkerStatusClasses(element, station) {
    const acc = station?.properties?.accessibility;
    const hasOutage = Boolean(acc?.hasOutage);
    const adaStatus = acc?.adaStatus;

    element.classList.toggle("has-outage", hasOutage);
    element.classList.toggle(
        "is-ada",
        !hasOutage && (adaStatus === "fully-accessible" || adaStatus === "partially-accessible")
    );
    element.classList.toggle("is-not-ada", !hasOutage && adaStatus === "not-accessible");
}

function formatAdaNotes(notes) {
    if (typeof notes !== "string") return null;
    const trimmed = notes.trim();
    if (!trimmed || trimmed.toLowerCase() === "nan" || trimmed.toLowerCase() === "null") {
        return null;
    }
    return trimmed;
}

function getAdaContextNote(adaStatus) {
    if (adaStatus === "partially-accessible") {
        return "Step-free access applies to specific lines, platforms, or directions.";
    }
    if (adaStatus === "not-accessible") {
        return "Station is open for service, but does not have ADA step-free access.";
    }
    return null;
}

function renderOutageList(items) {
    return (
        <ul>
            {items.map((item, idx) => (
                <li key={`${item.equipment}-${idx}`}>
                    <strong>{item.equipment}</strong> (
                    {item.type === "EL" ? "Elevator" : "Escalator"}) — {item.serving}
                    {item.reason ? ` (${item.reason})` : ""}
                    {item.outageDate ? ` · Start: ${item.outageDate}` : ""}
                    {item.estimatedReturnToService
                        ? ` · Est. return: ${item.estimatedReturnToService}`
                        : ""}
                    {item.alternativeRoute ? ` · Detour: ${item.alternativeRoute}` : ""}
                </li>
            ))}
        </ul>
    );
}

export default function TransitMap() {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markerElementsRef = useRef(new Map());
    const [selectedStation, setSelectedStation] = useState(null);
    const [stations, setStations] = useState([]);
    const [query, setQuery] = useState("");
    const [adaOnly, setAdaOnly] = useState(false);
    const [stationStatus, setStationStatus] = useState("loading");
    const [selectedRouteId, setSelectedRouteId] = useState(null);
    const [routeShapesReady, setRouteShapesReady] = useState(false);
    const [routeMeta, setRouteMeta] = useState(null);
    const [routeError, setRouteError] = useState("");
    const [stationRoutes, setStationRoutes] = useState(null);

    function selectStation(station) {
        setSelectedStation(station);
        setSelectedRouteId(null);
        setQuery("");
    }

    useEffect(() => {
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
            center: [-73.989, 40.746],
            zoom: 12,
            attributionControl: false,
        });
        mapRef.current = map;
        map.on("load", () => {
            for (const layer of map.getStyle().layers) {
                if (layer.type === "symbol") {
                    map.setLayerZoomRange(
                        layer.id,
                        Math.max(layer.minzoom ?? 0, 15),
                        layer.maxzoom ?? 24
                    );
                }
            }
        });

        map.addControl(new maplibregl.NavigationControl(), "top-right");

        const controller = new AbortController();

        async function loadStations() {
            try {
                const response = await fetch("/api/transit/stations", {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`Station request failed: ${response.status}`);
                }

                const result = await response.json();
                setStations(result.data.features);

                for (const station of result.data.features) {
                    const element = document.createElement("div");
                    element.className = "station-dot";
                    element.dataset.disabled = "true";
                    applyMarkerStatusClasses(element, station);

                    element.addEventListener("click", () => {
                        if (element.dataset.disabled === "true") return;

                        selectStation(station);
                    });

                    new maplibregl.Marker({
                        element,
                        anchor: "center",
                    }).setLngLat(station.geometry.coordinates).addTo(map);

                    markerElementsRef.current.set(station.properties.id, element);
                }

                setStationStatus("ready");

            } catch (error) {
                if (error.name !== "AbortError") {
                    console.error("Could not load stations:", error);
                    setStationStatus("error");
                }
            }
        }

        loadStations();

        return () => {
            controller.abort();
            map.remove();
            markerElementsRef.current.clear();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;

        if (!map) return;

        let stopped = false;
        let refreshTimer;
        let requestController;

        async function loadRouteShapes() {
            if(stopped) return;

            requestController = new AbortController();

            const timeoutTimer = setTimeout(() => {
                requestController.abort();
            }, 15000);

            try {
                const response = await fetch("/api/transit/route-shapes", {
                    signal: requestController.signal,
                    cache: "no-store",
                });

                if(!response.ok) {
                    throw new Error(
                        `Route shapes request failed: HTTP ${response.status}`
                    );
                }

                const result = await response.json();

                if(stopped) return;

                if (
                    !result.stationRoutes ||
                    typeof result.stationRoutes !== "object" ||
                    Array.isArray(result.stationRoutes) ||
                    !Object.values(result.stationRoutes).every(
                        (routes) =>
                            Array.isArray(routes) &&
                            routes.every((routeId) => typeof routeId === "string")
                    )
                ) {
                    throw new Error("Invalid station routes response");
                }

                const source = map.getSource("transit-routes");

                if(source) {
                    source.setData(result.data);
                }else{
                    map.addSource("transit-routes", {
                        type: "geojson",
                        data: result.data,
                    });

                    map.addLayer({
                        id: "transit-routes-base",
                        type: "line",
                        source: "transit-routes",
                        layout: {
                            "line-cap": "round",
                            "line-join": "round",
                        },
                        paint: {
                            "line-color": ["get", "color"],
                            "line-width": 3,
                            "line-opacity": 0.25,
                        },
                    });

                    map.addLayer({
                        id: "transit-routes-selected",
                        type: "line",
                        source: "transit-routes",
                        filter: ["==", ["get", "routeId"], ""],
                        layout: {
                            "line-cap": "round",
                            "line-join": "round",
                        },
                        paint: {
                            "line-color": ["get", "color"],
                            "line-width": 5,
                            "line-opacity": 1,
                        },
                    });
                }

                setStationRoutes(result.stationRoutes);
                setRouteMeta(result.meta);
                setRouteError("");
                setRouteShapesReady(true);
            } catch (error) {
                if(stopped) return;

                console.error("Failed to update route shapes:", error);

                setRouteError(
                    map.getSource("transit-routes")
                        ? "Could not refresh routes. Showing the last loaded schedule."
                        : "Could not load scheduled routes. Retrying automatically."
                );
            } finally {
                clearTimeout(timeoutTimer);

                if(!stopped) {
                    refreshTimer = setTimeout(loadRouteShapes, 60000);
                }
            }
        }

        if(map.isStyleLoaded()) {
            loadRouteShapes();
        } else {
            map.once("load", loadRouteShapes);
        }

        return () => {
            stopped = true;
            clearTimeout(refreshTimer);
            requestController?.abort();
            map.off("load", loadRouteShapes);
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;

        if(!map || !routeShapesReady) return;

        map.setFilter("transit-routes-selected", [
            "==",
            ["get", "routeId"],
            selectedRouteId ?? "",
        ]);

        map.setLayoutProperty(
            "transit-routes-base",
            "visibility",
            "visible"
        );

        map.setPaintProperty(
            "transit-routes-base",
            "line-opacity",
            selectedRouteId === null ? 0.5 : 0.2
        );
    }, [selectedRouteId, routeShapesReady]);

    useEffect(() => {
        for (const [stationId, element] of markerElementsRef.current) {
            element.classList.toggle("is-selected", stationId === selectedStation?.properties.id);
        }
        const map = mapRef.current;
        if (!map || !selectedStation) return;

        map.easeTo({
            center: selectedStation.geometry.coordinates,
            zoom: Math.max(map.getZoom(), 14),
            duration: 500,
        });
    }, [selectedStation]);

    useEffect(() => {
        for (const station of stations) {
            const element =
                markerElementsRef.current.get(station.properties.id);

            if (!element) continue;

            const stationId = station.properties.id;
            const routes = stationRoutes?.[stationId] ?? [];
            const isSelected =
                stationId === selectedStation?.properties.id;

            const belongsToRoute =
                selectedRouteId !== null &&
                routes.includes(selectedRouteId);

            const blocked =
                stationRoutes === null ||
                (
                    selectedStation !== null &&
                    !isSelected &&
                    !belongsToRoute
                );

            const dimmed =
                !isSelected &&
                (
                    stationRoutes === null ||
                    routes.length === 0 ||
                    (selectedStation !== null && !belongsToRoute)
                );

            element.classList.toggle("is-dimmed", dimmed);
            element.classList.toggle("is-disabled", blocked);
            element.dataset.disabled = String(blocked);
        }
    }, [stations, stationRoutes, selectedStation, selectedRouteId]);

    useEffect(() => {
        if (!selectedStation || stationRoutes === null) return;

        const routes =
            stationRoutes[selectedStation.properties.id] ?? [];

        if (
            selectedRouteId !== null &&
            routes.includes(selectedRouteId)
        ) {
            return;
        }

        const nextRouteId = routes[0] ?? null;

        if (nextRouteId !== selectedRouteId) {
            setSelectedRouteId(nextRouteId);
        }
    }, [selectedStation, stationRoutes, selectedRouteId]);

    const selectedStationRoutes = selectedStation
        ? stationRoutes?.[selectedStation.properties.id] ?? []
        : [];

    function isStationBlocked(station) {
        if (stationRoutes === null) return true;
        if (!selectedStation) return false;

        if (station.properties.id === selectedStation.properties.id) {
            return false;
        }

        const routes = stationRoutes[station.properties.id] ?? [];

        return (
            selectedRouteId === null ||
            !routes.includes(selectedRouteId)
        );
    }

    const searchTerm = query.trim().toLowerCase();

    const shouldShowResults = stationStatus === "ready" && (Boolean(searchTerm) || adaOnly);
    const matches = shouldShowResults
        ? stations.filter((station) => {
            const nameMatches = !searchTerm || station.properties.name.toLowerCase().includes(searchTerm);
            return nameMatches && (!adaOnly || isAdaStepFree(station));
        })
        : [];

    return (
        <section className="transit-map">
            <div ref={containerRef} className="transit-map__canvas" />

                <div className="station-search">
                    <div className="station-search__controls">
                        <input
                            type="search"
                            aria-label="Search stations"
                            placeholder="Search stations..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            disabled={stationStatus !== "ready"}
                        />
                        <button
                            type="button"
                            className="station-search__ada-toggle"
                            aria-pressed={adaOnly}
                            disabled={stationStatus !== "ready"}
                            onClick={() => setAdaOnly((prev) => !prev)}
                        >
                            {adaOnly ? "ADA step-free: ON" : "ADA step-free"}
                        </button>
                    </div>

                    {shouldShowResults && (
                        <div
                            className="station-search__results"
                            role="region"
                            aria-label="Filtered stations"
                        >
                            <div className="station-search__results-header">
                                <span>
                                    {adaOnly ? "ADA Step-Free Stations" : "Matching Stations"} (
                                    {matches.length})
                                </span>
                                {adaOnly && (
                                    <button type="button" onClick={() => setAdaOnly(false)}>
                                        Clear
                                    </button>
                                )}
                            </div>
                            {matches.length === 0 ? (
                                <p>No stations found.</p>
                            ) : (
                                matches.map((station) => {
                                    const status = station.properties.accessibility?.adaStatus;
                                    const hasOutage = station.properties.accessibility?.hasOutage;
                                    return (
                                        <button
                                            key={station.properties.id}
                                            type="button"
                                            disabled={isStationBlocked(station)}
                                            onClick={() => selectStation(station)}
                                        >
                                            <span>{station.properties.name}</span>
                                            <span>
                                                {adaOnly && status
                                                    ? ` · ${ADA_LABELS[status] ?? status}`
                                                    : ""}
                                                {hasOutage ? " · Outage" : ""}
                                            </span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

            <aside className="station-card" aria-label="Station details">
                {routeMeta && (
                    <p className="route-selection__note">
                        Scheduled service: {formatScheduleTime(routeMeta.windowStart)}
                        {" – "}
                        {formatScheduleTime(routeMeta.windowEnd)}
                    </p>
                )}

                {routeError && (
                    <p role="status" className="route-selection__note">
                        {routeError}
                    </p>
                )}
                {stationStatus === "loading" && (<p role="status">Loading stations...</p>)}

                {stationStatus === "error" && (<p role="alert">Could not load stations. Please refresh the page to try again.</p>)}

                {stationStatus === "ready" && (
                    selectedStation ? (
                        <>
                            <h2>{selectedStation.properties.name}</h2>
                            {stationRoutes === null ? (
                                <p>Waiting for scheduled service data.</p>
                            ) : selectedStationRoutes.length > 0 ? (
                                <div className="station-routes">
                                    {selectedStationRoutes.map((routeId) =>
                                        selectedStationRoutes.length === 1 ? (
                                            <span
                                                className="route-badge"
                                                key={routeId}
                                                style={getRouteStyle(routeId)}
                                            >
                                                {routeId}
                                            </span>
                                        ) : (
                                            <button
                                                key={routeId}
                                                type="button"
                                                className="route-button"
                                                style={getRouteStyle(routeId)}
                                                aria-pressed={selectedRouteId === routeId}
                                                onClick={() => setSelectedRouteId(routeId)}
                                            >
                                                {routeId}
                                            </button>
                                        )
                                    )}
                                </div>
                            ) : (
                                <p>No scheduled stops in the displayed time window.</p>
                            )}
                            {selectedRouteId && (
                                <div className="route-selection">
                                    <p role="status">
                                        Highlighting {selectedRouteId} stations.
                                    </p>
                                    <p className="route-selection__note">
                                        Showing scheduled stops within the displayed time window. Live changes may differ.
                                    </p>
                                </div>
                            )}
                                {(() => {
                                    const acc = selectedStation.properties.accessibility;
                                    if (!acc) {
                                        return <p>Accessibility details unavailable.</p>;
                                    }

                                    const cleanNotes = formatAdaNotes(acc.adaNotes);
                                    const adaContextNote = getAdaContextNote(acc.adaStatus);
                                    const activeOutages = [
                                        ...(acc.elevatorsOutOfService ?? []),
                                        ...(acc.escalatorsOutOfService ?? []),
                                    ];
                                    const availableElevators = acc.availableElevators ?? [];
                                    const upcomingOutages = acc.upcomingOutages ?? [];

                                    return (
                                        <div
                                            className="station-accessibility"
                                            aria-label="Elevator and escalator accessibility"
                                        >
                                            <p>
                                                <strong>ADA:</strong>{" "}
                                                {ADA_LABELS[acc.adaStatus] ?? acc.adaStatus}
                                            </p>
                                            {adaContextNote && <p>{adaContextNote}</p>}
                                            {cleanNotes && <p>{cleanNotes}</p>}

                                            {availableElevators.length > 0 && (
                                                <div className="station-accessibility__available">
                                                    <p>
                                                        <strong>
                                                            Available elevators (
                                                            {availableElevators.length}):
                                                        </strong>
                                                    </p>
                                                    <ul>
                                                        {availableElevators.map((el, idx) => (
                                                            <li key={`${el.equipment}-${idx}`}>
                                                                <strong>{el.equipment}</strong> —{" "}
                                                                {el.serving}
                                                                {el.isAda ? " (ADA)" : ""}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {acc.hasOutage ? (
                                                <div>
                                                    <p>
                                                        <strong>Out of service:</strong>{" "}
                                                        {acc.elevatorsOutOfServiceCount ?? 0}{" "}
                                                        elevator(s),{" "}
                                                        {acc.escalatorsOutOfServiceCount ?? 0}{" "}
                                                        escalator(s)
                                                    </p>
                                                    {renderOutageList(activeOutages)}
                                                </div>
                                            ) : (
                                                <p>No active elevator or escalator outages.</p>
                                            )}

                                            {upcomingOutages.length > 0 && (
                                                <div className="station-accessibility__upcoming">
                                                    <p>
                                                        <strong>
                                                            Upcoming planned outage(s) (
                                                            {upcomingOutages.length}):
                                                        </strong>
                                                    </p>
                                                    {renderOutageList(upcomingOutages)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            <button type="button" onClick={() => { setSelectedRouteId(null); setSelectedStation(null) }}>Close</button>
                        </>
                    ) : (
                        <p>
                            {stations.length === 0 ? "No stations available." : "Select a station on the map or search for one."}
                        </p>
                    )
                )}
            </aside>
        </section>
    );
}