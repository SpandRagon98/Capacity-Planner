import { mkdir, writeFile } from 'node:fs/promises';

const destination = new URL('../dist/client/', import.meta.url);
const liveUrl = 'https://capexity-workspace.kapssy.chatgpt.site/';

await mkdir(destination, { recursive: true });
await writeFile(new URL('index.html', destination), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="refresh" content="0;url=${liveUrl}">
    <title>Opening Capexity…</title>
    <link rel="canonical" href="${liveUrl}">
  </head>
  <body>
    <p>Opening <a href="${liveUrl}">Capexity</a>…</p>
    <script>window.location.replace(${JSON.stringify(liveUrl)});</script>
  </body>
</html>`);
