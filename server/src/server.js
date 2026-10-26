import app from "./app.js"

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