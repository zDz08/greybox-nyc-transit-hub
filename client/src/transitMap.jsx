import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./transitMap.css";

maplibregl.setWorkerUrl(workerUrl);

export default function TransitMap() {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markerElementsRef = useRef(new Map());
    const [selectedStation, setSelectedStation] = useState(null);
    const [stations, setStations] = useState([]);
    const [query, setQuery] = useState("");
    const [stationStatus, setStationStatus] = useState("loading");
    const [selectedRouteId, setSelectedRouteId] = useState(null);

    function selectStation(station) {
        const routes = station.properties.routes;

        setSelectedStation(station);
        setSelectedRouteId(routes[0] ?? null);
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
            for(const layer of map.getStyle().layers) {
                if(layer.type === "symbol") {
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

                if(!response.ok) {
                    throw new Error(`Station request failed: ${response.status}`);
                }

                const result = await response.json();
                setStations(result.data.features);

                for(const station of result.data.features) {
                    const element = document.createElement("div");
                    element.className = "station-dot";

                    element.addEventListener("click", () => {
                        selectStation(station);
                    });

                    new maplibregl.Marker({
                        element,
                        anchor: "center",
                    }).setLngLat(station.geometry.coordinates).addTo(map);

                    markerElementsRef.current.set(station.properties.id, element);
                }

                setStationStatus("ready");

            }catch(error) {
                if(error.name !== "AbortError") {
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
    for(const [stationId, element] of markerElementsRef.current) {
        element.classList.toggle("is-selected", stationId === selectedStation?.properties.id);
    }
    const map = mapRef.current;
    if(!map || !selectedStation) return;

    map.easeTo({
        center: selectedStation.geometry.coordinates,
        zoom: Math.max(map.getZoom(), 14),
        duration: 500,
    });
}, [selectedStation]);

useEffect(() => {
    for(const station of stations) {
        const element = markerElementsRef.current.get(station.properties.id);

        if(!element) continue;

        const belongsToRoute = selectedRouteId === null || station.properties.routes.includes(selectedRouteId);

        element.classList.toggle("is-dimmed", !belongsToRoute);
    }
}, [stations, selectedRouteId]);

const searchTerm = query.trim().toLowerCase();

const matches = searchTerm ? stations.filter(station => station.properties.name.toLowerCase().includes(searchTerm)) : [];

    return (
        <section className="transit-map">
            <div ref={containerRef} className="transit-map__canvas" />

            <div className="station-search">
                <input
                    type="search"
                    aria-label="Search stations"
                    placeholder="Search stations..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={stationStatus !== "ready"}
                />
                {stationStatus === "ready" &&searchTerm && (
                    <div className="station-search__results">
                        {matches.length === 0 ? (
                            <p>No stations found.</p>
                        ) : (
                            matches.map(station => (
                                <button
                                    key={station.properties.id}
                                    type="button"
                                    onClick={() => selectStation(station)}
                                >
                                    {station.properties.name}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
            <aside className="station-card" aria-label="Station details">
                {stationStatus === "loading" && (<p role="status">Loading stations...</p>)}

                {stationStatus === "error" && (<p role="alert">Could not load stations. Please refresh the page to try again.</p>)}

                {stationStatus === "ready" && (
                    selectedStation ? (
                    <>
                        <h2>{selectedStation.properties.name}</h2>
                        {selectedStation.properties.routes.length > 0 ? (
                            <div className="station-routes">
                                {selectedStation.properties.routes.map((routeId) =>
                                    selectedStation.properties.routes.length === 1 ? (
                                        <span className="route-badge" key={routeId}>
                                            {routeId}
                                        </span>
                                    ) : (
                                        <button
                                            key={routeId}
                                            type="button"
                                            className="route-button"
                                            aria-pressed={selectedRouteId === routeId}
                                            onClick={() => setSelectedRouteId(routeId)}
                                        >
                                            {routeId}
                                        </button>
                                    )
                                )}
                            </div>
                        ) : (
                            <p>No line information is available.</p>
                        )}
                        {selectedRouteId && (
                            <div className="route-selection">
                                <p role="status">
                                    Highlighting {selectedRouteId} stations.
                                </p>
                                <p className="route-selection__note">
                                    Based on daytime service. Temporary changes are not shown.
                                </p>
                            </div>
                        )}
                        <button type="button" onClick={() => {setSelectedRouteId(null); setSelectedStation(null)}}>Close</button>
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