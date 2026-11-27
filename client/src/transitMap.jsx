import React, { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./transitMap.css";
import { getRouteStyle, routeColors } from "./routeColors.js";
import { startAutoRefresh } from "./autoRefresh.js";
import StationArrivals from "./stationArrivals.jsx";
import { StationInfoOnly } from "./stationInfoLinks.jsx";
import AccessibilityDetails from "./accessibilityDetails.jsx";

const MAP_MIN_ZOOM = 12;
const STATION_INTERACTION_ZOOM = 12.5;
const MAP_MAX_ZOOM = 16;

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

function applyMarkerStatusClasses(element, station, accessibilityMode) {
    if (!accessibilityMode) {
        element.classList.remove("has-outage", "is-ada", "is-not-ada");
        return;
    }

    const acc = station?.properties?.accessibility;
    const outageKnown = acc?.outageFeedAvailable !== false;
    const hasOutage = outageKnown && Boolean(acc?.hasOutage);
    const adaStatus = acc?.adaStatus;

    element.classList.toggle("has-outage", hasOutage);
    element.classList.toggle(
        "is-ada",
        outageKnown &&
            !hasOutage &&
            (adaStatus === "fully-accessible" || adaStatus === "partially-accessible")
    );
    element.classList.toggle(
        "is-not-ada",
        outageKnown && !hasOutage && adaStatus === "not-accessible"
    );
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

export default function TransitMap({ requestedCommute, onSignIn, onOpenAlerts }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markerElementsRef = useRef(new Map());
    const arrivalsRefreshRef = useRef(null);
    const stationCardRef = useRef(null);
    const openedCommuteRef = useRef(null);
    const [selectedStation, setSelectedStation] = useState(null);
    const [stations, setStations] = useState([]);
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef(null);
    const [accessibilityMode, setAccessibilityMode] = useState(false);
    const [showAccessibilityOptions, setShowAccessibilityOptions] = useState(false);
    const [adaOnly, setAdaOnly] = useState(false);
    const [stationStatus, setStationStatus] = useState("loading");
    const [selectedRouteId, setSelectedRouteId] = useState(null);
    const [routeShapesReady, setRouteShapesReady] = useState(false);
    const [routeError, setRouteError] = useState("");
    const [stationRoutes, setStationRoutes] = useState(null);
    const [isZoomedOut, setIsZoomedOut] = useState(false);
    const [mapStyleReady, setMapStyleReady] = useState(false);
    const [stationDirections, setStationDirections] = useState({});
    const [isStationCardCollapsed, setIsStationCardCollapsed] = useState(false);
    const [stationRouteShapes, setStationRouteShapes] = useState({});
    const [initialDirectionStopId, setInitialDirectionStopId] = useState(null);
    const [stationSelectionVersion, setStationSelectionVersion] = useState(0);
    const [tripSelection, setTripSelection] = useState(null);

    const isMapFocused = selectedStation !== null;

    const highlightedRouteId = isMapFocused ? selectedRouteId : null;

    const arrivalSelectionKey = JSON.stringify([
        stationSelectionVersion,
        selectedStation?.properties.id ?? null,
        selectedRouteId,
    ]);

    const currentTripSelection =
        tripSelection?.selectionKey === arrivalSelectionKey
            ? tripSelection
            : null;

    const hasTripSelection =
        Boolean(currentTripSelection?.selectedId);

    const activeTrip = currentTripSelection?.arrival ?? null;

    const tripStationIds = useMemo(
        () => new Set(
            (activeTrip?.remainingStops ?? [])
                .map((stop) => stop.stationId)
                .filter(Boolean)
        ),
        [activeTrip]
    );

    function selectStation(station) {
        setSelectedStation(station);
        setSelectedRouteId(null);
        setQuery("");
        setIsStationCardCollapsed(false);
        setInitialDirectionStopId(null);
        setStationSelectionVersion((previous) => previous + 1);
        setTripSelection(null);
    }

    function closeStationCard() {
        setSelectedStation(null);
        setSelectedRouteId(null);
        setInitialDirectionStopId(null);
        setIsStationCardCollapsed(false);
        setQuery("");
        setTripSelection(null);
    }

    useEffect(() => {
        if (!searchOpen) return;

        function handlePointerDown(event) {
            const root = searchRef.current;
            if (!root || !(event.target instanceof Element)) return;

            const insideSearch =
                root.contains(event.target) &&
                event.target.closest('input[type="search"], .station-search__results');

            if (!insideSearch) setSearchOpen(false);
        }

        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown, true);
        };
    }, [searchOpen]);

    useEffect(() => {
        if (!requestedCommute || stationStatus !== "ready" || openedCommuteRef.current === requestedCommute) return;
        openedCommuteRef.current = requestedCommute;
        const station = stations.find((item) => item.properties.id === requestedCommute.stationId);
        if (!station) {
            setSelectedStation(null);
            setSelectedRouteId(null);
            setRouteError("This saved station is unavailable in the current station data.");
            return;
        }
        setSelectedStation(station);
        setSelectedRouteId(requestedCommute.routeId);
        setInitialDirectionStopId(requestedCommute.stopId);
        setStationSelectionVersion((previous) => previous + 1);
        setQuery("");
        setIsStationCardCollapsed(false);
    }, [requestedCommute, stations, stationStatus]);

    useEffect(() => {
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
            center: [-73.989, 40.746],
            zoom: 12.5,
            minZoom: MAP_MIN_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
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

            setMapStyleReady(true);
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
                    applyMarkerStatusClasses(element, station, false);

                    element.addEventListener("click", () => {
                        if (
                            map.getZoom() < STATION_INTERACTION_ZOOM ||
                            element.dataset.disabled === "true"
                        ) {
                            return;
                        }

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
        for (const station of stations) {
            const element = markerElementsRef.current.get(station.properties.id);
            if (element) {
                applyMarkerStatusClasses(element, station, accessibilityMode);
            }
        }
    }, [stations, accessibilityMode]);

    useEffect(() => {
        if (!accessibilityMode) {
            setAdaOnly(false);
        }
    }, [accessibilityMode]);

    useEffect(() => {
        const map = mapRef.current;

        if (!map) return;

        function updateZoomState() {
            setIsZoomedOut(
                map.getZoom() < STATION_INTERACTION_ZOOM
            );
        }

        updateZoomState();
        map.on("zoom", updateZoomState);

        return () => {
            map.off("zoom", updateZoomState);
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;

        if (!map) return;

        let stopped = false;
        let stopAutoRefresh;
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

                if (map.getLayer("station-labels")) {
                    map.moveLayer("station-labels");
                }
                setStationRoutes(result.stationRoutes);
                setStationDirections(result.stationDirections ?? {});
                setStationRouteShapes(result.stationRouteShapes ?? {});
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
            }
        }

        function startTransitRefresh() {
            if (stopped || stopAutoRefresh) return;

            stopAutoRefresh = startAutoRefresh([
                {
                    name: "scheduled-service",
                    run: loadRouteShapes,
                },
                {
                    name: "realtime-arrivals",
                    run: () => arrivalsRefreshRef.current?.(),
                },
            ]);
        }

        if (map.isStyleLoaded()) {
            startTransitRefresh();
        } else {
            map.once("load", startTransitRefresh);
        }

        return () => {
            stopped = true;
            stopAutoRefresh?.();
            requestController?.abort();
            map.off("load", startTransitRefresh);
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;

        if (!map || !routeShapesReady) return;

        const stationId = selectedStation?.properties.id;

        const shapeIds =
            stationId && highlightedRouteId !== null
                ? stationRouteShapes[stationId]?.[highlightedRouteId] ?? []
                : [];

        const emptyCollection = {
            type: "FeatureCollection",
            features: [],
        };

        if (!map.getSource("selected-trip")) {
            map.addSource("selected-trip", {
                type: "geojson",
                data: emptyCollection,
            });
        }

        if (!map.getLayer("selected-trip-line")) {
            map.addLayer({
                id: "selected-trip-line",
                type: "line",
                source: "selected-trip",
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

        const geometry =
            activeTrip?.path?.status === "matched"
                ? activeTrip.path.geometry
                : null;

        const tripData =
            hasTripSelection && geometry?.type === "LineString"
                ? {
                    type: "FeatureCollection",
                    features: [
                        {
                            type: "Feature",
                            properties: {
                                color:
                                    routeColors[highlightedRouteId] ??
                                    "#ffc247",
                            },
                            geometry,
                        },
                    ],
                }
                : emptyCollection;

        map.getSource("selected-trip").setData(tripData);

        map.setFilter(
            "transit-routes-selected",
            hasTripSelection
                ? ["==", ["get", "routeId"], ""]
                : [
                    "all",
                    ["==", ["get", "routeId"], highlightedRouteId ?? ""],
                    [
                        "in",
                        ["get", "shapeId"],
                        ["literal", shapeIds],
                    ],
                ]
        );

        map.setLayoutProperty(
            "transit-routes-base",
            "visibility",
            "visible"
        );

        map.setPaintProperty(
            "transit-routes-base",
            "line-opacity",
            highlightedRouteId === null ? 0.5 : 0.2
        );

        map.setPaintProperty(
            "transit-routes-base",
            "line-color",
            highlightedRouteId === null
                ? ["get", "color"]
                : "#9db2ce"
        );

        if (map.getLayer("station-labels")) {
            map.moveLayer("station-labels");
        }
    }, [
        selectedStation,
        highlightedRouteId,
        stationRouteShapes,
        routeShapesReady,
        hasTripSelection,
        activeTrip,
    ]);

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
            const stationId = station.properties.id;
            const element = markerElementsRef.current.get(stationId);

            if (!element) continue;

            const routes = stationRoutes?.[stationId] ?? [];

            const isSelected =
                stationId === selectedStation?.properties.id;

            const belongsToSelection = hasTripSelection
                ? tripStationIds.has(stationId)
                : highlightedRouteId !== null &&
                    routes.includes(highlightedRouteId);

            const blockedBySelection =
                isMapFocused &&
                !isSelected &&
                !belongsToSelection;

            const blocked =
                isZoomedOut ||
                (!hasTripSelection && stationRoutes === null) ||
                blockedBySelection;

            const dimmed =
                !isSelected &&
                (
                    blockedBySelection ||
                    (
                        !hasTripSelection &&
                        (
                            stationRoutes === null ||
                            routes.length === 0
                        )
                    )
                );

            element.classList.toggle("is-compact", isZoomedOut);
            element.classList.toggle("is-dimmed", dimmed);
            element.classList.toggle("is-disabled", blocked);
            element.dataset.disabled = String(blocked);
        }
    }, [
        stations,
        stationRoutes,
        selectedStation,
        highlightedRouteId,
        isMapFocused,
        isZoomedOut,
        hasTripSelection,
        tripStationIds,
    ]);

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

        if (selectedStation.properties.id === requestedCommute?.stationId && selectedRouteId === requestedCommute.routeId) return;

        const nextRouteId = routes[0] ?? null;

        if (nextRouteId !== selectedRouteId) {
            setSelectedRouteId(nextRouteId);
        }
    }, [selectedStation, stationRoutes, selectedRouteId, requestedCommute]);

    useEffect(() => {
        const map = mapRef.current;

        if (!map || !mapStyleReady || stations.length === 0) return;

        function updateStationLabels() {
            const visibleStations = stations.filter((station) => {
                if (!isMapFocused) return true;

                const stationId = station.properties.id;

                if (stationId === selectedStation?.properties.id) {
                    return true;
                }

                if (hasTripSelection) {
                    return tripStationIds.has(stationId);
                }

                if (highlightedRouteId === null) return false;

                const routes = stationRoutes?.[stationId] ?? [];

                return routes.includes(highlightedRouteId);
            });

            const data = {
                type: "FeatureCollection",
                features: visibleStations.map((station) => ({
                    type: "Feature",
                    geometry: station.geometry,
                    properties: {
                        id: station.properties.id,
                        name: station.properties.name,
                        selected:
                            station.properties.id ===
                            selectedStation?.properties.id,
                    },
                })),
            };

            const source = map.getSource("station-labels");

            if (source) {
                source.setData(data);
            } else {
                map.addSource("station-labels", {
                    type: "geojson",
                    data,
                });
            }

            if (!map.getLayer("station-labels")) {
                const fonts = ["Open Sans Regular"];

                map.addLayer({
                    id: "station-labels",
                    type: "symbol",
                    source: "station-labels",
                    minzoom: STATION_INTERACTION_ZOOM,
                    layout: {
                        "text-field": ["get", "name"],
                        "text-font": fonts,
                        "text-size": 11,
                        "text-anchor": "left",
                        "text-offset": [0.9, 0],
                        "text-max-width": 12,
                        "text-padding": 5,
                        "text-allow-overlap": false,
                        "text-ignore-placement": false,
                        "symbol-sort-key": [
                            "case",
                            ["get", "selected"],
                            0,
                            1,
                        ],
                    },
                    paint: {
                        "text-color": [
                            "case",
                            ["get", "selected"],
                            "#ffc247",
                            "#dce3eb",
                        ],
                        "text-halo-color": "#10151b",
                        "text-halo-width": 1.5,
                    },
                });
            }

            map.moveLayer("station-labels");
        }

        updateStationLabels();
    }, [stations, stationRoutes, highlightedRouteId, selectedStation, isMapFocused, mapStyleReady, hasTripSelection, tripStationIds]);

    useEffect(() => {
        const container = containerRef.current;
        const map = mapRef.current;

        if (!container || !map) return;

        const observer = new ResizeObserver(() => {
            if (container.clientWidth > 0 && container.clientHeight > 0) {
                map.resize();
            }
        });

        observer.observe(container);

        return () => observer.disconnect();
    }, []);

    const selectedStationRoutes = selectedStation
        ? stationRoutes?.[selectedStation.properties.id] ?? []
        : [];

    function isStationBlocked() {
        return stationRoutes === null;
    }

    const effectiveAdaOnly = accessibilityMode && adaOnly;
    const searchTerm = query.trim().toLowerCase();

    const shouldShowResults =
        stationStatus === "ready" && searchOpen && (Boolean(searchTerm) || effectiveAdaOnly);
    const matches = shouldShowResults
        ? stations.filter((station) => {
            const nameMatches =
                !searchTerm ||
                station.properties.name.toLowerCase().includes(searchTerm);
            return nameMatches && (!effectiveAdaOnly || isAdaStepFree(station));
        })
        : [];

    const stationAccessibility =
        selectedStation && accessibilityMode ? (
            <AccessibilityDetails
                accessibility={selectedStation.properties.accessibility}
                label={
                    ADA_LABELS[
                        selectedStation.properties.accessibility?.adaStatus
                    ] ?? "Accessibility status unavailable"
                }
                contextNote={getAdaContextNote(
                    selectedStation.properties.accessibility?.adaStatus
                )}
                notes={formatAdaNotes(
                    selectedStation.properties.accessibility?.adaNotes ?? ""
                )}
            />
        ) : null;

    return (
        <section className="transit-map">
            <div ref={containerRef} className="transit-map__canvas" />

                <div
                    className="station-search"
                    ref={searchRef}
                    onBlur={(event) => {
                        const next = event.relatedTarget;
                        const staysInSearch =
                            next instanceof Element &&
                            event.currentTarget.contains(next) &&
                            next.closest('input[type="search"], .station-search__results');

                        if (!staysInSearch) setSearchOpen(false);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Escape" && searchOpen) {
                            event.preventDefault();
                            searchRef.current?.querySelector('input[type="search"]')?.focus();
                            setSearchOpen(false);
                        }
                    }}
                >
                    <div className="station-search__controls">
                        <input
                            type="search"
                            aria-label="Search stations"
                            placeholder="Search stations..."
                            value={query}
                            onFocus={() => {
                                setSearchOpen(true);
                                setShowAccessibilityOptions(false);
                            }}
                            onClick={() => setSearchOpen(true)}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setSearchOpen(true);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "ArrowDown" && shouldShowResults) {
                                    const first = searchRef.current?.querySelector(
                                        ".station-search__results button:not(:disabled)[data-station-result]"
                                    );

                                    if (first) {
                                        event.preventDefault();
                                        first.focus();
                                    }
                                }
                            }}
                            disabled={stationStatus !== "ready"}
                        />
                        <div
                            className="accessibility-control"
                            onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                    setShowAccessibilityOptions(false);
                                    event.currentTarget.querySelector("button")?.focus();
                                }
                            }}
                        >
                            <button
                                type="button"
                                className="accessibility-control__button"
                                aria-label="Accessibility options"
                                aria-expanded={showAccessibilityOptions}
                                aria-controls="accessibility-options"
                                data-active={accessibilityMode}
                                disabled={stationStatus !== "ready"}
                                onClick={() =>
                                    setShowAccessibilityOptions((previous) => !previous)
                                }
                            >
                                <svg
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <circle cx="12" cy="4" r="2" />
                                    <path d="M4 9l8 2 8-2 M12 11v5 M12 16l-4 5 M12 16l4 5" />
                                </svg>
                            </button>

                            {showAccessibilityOptions && (
                                <div
                                    id="accessibility-options"
                                    className="accessibility-options"
                                    role="region"
                                    aria-label="Accessibility options"
                                >
                                    <strong>Accessibility</strong>

                                    <label>
                                        <span>Show accessibility information</span>
                                        <input
                                            type="checkbox"
                                            checked={accessibilityMode}
                                            onChange={(event) => {
                                                const enabled = event.target.checked;
                                                setAccessibilityMode(enabled);

                                                if (!enabled) setAdaOnly(false);
                                            }}
                                        />
                                    </label>

                                    <label>
                                        <span>Search step-free stations only</span>
                                        <input
                                            type="checkbox"
                                            checked={accessibilityMode && adaOnly}
                                            disabled={!accessibilityMode}
                                            onChange={(event) =>
                                                setAdaOnly(event.target.checked)
                                            }
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>

                    {shouldShowResults && (
                        <div
                            className="station-search__results"
                            role="region"
                            aria-label="Filtered stations"
                        >
                            <div className="station-search__results-header">
                                <span>
                                    {effectiveAdaOnly
                                        ? "ADA Step-Free Stations"
                                        : "Matching Stations"}{" "}
                                    ({matches.length})
                                </span>
                                {effectiveAdaOnly && (
                                    <button type="button" onClick={() => setAdaOnly(false)}>
                                        Clear
                                    </button>
                                )}
                            </div>
                            {matches.length === 0 ? (
                                <p>No stations found.</p>
                            ) : (
                                matches.map((station) => {
                                    const acc = station.properties.accessibility;
                                    const status = acc?.adaStatus;
                                    const outageKnown = acc?.outageFeedAvailable !== false;
                                    const hasOutage = outageKnown && Boolean(acc?.hasOutage);
                                    const rowRoutes =
                                        stationRoutes?.[station.properties.id] ??
                                        station.properties.routes ??
                                        [];

                                    return (
                                        <button
                                            key={station.properties.id}
                                            type="button"
                                            disabled={isStationBlocked(station)}
                                            data-station-result
                                                onClick={() => {
                                                    selectStation(station);
                                                    setSearchOpen(false);
                                                }}
                                        >
                                            <span>
                                                {station.properties.name}
                                                {rowRoutes.length > 0
                                                    ? ` (${rowRoutes.join(", ")})`
                                                    : ""}
                                            </span>
                                            {accessibilityMode && (
                                                <span>
                                                    {effectiveAdaOnly && status
                                                        ? ` · ${ADA_LABELS[status] ?? status}`
                                                        : ""}
                                                    {!outageKnown
                                                        ? " · Status unavailable"
                                                        : hasOutage
                                                            ? " · Outage"
                                                            : ""}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

            <aside
                ref={stationCardRef}
                className={`station-card${
                    isStationCardCollapsed ? " is-collapsed" : ""
                }`}
                aria-label="Station details"
                hidden={
                    !selectedStation &&
                    stationStatus === "ready" &&
                    stations.length > 0 &&
                    !routeError
                }
            >
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
                            <div className="station-card__header">
                                <h2>{selectedStation.properties.name}</h2>

                                <button
                                    type="button"
                                    className="station-card__toggle"
                                    aria-label={
                                        isStationCardCollapsed
                                            ? "Expand station details"
                                            : "Collapse station details"
                                    }
                                    aria-expanded={!isStationCardCollapsed}
                                    aria-controls="station-card-content"
                                    onClick={() => {
                                        setIsStationCardCollapsed((previous) => !previous);
                                        stationCardRef.current?.scrollTo({ top: 0 });
                                    }}
                                >
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d={
                                                isStationCardCollapsed
                                                    ? "M6 15l6-6 6 6"
                                                    : "M6 9l6 6 6-6"
                                            }
                                        />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    className="station-card__dismiss"
                                    aria-label="Close station details"
                                    onClick={closeStationCard}
                                >
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        aria-hidden="true"
                                    >
                                        <path d="M6 6l12 12M18 6L6 18" />
                                    </svg>
                                </button>
                            </div>
                                <div
                                    id="station-card-content"
                                    hidden={isStationCardCollapsed}
                                >
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
                                                    onClick={() => {
                                                        if (routeId === selectedRouteId) return;

                                                        setInitialDirectionStopId(null);
                                                        setSelectedRouteId(routeId);
                                                    }}
                                                >
                                                    {routeId}
                                                </button>
                                            )
                                        )}
                                    </div>
                                ) : (
                                    <p>No scheduled stops in the displayed time window.</p>
                                )}
                                {selectedRouteId && stationRoutes !== null && !selectedStationRoutes.includes(selectedRouteId) && (
                                    <p>Saved line {selectedRouteId} has no scheduled stops in this time window.</p>
                                )}
                                {selectedRouteId ? (
                                    <StationArrivals
                                        key={`${stationSelectionVersion}:${selectedStation.properties.id}:${selectedRouteId}`}
                                        stationId={selectedStation.properties.id}
                                        stationName={selectedStation.properties.name}
                                        routeId={selectedRouteId}
                                        onSignIn={onSignIn}
                                        initialStopId={initialDirectionStopId}
                                        directionLabels={selectedStation.properties.directionLabels}
                                        destinationLabels={
                                            stationDirections[selectedStation.properties.id]?.[
                                                selectedRouteId
                                            ] ?? {}
                                        }
                                        stationDetails={stationAccessibility}
                                        accessibilityEnabled={accessibilityMode}
                                        accessibility={selectedStation.properties.accessibility}
                                        onOpenAlerts={onOpenAlerts}
                                        selectionKey={arrivalSelectionKey}
                                        onTripSelectionChange={setTripSelection}
                                        refreshRef={arrivalsRefreshRef}
                                        />
                                ) : (
                                    <StationInfoOnly
                                        key={selectedStation.properties.id}
                                        details={stationAccessibility}
                                        accessibilityEnabled={accessibilityMode}
                                        accessibility={selectedStation.properties.accessibility}
                                    />
                                )}
                            </div>
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
