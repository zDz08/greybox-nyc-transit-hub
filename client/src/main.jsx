import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Account from "./account.jsx";
import { AccountProvider } from "./accountContext.jsx";
import SavedCommutes from "./savedCommutes.jsx";
import TransitMap from "./transitMap.jsx";
import "./app.css";

const pages = [
    { id: "map", label: "Map" },
    { id: "saved", label: "Saved" },
    { id: "status", label: "Status" },
    { id: "settings", label: "Settings" },
];

function NavigationIcon({ name }) {
    const paths = {
        map: "M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5z M9 3v16 M15 5v16",
        saved: "M6 3h12v18l-6-4-6 4V3z",
        status: "M3 12h4l3-7 4 14 3-7h4",
        settings:
            "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
    };

    return (
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
            <path d={paths[name]} />
        </svg>
    );
}

function App() {
    const [activePage, setActivePage] = useState("map");
    const [requestedCommute, setRequestedCommute] = useState(null);

    return (
        <div className="app-shell">
            <nav className="app-nav" aria-label="Main navigation">
                <div className="app-brand">
                    <strong>Greybox</strong>
                    <span>NYC Transit Hub</span>
                </div>

                <div className="app-nav__items">
                    {pages.map((page) => (
                        <button
                            key={page.id}
                            type="button"
                            className="app-nav__button"
                            aria-current={
                                activePage === page.id ? "page" : undefined
                            }
                            onClick={() => setActivePage(page.id)}
                        >
                            <NavigationIcon name={page.id} />
                            <span>{page.label}</span>
                        </button>
                    ))}
                </div>
            </nav>

            <main className="app-content">
                <div
                    className="app-map-page"
                    hidden={activePage !== "map"}
                >
                    <TransitMap
                        requestedCommute={requestedCommute}
                        onSignIn={() => setActivePage("settings")}
                    />
                </div>

                {activePage === "saved" && (
                    <section className="app-page" aria-labelledby="saved-title">
                        <header className="app-page__header">
                            <p className="app-eyebrow">YOUR COMMUTE</p>
                            <h1 id="saved-title">Saved</h1>
                            <p>Your regular stations and directions, in one place.</p>
                        </header>

                        <SavedCommutes
                            onExplore={() => setActivePage("map")}
                            onSignIn={() => setActivePage("settings")}
                            onOpen={(commute) => {
                                setRequestedCommute({ ...commute });
                                setActivePage("map");
                            }}
                        />
                    </section>
                )}

                {activePage === "status" && (
                    <section className="app-page" aria-labelledby="status-title">
                        <header className="app-page__header">
                            <p className="app-eyebrow">PLAN AHEAD</p>
                            <h1 id="status-title">Service status</h1>
                            <p>Current disruptions and upcoming service changes.</p>
                        </header>

                        <div className="app-panel app-empty">
                            <NavigationIcon name="status" />
                            <h2>Service overview coming soon</h2>
                            <p>
                                Service alerts have not been connected to this
                                page yet.
                            </p>
                        </div>
                    </section>
                )}

                {activePage === "settings" && (
                    <section className="app-page" aria-labelledby="settings-title">
                        <header className="app-page__header">
                            <p className="app-eyebrow">PREFERENCES</p>
                            <h1 id="settings-title">Settings</h1>
                            <p>Manage your account and app preferences.</p>
                        </header>

                        <section className="app-panel">
                            <h2>Account</h2>
                            <Account />
                        </section>

                        <section className="app-panel">
                            <h2>About Greybox</h2>
                            <p>
                                Subway information for your everyday NYC commute.
                                Arrival times are estimates and may change.
                            </p>
                        </section>
                    </section>
                )}
            </main>
        </div>
    );
}

createRoot(document.getElementById("root")).render(<AccountProvider><App /></AccountProvider>);
