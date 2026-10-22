/* global process, Buffer, document, Path2D */
// Draws the cave paintings of the scenes at anchors (humankind.md section 8.2) as comic
// pictures after the real ones, as they looked fresh: Leang Karampuang's red ochre warty pig
// with the hunters round it (Oktaviana et al. 2024), and Chauvet's charcoal panel of horses,
// aurochs, rhinos, lions and a mammoth (Clottes 2003). Each part is drawn in the session
// (stage) it is painted in. Output: a PNG whose alpha is the pigment and red channel the
// stage times 40, for the painting texture of app/public/textures. Runs in the system's
// Chromium (no image library is installed).
// Usage: node tools/cave-art.mjs <out dir>
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'app/public/textures';
const browser = await chromium.launch({
  executablePath: process.env.MINIWORLD_CHROMIUM || '/usr/bin/chromium',
});
const page = await browser.newPage();

for (const kind of ['leang-karampuang', 'chauvet', 'lascaux']) {
  const png = await page.evaluate((kind) => {
    const [W, H] =
      kind === 'chauvet' ? [1024, 820] : kind === 'lascaux' ? [1024, 560] : [1024, 420];
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const stageOf = new Uint8Array(W * H).fill(255);
    const alpha = new Float32Array(W * H);
    /** Draws one stage on a clear canvas and keeps what it paints, for the stage. */
    const stage = (k, draw) => {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      draw(ctx);
      ctx.restore();
      const d = ctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < W * H; i++) {
        const a = d[i * 4 + 3] / 255;
        if (a > alpha[i]) {
          alpha[i] = a;
          if (stageOf[i] === 255 || a > 0.5) stageOf[i] = Math.min(stageOf[i], k);
        }
      }
    };
    const path = (c, d) => c.beginPath() || new Path2D(d);
    const circle = (c, x, y, r) => {
      c.beginPath();
      c.arc(x, y, r, 0, 2 * Math.PI);
      c.fill();
    };
    /** Cuts a hole (an eye) in what is drawn so far in this stage. */
    const cut = (c, x, y, r) => {
      c.save();
      c.globalCompositeOperation = 'destination-out';
      circle(c, x, y, r);
      c.restore();
    };

    if (kind === 'leang-karampuang') {
      // The warty pig, facing left: a chunky body, a long tapering snout, warts and a crest.
      stage(0, (c) => {
        c.fill(
          new Path2D(
            'M 360 190 C 380 120, 520 92, 650 100 C 770 108, 850 150, 860 215 C 868 268, 830 300, 760 306 L 470 308 C 410 304, 370 280, 352 240 Z',
          ),
        );
        // Head and snout.
        c.fill(
          new Path2D(
            'M 380 150 C 330 140, 280 158, 228 188 C 205 200, 190 214, 192 228 C 194 242, 212 248, 240 248 C 290 250, 340 252, 390 262 Z',
          ),
        );
        // The snout's end, a round disc, and the warts on the face.
        circle(c, 196, 222, 22);
        for (const [x, y, r] of [
          [262, 172, 14],
          [298, 158, 12],
          [330, 150, 10],
          [244, 186, 9],
        ])
          circle(c, x, y, r);
        // Ears.
        c.fill(new Path2D('M 360 152 L 372 104 L 402 150 Z'));
        c.fill(new Path2D('M 392 148 L 412 112 L 428 152 Z'));
        cut(c, 312, 196, 11);
        cut(c, 186, 220, 5);
        cut(c, 202, 214, 5);
      });
      // Legs, hooves and the curly tail; a bristly crest along the back.
      stage(1, (c) => {
        for (const x of [430, 492, 720, 780]) {
          c.fill(new Path2D(`M ${x} 290 L ${x + 34} 290 L ${x + 30} 360 L ${x + 2} 360 Z`));
          c.fillRect(x - 4, 352, 40, 14);
        }
        c.lineWidth = 12;
        c.beginPath();
        c.moveTo(856, 200);
        c.bezierCurveTo(900, 170, 930, 210, 905, 228);
        c.bezierCurveTo(885, 242, 878, 214, 896, 210);
        c.stroke();
        // Bristles: a fine spiky line along the ridge of the back.
        let d = 'M 440 112';
        for (let k = 1; k <= 16; k++)
          d += ` L ${440 + k * 18} ${k % 2 ? 76 : 100 - 2 * Math.abs(k - 8)}`;
        c.lineWidth = 6;
        c.stroke(new Path2D(d));
      });
      /** A little hunter: a round head, a body and legs mid-stride, both hands on a stick. */
      const hunter = (c, x, y, s, stick, lean = 0) => {
        c.save();
        c.translate(x, y);
        c.rotate(lean);
        c.scale(s, s);
        c.lineWidth = 13;
        circle(c, 0, -92, 19);
        c.beginPath();
        c.moveTo(0, -70);
        c.lineTo(0, -15);
        c.moveTo(0, -15);
        c.lineTo(-18, 30);
        c.moveTo(0, -15);
        c.lineTo(20, 28);
        c.moveTo(0, -60);
        c.lineTo(stick[0] * 0.5, stick[1] * 0.5 - 30);
        c.moveTo(0, -55);
        c.lineTo(stick[0] * 0.45, stick[1] * 0.45 - 24);
        c.stroke();
        c.lineWidth = 7;
        c.beginPath();
        c.moveTo(-stick[0] * 0.3, -stick[1] * 0.3 - 40);
        c.lineTo(stick[0], stick[1] - 40);
        c.stroke();
        c.restore();
      };
      // Three hunters round the pig, sticks to it, as in the painted story.
      stage(2, (c) => hunter(c, 95, 260, 1.15, [95, -10], 0.05));
      stage(3, (c) => hunter(c, 965, 330, 0.8, [-80, -10], -0.05));
      stage(4, (c) => hunter(c, 150, 400, 0.85, [55, -60], -0.1));
      // Two hand stencils above, as round them in the Maros caves.
      stage(5, (c) => {
        for (const [x, y, r] of [
          [180, 60, 0.3],
          [250, 42, -0.2],
        ]) {
          c.save();
          c.translate(x, y);
          c.rotate(r);
          c.scale(0.75, 0.75);
          c.globalAlpha = 0.85;
          circle(c, 0, 0, 46);
          c.globalCompositeOperation = 'destination-out';
          c.globalAlpha = 1;
          c.fill(
            new Path2D(
              'M -18 30 L -20 -4 L -22 -30 L -14 -30 L -10 -6 L -6 -38 L 2 -38 L 4 -8 L 8 -36 L 16 -34 L 14 -6 L 20 -26 L 27 -22 L 20 6 L 30 -4 L 34 2 L 18 30 Z',
            ),
          );
          c.restore();
        }
      });
    } else if (kind === 'chauvet') {
      // Charcoal, in comic outlines with a little smudged shading, as on the Panel of the Horses.
      const line = (c, w = 9) => {
        c.lineWidth = w;
      };
      /** A horse's head facing left, with a spiky upright mane, a dark muzzle and an eye. */
      const horse = (c, x, y, s) => {
        c.save();
        c.translate(x, y);
        c.scale(s, s);
        line(c, 9);
        c.stroke(
          new Path2D(
            'M 60 -60 C 20 -72, -20 -58, -46 -26 C -62 -6, -76 20, -80 40 C -82 56, -66 66, -50 63 C -30 61, -14 50, -4 34 C 10 18, 30 10, 46 26 L 64 64',
          ),
        );
        c.fill(new Path2D('M 40 -64 L 50 -96 L 62 -62 Z'));
        let d = 'M 58 -60';
        for (let k = 0; k < 7; k++) d += ` L ${66 + k * 9} ${k % 2 ? -58 + k * 7 : -78 + k * 8}`;
        c.lineWidth = 7;
        c.stroke(new Path2D(d));
        c.globalAlpha = 0.55;
        circle(c, -62, 44, 20);
        c.globalAlpha = 1;
        circle(c, -30, -16, 7);
        circle(c, -70, 46, 4);
        c.restore();
      };
      stage(0, (c) => horse(c, 470, 140, 1.25));
      stage(1, (c) => {
        horse(c, 560, 240, 1.2);
        horse(c, 650, 340, 1.15);
        horse(c, 740, 440, 1.1);
      });
      // An aurochs on the left: a big body outline and lyre-shaped horns.
      stage(2, (c) => {
        line(c, 10);
        c.stroke(
          new Path2D(
            'M 330 250 C 300 190, 210 170, 140 200 C 90 220, 70 260, 80 300 C 90 340, 130 360, 180 360 L 300 360 C 330 350, 350 320, 340 290 M 120 360 L 112 430 M 170 362 L 168 432 M 280 360 L 286 430',
          ),
        );
        c.stroke(
          new Path2D('M 300 250 C 300 210, 330 190, 350 210 M 320 248 C 340 230, 370 230, 380 250'),
        );
        c.stroke(new Path2D('M 330 255 C 360 260, 385 290, 372 320 C 360 335, 340 330, 335 315'));
        circle(c, 352, 278, 6);
        c.globalAlpha = 0.4;
        c.fill(new Path2D('M 140 205 C 200 180, 290 200, 320 245 C 260 230, 180 225, 140 260 Z'));
      });
      /** A woolly rhino facing left or right, with its long horn. */
      const rhino = (c, x, y, s, flip) => {
        c.save();
        c.translate(x, y);
        c.scale(flip ? -s : s, s);
        line(c, 9);
        // Body, legs and a lowered head with the long horn on its nose and a small one behind.
        c.stroke(
          new Path2D(
            'M 120 0 C 120 -50, 60 -70, 0 -62 C -40 -58, -70 -40, -78 -20 M -78 -20 C -100 -14, -130 4, -150 22 C -160 32, -150 44, -134 42 C -110 40, -90 42, -70 42 L 90 42 C 112 38, 122 22, 120 0 M -60 42 L -62 82 M -20 42 L -18 84 M 50 42 L 52 84 M 92 40 L 96 82',
          ),
        );
        c.fill(
          new Path2D('M -148 18 C -168 -10, -176 -50, -160 -92 C -154 -56, -138 -22, -124 6 Z'),
        );
        c.fill(new Path2D('M -112 0 C -118 -16, -118 -30, -108 -42 C -104 -26, -98 -14, -92 -6 Z'));
        circle(c, -96, 6, 6);
        c.restore();
      };
      stage(3, (c) => {
        rhino(c, 560, 690, 0.9, false);
        rhino(c, 840, 700, 0.85, true);
      });
      /** A lion's head in profile facing left: round cheek, ear, eye and whisker dots. */
      const lion = (c, x, y, s) => {
        c.save();
        c.translate(x, y);
        c.scale(s, s);
        line(c, 9);
        c.stroke(
          new Path2D(
            'M 70 -30 C 40 -60, -20 -60, -50 -30 C -70 -12, -80 10, -70 28 C -60 44, -30 48, 0 42 C 30 36, 60 30, 90 40 M 90 -26 C 120 -20, 150 -10, 170 10',
          ),
        );
        c.stroke(new Path2D('M 20 -52 C 24 -70, 40 -72, 46 -54'));
        circle(c, -30, -16, 6);
        for (const [dx, dy] of [
          [-56, 10],
          [-48, 18],
          [-58, 22],
        ])
          circle(c, dx, dy, 3);
        c.restore();
      };
      stage(4, (c) => {
        lion(c, 860, 200, 1.0);
        lion(c, 880, 330, 0.9);
      });
      // A mammoth below the aurochs: a domed head, trunk, tusk and hairy belly.
      stage(5, (c) => {
        c.translate(-40, 60);
        line(c, 10);
        c.stroke(
          new Path2D(
            'M 260 470 C 250 420, 180 400, 130 430 C 100 450, 92 480, 100 520 C 104 560, 96 600, 110 630 M 260 470 C 300 470, 340 500, 340 560 L 336 640 M 150 620 L 152 690 M 200 640 L 204 700 M 300 640 L 304 700',
          ),
        );
        c.stroke(new Path2D('M 112 520 C 140 540, 156 560, 150 600'));
        for (let k = 0; k < 8; k++) {
          c.beginPath();
          c.moveTo(150 + k * 22, 640);
          c.lineTo(146 + k * 22, 664);
          c.stroke();
        }
        circle(c, 140, 470, 6);
      });
    } else {
      // Lascaux's Hall of the Bulls in black and a little red-brown (shown dark): great aurochs
      // bulls with lyre horns, a cow, small horses, a stag and rows of dots (Aujoulat 2004).
      /** A bull facing left: a huge hump-backed body, a small head with forward-curving horns. */
      const bull = (c, x, y, s) => {
        c.save();
        c.translate(x, y);
        c.scale(s, s);
        c.fill(
          new Path2D(
            'M -150 -20 C -140 -80, -70 -110, 20 -96 C 110 -84, 190 -60, 250 -40 C 290 -28, 300 0, 270 8 C 250 14, 240 6, 230 14 C 200 30, 150 28, 110 34 C 70 40, 20 36, -30 34 C -60 32, -100 32, -130 20 C -146 12, -152 -4, -150 -20 Z',
          ),
        );
        c.fill(
          new Path2D(
            'M -140 -30 C -176 -34, -214 -16, -236 6 C -244 20, -230 28, -214 24 C -190 20, -160 14, -134 6 Z',
          ),
        );
        c.lineWidth = 8;
        c.stroke(
          new Path2D(
            'M -196 -26 C -204 -62, -176 -98, -140 -92 M -184 -28 C -164 -76, -132 -90, -112 -70',
          ),
        );
        for (const lx of [-110, -70, 150, 200]) {
          c.lineWidth = 16;
          c.beginPath();
          c.moveTo(lx, 24);
          c.lineTo(lx + (lx < 0 ? -6 : 8), 100);
          c.stroke();
        }
        c.lineWidth = 8;
        c.beginPath();
        c.moveTo(262, 4);
        c.lineTo(274, 78);
        c.stroke();
        cut(c, -196, -4, 5);
        c.restore();
      };
      stage(0, (c) => bull(c, 360, 190, 1.2));
      stage(1, (c) => bull(c, 760, 320, 0.75));
      // A cow, lighter, under the first bull.
      stage(2, (c) => {
        c.globalAlpha = 0.8;
        c.save();
        c.translate(200, 420);
        c.scale(0.55, 0.55);
        c.fill(
          new Path2D(
            'M -150 -20 C -140 -70, -60 -90, 30 -78 C 110 -68, 190 -48, 238 -30 C 270 -20, 276 4, 250 10 C 220 20, 150 24, 100 30 C 40 36, -30 34, -80 30 C -130 28, -156 10, -150 -20 Z',
          ),
        );
        c.fill(
          new Path2D(
            'M -140 -26 C -176 -26, -208 -8, -226 10 C -228 24, -212 26, -196 22 C -176 18, -154 12, -134 4 Z',
          ),
        );
        c.lineWidth = 8;
        c.stroke(new Path2D('M -190 -22 C -196 -52, -176 -80, -146 -72'));
        c.lineWidth = 14;
        for (const lx of [-100, -60, 140, 190]) {
          c.beginPath();
          c.moveTo(lx, 24);
          c.lineTo(lx, 92);
          c.stroke();
        }
        c.restore();
      });
      // Little horses with fat bellies and bristly manes, trotting under the bulls.
      stage(3, (c) => {
        for (const [x, y, s] of [
          [470, 480, 0.6],
          [690, 500, 0.55],
        ]) {
          c.save();
          c.translate(x, y);
          c.scale(s, s);
          c.fill(
            new Path2D(
              'M -110 -20 C -90 -52, -20 -56, 40 -48 C 90 -42, 120 -30, 150 -34 C 162 -26, 156 -10, 140 -4 C 110 4, 80 20, 30 22 C -20 26, -70 24, -100 10 C -112 2, -116 -10, -110 -20 Z',
            ),
          );
          c.fill(
            new Path2D(
              'M -104 -24 C -130 -52, -170 -62, -196 -44 C -208 -34, -200 -22, -184 -20 C -160 -16, -136 -6, -112 4 Z',
            ),
          );
          c.lineWidth = 10;
          c.stroke(
            new Path2D(
              'M -110 -40 L -122 -70 M -90 -50 L -96 -80 M -66 -52 L -68 -82 M -42 -52 L -40 -80',
            ),
          );
          for (const lx of [-70, -30, 80, 120]) {
            c.beginPath();
            c.moveTo(lx, 14);
            c.lineTo(lx + 4, 80);
            c.stroke();
          }
          c.restore();
        }
      });
      // A stag with a big branching antler, head back, and a red bull's horns behind it.
      stage(4, (c) => {
        c.save();
        c.translate(900, 160);
        c.fill(
          new Path2D(
            'M -90 30 C -70 -2, -10 -8, 40 6 C 70 14, 90 8, 104 -4 C 112 8, 104 26, 86 34 C 50 50, -10 54, -60 56 C -86 56, -98 44, -90 30 Z',
          ),
        );
        c.lineWidth = 9;
        c.stroke(
          new Path2D(
            'M 92 2 C 100 -40, 96 -80, 80 -110 M 96 -34 C 120 -50, 140 -60, 150 -90 M 88 -64 C 66 -80, 50 -84, 32 -100 M 98 -70 C 120 -90, 120 -110, 106 -130',
          ),
        );
        c.lineWidth = 12;
        for (const lx of [-70, -40, 40, 66]) {
          c.beginPath();
          c.moveTo(lx, 44);
          c.lineTo(lx, 108);
          c.stroke();
        }
        c.restore();
      });
      // Rows of dots and a rectangle sign, as on the walls of the Hall.
      stage(5, (c) => {
        for (let k = 0; k < 9; k++) circle(c, 60 + k * 26, 520 - (k % 2) * 8, 6);
        for (let k = 0; k < 6; k++) circle(c, 760 + k * 26, 90, 6);
        c.lineWidth = 7;
        c.strokeRect(880, 440, 60, 36);
        c.strokeRect(886, 446, 48, 24);
      });
    }
    const o = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++)
      o.data.set(
        [stageOf[i] === 255 ? 0 : stageOf[i] * 40, 0, 0, Math.round(alpha[i] * 255)],
        i * 4,
      );
    ctx.putImageData(o, 0, 0);
    void path;
    return canvas.toDataURL('image/png');
  }, kind);
  writeFileSync(`${out}/cave-${kind}.png`, Buffer.from(png.split(',')[1], 'base64'));
}
await browser.close();
