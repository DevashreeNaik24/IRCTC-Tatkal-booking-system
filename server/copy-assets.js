// Copies non-TypeScript assets (Lua scripts + SQL migrations) into dist/
// so the compiled server can find them. Runs automatically after `npm run build`
// via the `postbuild` script.
'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;

for (const dir of ['src/scripts', 'src/migrations']) {
  const source = path.join(root, dir);
  const dest = path.join(root, 'dist', path.basename(dir));
  fs.cpSync(source, dest, { recursive: true });
  console.log(`Copied ${dir} → dist/${path.basename(dir)}`);
}