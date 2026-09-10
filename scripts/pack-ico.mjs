// assets/icon-*.png → assets/icon.ico (PNG 방식 멀티 사이즈 ICO)
//
//   node scripts/pack-ico.mjs
//
// PNG 원본은 assets/icon-source.png (1254px 브랜드 아이콘) 를 축소한 것.
// 다시 만들려면 아무 이미지 도구(또는 System.Drawing / 브라우저 canvas)로
// 16·24·32·48·64·128·256 크기 PNG 를 assets/icon-<size>.png 로 저장한다.

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
