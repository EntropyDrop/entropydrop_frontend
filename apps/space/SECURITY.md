# Security policy

## Supported version

Security fixes are applied to the current `main` branch. This repository is a
browser prototype; the files under `backend/` describe the Multiplayer V2 target
and are not a deployed server implementation.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
[private vulnerability reporting](https://github.com/EntropyDrop/Space/security/advisories/new)
and include the affected version, reproduction steps, impact, and any proposed
mitigation. Do not include live API keys, access tokens, or personal data.

Dependency reports can be reproduced with `npm run audit:deps`. Runtime reports
should state the browser, operating system, and whether a remote Agent endpoint
or imported entity/STL file was involved.
