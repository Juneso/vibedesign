import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Use macOS sips for resizing (built-in)
for (const name of ['1_before', '2_greet', '3_cta']) {
  const src = `/tmp/ac_shots/${name}.jpg`;
  const dst = `/tmp/ac_shots/${name}_small.jpg`;
  execSync(`sips -z 540 250 -s format jpeg -s formatOptions 50 "${src}" --out "${dst}"`, { stdio: 'pipe' });
  const b64 = readFileSync(dst).toString('base64');
  writeFileSync(`/tmp/ac_shots/${name}_small.b64`, b64);
  console.log(`${name}: ${b64.length} chars`);
}
