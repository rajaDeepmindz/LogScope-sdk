import { rmSync } from 'node:fs';
import { join } from 'node:path';
for (const pkg of ['core', 'react', 'adapter-rest', 'adapter-sse', 'adapter-websocket']) {
  rmSync(join('packages', pkg, 'dist'), {recursive: true, force: true});
}
rmSync(join('apps', 'playground', 'dist'), {recursive: true, force: true});
console.log('Removed generated dist folders.');
