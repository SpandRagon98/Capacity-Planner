# Capexity

A shared task and capacity planning workspace built with React, Vinext, Google Sheets, and shadcn/ui. Spandan and Mandhya can create named workspaces, work on the same saved plans and tasks, and receive updates made by the other member. The interface uses Montserrat throughout and includes subtasks, multiple owners, scheduling, resizable Gantt charts, column filters, Excel export, PowerPoint export, and light and dark themes.

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

The static app is written to `dist/client`.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml` and publishes the static app to GitHub Pages. It has no ChatGPT or OpenAI runtime dependency.

## Google Sheets storage

Follow [google-apps-script/README.md](google-apps-script/README.md) once to deploy the small spreadsheet bridge. Paste its `/exec` URL into **Settings > Google Sheets storage**. Until that URL is connected, Capexity uses browser-local IndexedDB storage.

> The login is a client-side access gate, not production authentication. Do not store sensitive data in the hosted demo.
