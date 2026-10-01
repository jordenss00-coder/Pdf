import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let count = 0;
for (const name of readdirSync('static/js').filter(n => n.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(`static/js/${name}`), encoding: 'utf8' });
  if (result.status !== 0) { console.error(name, result.stderr); process.exit(1); }
  count++;
}
console.log(`${count} JavaScript modules passed syntax checks.`);
