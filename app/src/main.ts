// Entry point of the browser app (spec milestone 1). The pack is chosen when
// the app is built (engine.md, section 3): '@pack' is its index.

import '@fontsource-variable/fredoka';
import { pack } from '@pack';

void pack.start();
