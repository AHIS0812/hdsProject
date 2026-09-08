// 메타 API — 개발지시서 §6.5, §8 A-1b
//   GET /api/systems
//   GET /api/screens?system=&q=
//   GET /api/screens/:id
// 스캐폴딩 단계에서는 fixtures/ 를 반환한다. TODO(담당 1): 실제 데이터 소스 연동(OI-11, OI-12).

import { Router } from 'express';
import { fixture, allScreens } from '../mock.js';

const router = Router();

router.get('/systems', (req, res) => {
  res.json(fixture('systems.json', { systems: [] }));
});

router.get('/screens', (req, res) => {
  const { system, q } = req.query;
  let screens = allScreens();
  if (system) screens = screens.filter((s) => s.systemId === system);
  if (q) screens = screens.filter((s) => s.name.includes(q));
  // 목록에는 메타만 (shapes 제외)
  res.json({ screens: screens.map(({ shapes, ...meta }) => meta) });
});

router.get('/screens/:id', (req, res) => {
  const scr = allScreens().find((s) => s.id === req.params.id);
  if (!scr) return res.status(404).json({ error: `화면 없음: ${req.params.id}` });
  res.json({
    id: scr.id,
    name: scr.name,
    systemId: scr.systemId,
    template: scr.template,
    canvas: scr.canvas || { w: 960, h: 600 },
    shapes: scr.shapes || [],
  });
});

export default router;
