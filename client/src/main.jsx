import React from "react";
import { createRoot } from "react-dom/client";
import Account from "./account.jsx";
import TransitMap from "./transitMap.jsx";

function App() {
  return (
    <main>
        <header className="app-header">
            <h1>Greybox | NYC Transit Hub</h1>
            <Account />
        </header>
        <TransitMap />
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
