export type { LocalDatabase, RemoteGateway, RemoteCommitInput, RemoteCommitResult } from "./ports";

export { coalesce, describeChanges, changeId, type CoalesceInput } from "./queue";
export { SyncEngine, type SyncEngineOptions } from "./sync-engine";
export { MemoryDatabase } from "./memory-db";
export {
  IndexedDbDatabase,
  createLocalDatabase,
  openLocalDatabase,
  indexedDbAvailable,
  type LocalDatabaseStatus,
  type OpenedLocalDatabase,
} from "./idb-db";
export { NoteRepository, type NoteRepositoryOptions } from "./note-repository";
