import { lstat, realpath, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [name, relative] of Object.entries({
  Frontend: 'src/main/webapp',
  Backend: 'src/main/java',
  Tests: 'src/test',
})) {
  const target = path.resolve(root, relative);
  const destination = path.join(root, name);
  if (!target.startsWith(root + path.sep)) throw Error('Invalid editor source path.');
  try {
    await lstat(destination);
    if ((await realpath(destination)).toLowerCase() !== (await realpath(target)).toLowerCase()) {
      throw Error(
        `${name} already exists and does not point to the project source. No files were replaced.`
      );
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await symlink(target, destination, process.platform === 'win32' ? 'junction' : 'dir');
  }
}
console.log('Editor folders ready: Frontend, Backend, Tests.');
