import React from "react";
import { createRoot } from "react-dom/client";
import TransitMap from "./TransitMap.jsx";

function App() {
  return (
    <main>
        <h1>Greybox | NYC Transit Hub</h1>
        <TransitMap />
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);