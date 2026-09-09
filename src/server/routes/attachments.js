// 참고 파일 업로드 API — 개발지시서 §8 U-11
//   POST   /api/attachments        multipart(files[]) → { attachments: [{ id, name, kind, url, size }] }
//   DELETE /api/attachments/:id     저장 파일 삭제
//
// 저장 위치: <repo>/uploads/ (gitignore). PoC 로컬 환경 전용.

import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ROOT } from '../../shared/paths.js';

export const UPLOAD_DIR = path.join(ROOT, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_FILES = 10;

/** 확장자 → payload attachments.kind */
const EXT_KIND = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  xlsx: 'excel', xls: 'excel', csv: 'excel',
  ppt: 'ppt', pptx: 'ppt',
  pdf: 'other',
};

const extOf = (name) => path.extname(name).slice(1).toLowerCase();
const kindOf = (name) => EXT_KIND[extOf(name)] || 'other';

// multer 는 originalname 을 latin1 로 준다 → UTF-8 로 복원
const fixName = (name) => Buffer.from(name, 'latin1').toString('utf8');

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: MAX_BYTES, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    const ext = extOf(fixName(file.originalname));
    if (EXT_KIND[ext]) cb(null, true);
    else cb(new Error(`허용되지 않는 형식입니다: .${ext} (PNG/JPG/GIF · XLSX/XLS/CSV · PPT/PPTX · PDF 만 가능)`));
  },
});

const router = Router();

router.post('/attachments', (req, res) => {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `파일이 20MB 를 초과했습니다.`
        : err.code === 'LIMIT_FILE_COUNT'
          ? `한 번에 ${MAX_FILES}개까지 업로드할 수 있습니다.`
          : err.message;
      return res.status(400).json({ error: msg });
    }
    const attachments = (req.files || []).map((f) => {
      const name = fixName(f.originalname);
      return {
        id: path.basename(f.filename, path.extname(f.filename)),
        name,
        kind: kindOf(name),
        url: `/uploads/${f.filename}`,
        size: f.size,
      };
    });
    res.json({ attachments });
  });
});

router.delete('/attachments/:id', (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: '잘못된 id' });
  let removed = false;
  for (const f of readdirSync(UPLOAD_DIR)) {
    if (f.startsWith(id)) {
      try { unlinkSync(path.join(UPLOAD_DIR, f)); removed = true; } catch { /* 이미 없음 */ }
    }
  }
  res.json({ removed });
});

export default router;
