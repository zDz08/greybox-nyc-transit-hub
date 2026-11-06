import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(workerUrl);

export default function TransitMap() {
    const containerRef = useRef(null);
    const [selectedStation, setSelectedStation] = useState(null);

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

    return (
        <section>
            <div ref={containerRef} style={{width: "100%", height: "70vh"}} />

            {selectedStation ? (
                <div>
                    <h2>{selectedStation.properties.name}</h2>
                    <p>Routes: {selectedStation.properties.routes.join(", ")}</p>
                    <button type="button" onClick={() => setSelectedStation(null)}>Close</button>
                </div>
                ) : (
                    <p>Select a station on the map.</p>
                )}
        </section>
    );
}