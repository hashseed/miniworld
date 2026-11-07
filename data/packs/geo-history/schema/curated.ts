// Schemas of the geo-history pack's curated tables (geo-history.md, sections 3, 5.3 and 6).

import { z } from 'zod';

const text = z.object({ en: z.string().min(1), de: z.string().min(1) });
const colour = z.string().regex(/^#[0-9a-f]{6}$/);
const age = z.number().min(0).max(1000);

export const sourcesTable = z.object({
  description: z.string(),
  sources: z.array(z.object({ id: z.string().min(1), citation: z.string().min(10) })).min(1),
});

export const periodsTable = z.object({
  description: z.string(),
  source: z.string(),
  periods: z
    .array(
      z
        .object({ id: z.string(), from: age, to: age, colour, name: text })
        .refine((p) => p.from > p.to),
    )
    .min(1),
});

export const supercontinentsTable = z.object({
  description: z.string(),
  supercontinents: z.array(
    z
      .object({
        id: z.string(),
        from: age,
        to: age,
        approx: z.boolean(),
        colour,
        sources: z.array(z.string()).min(1),
        name: text,
      })
      .refine((s) => s.from > s.to),
  ),
});

export const climateTable = z.object({
  description: z.string(),
  sources: z.array(z.string()).min(1),
  stops: z
    .array(z.object({ lat: z.number().min(0).max(90), colour, climate: z.string() }))
    .min(2)
    .refine((s) => s[0]!.lat === 0 && s[s.length - 1]!.lat === 90, 'stops run from 0 to 90 degrees')
    .refine((s) => s.every((x, i) => i === 0 || x.lat > s[i - 1]!.lat), 'stops rise in latitude'),
});

const look = z.union([
  z.object({ centre: z.literal(true) }),
  z.object({ follow: z.object({ plate: z.number().int(), lat: z.number(), lon: z.number() }) }),
]);

export const momentsTable = z.object({
  description: z.string(),
  moments: z
    .array(
      z
        .object({
          id: z.string(),
          from: age,
          to: age,
          age,
          approx: z.boolean(),
          look,
          sources: z.array(z.string()).min(1),
          title: text,
          text,
        })
        .refine((m) => m.from >= m.to && m.age <= m.from && m.age >= m.to, 'age lies in its range'),
    )
    .min(1),
});

export type Moment = z.infer<typeof momentsTable>['moments'][number];
export type Period = z.infer<typeof periodsTable>['periods'][number];
