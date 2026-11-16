// Colors from the MTA official line-color dataset.
const colorGroups = [
    { routes: ["1", "2", "3"], color: "#D82233" },
    { routes: ["4", "5", "6", "6X"], color: "#009952" },
    { routes: ["7", "7X"], color: "#9A38A1" },
    { routes: ["A", "C", "E"], color: "#0062CF" },
    { routes: ["B", "D", "F", "FX", "M"], color: "#EB6800" },
    { routes: ["G"], color: "#799534" },
    { routes: ["J", "Z"], color: "#8E5C33" },
    { routes: ["L", "S", "FS", "GS", "H"], color: "#7C858C" },
    { routes: ["N", "Q", "R", "W"], color: "#F6BC26" },
    { routes: ["SI", "SIR"], color: "#08179C" },
];

export const routeColors = Object.fromEntries(
    colorGroups.flatMap(({ routes, color }) =>
        routes.map((routeId) => [routeId, color])
    )
);

export function getRouteStyle(routeId) {
    const color = routeColors[routeId] ?? "#7C858C";

    return {
        "--route-color": color,
        "--route-text-color": color === "#F6BC26" ? "#111820" : "#ffffff",
    };
}