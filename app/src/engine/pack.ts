// What the engine asks of a content pack (engine.md, section 2). The build
// picks one pack and the entry (main.ts) imports it as '@pack'.

export interface Pack {
  /** Folder name under app/src/packs/ and key prefix of the pack's saved settings. */
  id: string;
  /** Builds the world and the interface in the page and starts the frame loop. */
  start(): void | Promise<void>;
}
