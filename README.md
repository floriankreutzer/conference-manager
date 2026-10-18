# Conference Manager

Browser application for planning conference requests, coordinating rooms and services, and administering customer settings.

## Features

- Create and review requests for rooms, equipment, catering and cost allocation.
- Manage booking decisions, change requests and cancellations.
- Administer customer organization, users and integration settings through role-specific views.
- Use German or English interfaces with responsive layouts.

This repository contains the browser application. Authentication, authorization and persistent business data are handled by the [Conference Manager API](https://github.com/floriankreutzer/conference-manager-api). A separately served operator interface is also maintained here.

## Demo status

- Employee UX: **ready** for the accepted Demo scope.
- Conference Manager UX: **ready** for the accepted Demo scope.

The #182 parity gate and #170 release gate control this promotion. Demo acceptance does not certify Production. Browser navigation reflects the validated server session but never establishes authorization. The [release evidence](docs/SAAS-3.6-RELEASE-EVIDENCE.md) defines the acceptance scope and remaining limits. Its successor deployment still requires refreshed frontend/hosted acceptance; the historical UX readiness markers do not establish acceptance of the currently deployed frontend/API pair. Version-specific CI, Hosted Acceptance, ZAP, dependency/secret checks and review remain separate release gates.

## Requirements

- Node.js 22 or later and npm for development checks.
- A current browser supporting native JavaScript modules.
- Python 3 for the optional static inspection server below.

## Getting started

```bash
git clone https://github.com/floriankreutzer/conference-manager.git
cd conference-manager
npm ci --ignore-scripts
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080`. This serves the frontend for static inspection. Authenticated workflows require the matching API runtime under the same origin; a static server alone does not provide working sessions or booking persistence.

## Project layout

| Directory | Responsibility |
| --- | --- |
| `src/` | Application modules and role-specific interfaces |
| `assets/` | Styles, design tokens and static assets |
| `tests/` | Unit and browser tests |
| `scripts/` | Development and validation tools |
| `docs/` | Technical reference and contributor guidance |

## Validation

```bash
npm run check
npm run audit
```

For browser changes, install the pinned browsers and run the browser suite:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

Backend integration and shared-environment acceptance require their own configured test environments. Passing local checks does not establish production readiness.

## Contributing

Read [AGENTS.md](AGENTS.md) and the [coding standards](docs/CODING-STANDARDS.md) before making changes. Follow the existing native-module architecture, localization and design-system conventions. Submit changes through the repository review process.

## Security

Do not commit credentials, personal customer data or environment-specific secrets. Report suspected vulnerabilities privately using the route in [SECURITY.md](SECURITY.md).

## License

No project-level license file is currently included. Refer to the corresponding notices for third-party assets and dependencies.
