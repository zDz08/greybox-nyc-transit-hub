import React, { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(workerUrl);

export default function TransitMap() {
    const containerRef = useRef(null);

    useEffect(() => {
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: "https://demotiles.maplibre.org/style.json",
            center: [-73.989, 40.746],
            zoom: 12,
        });

        map.addControl(new maplibregl.NavigationControl(), "top-right");

        return () => map.remove();
}, []);

    return <div ref={containerRef} style={{width: "100%", height: "70vh"}} />;
}