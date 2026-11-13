// 把 apk/<应用>/ 打成 apk/<应用>.dshapp（就是普通 zip，只改后缀）。
//
// 用法：
//   node dev/pack-apk.mjs note-book   只打一个
//   node dev/pack-apk.mjs             两个都打
//
// 打进包里的东西 = 文件夹里除 README.md 以外的全部文件。
// 所以改完 apk/<应用>/ 里的源码，跑一次这个就够了。
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from './make-zip.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const apkDir = path.join(repoRoot, 'apk');

/** 包里必须有这三样，少了直接报错，不生成半吊子包。 */
const REQUIRED = ['manifest.json', 'main.js', 'icon.svg'];

async function walk(dir, prefix, out) {
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    const rel = prefix === '' ? dirent.name : prefix + '/' + dirent.name;
    if (dirent.isDirectory()) {
      await walk(full, rel, out);
      continue;
    }
    // README 是给人看的，不进包。
    if (dirent.name.toLowerCase() === 'readme.md') continue;
    out.push({ name: rel, data: await readFile(full) });
  }
  return out;
}

async function pack(name) {
  const sourceDir = path.join(apkDir, name);
  const entries = await walk(sourceDir, '', []);
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const file of REQUIRED) {
    if (!entries.some((entry) => entry.name === file)) {
      throw new Error(name + ' 缺少必需文件：' + file);
    }
  }

  const buffer = makeZip(entries);
  const outFile = path.join(apkDir, name + '.dshapp');
  await writeFile(outFile, buffer);
  console.log(
    '打好了：' +
      path.relative(repoRoot, outFile) +
      '（' +
      buffer.length +
      ' 字节，' +
      entries.length +
      ' 个文件：' +
      entries.map((entry) => entry.name).join(' ') +
      '）',
  );
}

const only = process.argv[2];
const names = only
  ? [only]
  : (await readdir(apkDir, { withFileTypes: true }))
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .sort();

for (const name of names) await pack(name);
