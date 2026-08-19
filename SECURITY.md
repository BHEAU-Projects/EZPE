# Security Policy

## Supported Version

Security fixes are applied to the latest code on `main`.

## Reporting A Vulnerability

Please use GitHub's private vulnerability reporting form in the repository's
Security tab. Do not open a public issue for a report containing exploit details,
private data, or credentials.

Include the affected version or commit, reproduction steps, impact, and any
suggested mitigation. This is a learning project maintained on a best-effort
basis, so no fixed response-time guarantee is offered.

## Deployment Boundary

EZPE is a local, single-user development application. The server intentionally
binds to `127.0.0.1` and does not implement authentication, authorization, TLS,
rate limiting, or multi-user isolation. Do not expose it directly to a public
network or deploy it as an internet-facing service without adding those controls
and performing a separate security review.
