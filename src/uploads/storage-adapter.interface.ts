// Kept pluggable per implementation.md §8: local disk is fine for dev;
// a future S3/network-share adapter just implements this same interface
// — nothing else in the uploads flow needs to change.
export interface StorageAdapter {
  save(id: string, filename: string, buffer: Buffer): Promise<string>; // returns a storage-specific path/key
  read(storagePath: string): Promise<Buffer>;
}
