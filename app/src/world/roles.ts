// The vocabulary of the Neolithic roles (docs/spec/neolithic/people-profiles.md section 4): what each
// role is called in English and German, feminine and masculine, and which outing it favours.

import { hash01 } from '../core/hash.ts';
import {
  NEOLITHIC_PROFILES,
  type NeolithicProfileId,
  type NeolithicRole,
} from './neolithicProfiles.ts';

export interface RoleNoun {
  en: string;
  de: { f: string; m: string };
}

export const ROLE_NOUNS: Record<NeolithicRole, RoleNoun> = {
  farmer: { en: 'farmer', de: { f: 'Bäuerin', m: 'Bauer' } },
  reaper: { en: 'reaper', de: { f: 'Schnitterin', m: 'Schnitter' } },
  herder: { en: 'herder', de: { f: 'Hirtin', m: 'Hirte' } },
  potter: { en: 'potter', de: { f: 'Töpferin', m: 'Töpfer' } },
  weaver: { en: 'weaver', de: { f: 'Weberin', m: 'Weber' } },
  builder: { en: 'builder', de: { f: 'Baumeisterin', m: 'Baumeister' } },
  grinder: { en: 'grinder', de: { f: 'Müllerin', m: 'Müller' } },
  hunter: { en: 'hunter', de: { f: 'Jägerin', m: 'Jäger' } },
  gatherer: { en: 'gatherer', de: { f: 'Sammlerin', m: 'Sammler' } },
  fisher: { en: 'fisher', de: { f: 'Fischerin', m: 'Fischer' } },
  toolmaker: { en: 'toolmaker', de: { f: 'Werkzeugmacherin', m: 'Werkzeugmacher' } },
};

/** The role of a grown-up of a profile, drawn by hash from the profile's mix (shares sum to 100). */
export function roleOf(profile: NeolithicProfileId, id: number): NeolithicRole {
  const mix = NEOLITHIC_PROFILES[profile].mix;
  let roll = hash01(id, 97) * 100;
  for (const [role, share] of Object.entries(mix) as [NeolithicRole, number][]) {
    if (roll < share) return role;
    roll -= share;
  }
  return 'farmer';
}
