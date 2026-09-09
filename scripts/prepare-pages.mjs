import { access, mkdir, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

const clientDirectory = resolve('dist/client');
const prefixedAssets = resolve(clientDirectory, 'Capacity-Planner/_next');
const publishedAssets = resolve(clientDirectory, '_next');
const prefixDirectory = resolve(clientDirectory, 'Capacity-Planner');

await access(resolve(clientDirectory, 'index.html'), constants.R_OK);
await access(prefixedAssets, constants.R_OK);
await rm(publishedAssets, { recursive: true, force: true });
await mkdir(clientDirectory, { recursive: true });
await rename(prefixedAssets, publishedAssets);
await rm(prefixDirectory, { recursive: true, force: true });

console.log('GitHub Pages artifact prepared at dist/client.');
