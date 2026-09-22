// assets/icon-*.png → assets/icon.ico (PNG 방식 멀티 사이즈 ICO)
//
//   node scripts/pack-ico.mjs
//
// PNG 는 src/web/logo.svg 와 같은 도형을 scripts/make-icons.ps1 (System.Drawing) 로 그린 것.
// 로고를 바꾸면: make-icons.ps1 실행 → 이 스크립트 → assets/icon.ico 를 src/web/favicon.ico 로 복사.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const pngs = SIZES.map((s) => {
  const p = join(ROOT, 'assets', `icon-${s}.png`);
  if (!existsSync(p)) throw new Error(`없음: assets/icon-${s}.png`);
  return { size: s, data: readFileSync(p) };
});

// ICONDIR(6) + ICONDIRENTRY(16*N) + 이미지 데이터
const N = pngs.length;
const header = Buffer.alloc(6 + 16 * N);
header.writeUInt16LE(0, 0);       // reserved
header.writeUInt16LE(1, 2);       // type: 1 = icon
header.writeUInt16LE(N, 4);       // count

let offset = header.length;
const blobs = [];
pngs.forEach((img, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(img.size >= 256 ? 0 : img.size, e + 0);  // width (0 = 256)
  header.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);  // height
  header.writeUInt8(0, e + 2);      // color palette
  header.writeUInt8(0, e + 3);      // reserved
  header.writeUInt16LE(1, e + 4);   // color planes
  header.writeUInt16LE(32, e + 6);  // bits per pixel
  header.writeUInt32LE(img.data.length, e + 8);   // size of image data
  header.writeUInt32LE(offset, e + 12);           // offset
  offset += img.data.length;
  blobs.push(img.data);
});

const ico = Buffer.concat([header, ...blobs]);
const outPath = join(ROOT, 'assets', 'icon.ico');
writeFileSync(outPath, ico);
console.log(`assets/icon.ico  (${N}개 사이즈, ${(ico.length / 1024).toFixed(1)}KB)`);
