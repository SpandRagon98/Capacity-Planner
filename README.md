# Capexity

A shared task and capacity planning workspace built with React, Vinext, D1, and shadcn/ui. Spandan and Mandhya can create named workspaces, work on the same saved plans and tasks, and receive updates made by the other member. The interface uses Montserrat throughout and includes subtasks, multiple owners, scheduling, Gantt charts, Excel export, and light and dark themes.

## Run locally

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Validate and build

```bash
npx tsc --noEmit
npm run build
```

The server-backed app is written to `dist/server` with browser assets in `dist/client`.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`; the GitHub Pages address forwards visitors to the shared server-backed deployment.

> The login is a client-side prototype gate, not production authentication. Do not store sensitive data in the hosted demo.
