import React, { createContext, useContext, useEffect, useState } from "react";
import { startAutoRefresh } from "./autoRefresh.js";

const ServiceAlertsContext = createContext(null);

export function ServiceAlertsProvider({ children }) {
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => {
        let disposed = false;
        let controller;

        async function refresh() {
            controller = new AbortController();

            const timeout = setTimeout(
                () => controller.abort(),
                15000
            );

            try {
                const response = await fetch(
                    "/api/transit/service-alerts",
                    {
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                if (!response.ok) {
                    throw new Error("Service alerts request failed.");
                }

                const payload = await response.json();

                if (
                    !Array.isArray(payload.data?.alerts) ||
                    !payload.meta?.feedUpdatedAt
                ) {
                    throw new Error("Invalid service alerts response.");
                }

                if (!disposed) {
                    setResult(payload);
                    setError("");
                }
            } catch {
                if (!disposed) {
                    setError(
                        "Could not update service alerts. Retrying automatically."
                    );
                }
            } finally {
                clearTimeout(timeout);
            }
        }

        const stop = startAutoRefresh([
            {
                name: "service-alerts",
                run: refresh,
            },
        ]);

        return () => {
            disposed = true;
            stop();
            controller?.abort();
        };
    }, []);


    return (
        <ServiceAlertsContext.Provider value={{ result, error }}>
            {children}
        </ServiceAlertsContext.Provider>
    );
}

export function useServiceAlerts() {
    return useContext(ServiceAlertsContext);
}
