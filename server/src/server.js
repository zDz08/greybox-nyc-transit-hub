import app from "./app.js"
import { closeDatabase } from "./database.js";

const port = Number(process.env.PORT || 3000);

if(!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be an integer between 1 and 65535");
}

const server = app.listen(port, () => {
    console.log(`Greybox API: http://localhost:${port}`);
});

server.on("error", (error) => {
    console.error(`Server failed to start ${error.message}`);
    process.exit(1);
});

function shutdown() {
    server.close(() => {
        closeDatabase().catch((error) => {
            console.error("Could not close the database connection:", error.name);
            process.exitCode = 1;
        });
    });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
