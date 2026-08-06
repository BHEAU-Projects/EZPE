// Future Fastify server entrypoint.
//
// This file should eventually create the HTTP server, register shared plugins,
// attach the analyze route, and expose a simple health route for smoke checks.
//
// Planned routes:
// - GET /health: returns service status and version metadata.
// - POST /analyze: accepts a structured Pokemon Champions battle state and
//   returns ranked move advice.
//
// Keep this file thin. Request parsing, validation, move ranking, and simulator
// behavior should live in focused modules so the server remains easy to replace
// or test.
