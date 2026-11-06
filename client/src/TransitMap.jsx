import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./TransitMap.css";

maplibregl.setWorkerUrl(workerUrl);

export default function TransitMap() {
    const containerRef = useRef(null);
    const [selectedStation, setSelectedStation] = useState(null);
    const [stations, setStations] = useState([]);
    const [query, setQuery] = useState("");

    useEffect(() => {
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: "https://demotiles.maplibre.org/style.json",
            center: [-73.989, 40.746],
            zoom: 12,
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
                    const marker = new maplibregl.Marker({color: "#ffc247"}).setLngLat(station.geometry.coordinates).addTo(map);

                    marker.getElement().addEventListener("click", () => {
                        setSelectedStation(station);
                    });
                }
            }catch(error) {
                if(error.name !== "AbortError") {
                    console.error("Could not load stations:", error);
                }
            }
        }

        loadStations();

        return () => {
            controller.abort();
            map.remove();
        };
}, []);

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
                />
                {searchTerm && (
                    <div className="station-search__results">
                        {matches.length === 0 ? (
                            <p>No stations found.</p>
                        ) : (
                            matches.map(station => (
                                <button
                                    key={station.properties.id}
                                    type="button"
                                    onClick={() => {setSelectedStation(station); setQuery("");}}
                                >
                                    {station.properties.name}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
            <aside className="station-card" aria-label="Station details">
                {selectedStation ? (
                <>
                    <h2>{selectedStation.properties.name}</h2>
                    <p>Routes: {selectedStation.properties.routes.join(", ")}</p>
                    <button type="button" onClick={() => setSelectedStation(null)}>Close</button>
                </>
                ) : (
                    <p>Select a station on the map.</p>
                )}
            </aside>
        </section>
    );
}