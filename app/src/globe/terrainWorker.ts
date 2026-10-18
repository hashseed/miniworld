// A terrain worker (spec milestone 1, section 11.5): runs each job it is sent
// and posts the result back with the job's id, transferring its buffers.

import { runJob, type Job } from './terrainJobs.ts';

self.onmessage = (e: MessageEvent<{ id: number; job: Job }>) => {
  const { result, transfer } = runJob(e.data.job);
  (self as unknown as Worker).postMessage({ id: e.data.id, result }, transfer);
};
