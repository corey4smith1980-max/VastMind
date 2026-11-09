import type { Readable } from "node:stream";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface ObjectHead {
  size?: string | number;
  contentType?: string;
  generation?: string | number;
  metadata?: Record<string, string> | null;
}

/** Structural file handle shared by the Replit and S3 backends. */
export interface MediaObject {
  name: string;
  bucket: {
    file(name: string, options?: { generation?: string | number }): MediaObject;
  };
  getMetadata(): Promise<[ObjectHead]>;
  download(options: { start: number; end: number }): Promise<[Buffer]>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<void>;
  copy(destination: MediaObject): Promise<void>;
  createReadStream(options?: { start?: number; end?: number }): Readable;
  exists(): Promise<[boolean]>;
  setMetadata(metadata: { metadata: Record<string, string> }): Promise<void>;
}

export interface UploadReservation {
  uploadUrl: string;
  objectPath: string;
}

export interface MediaStorage {
  reserveUpload(input: { contentType: string }): Promise<UploadReservation>;
  getObjectEntityFile(objectPath: string): Promise<MediaObject>;
  normalizeObjectEntityPath(rawPath: string): string;
  trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: { owner: string; visibility: "public" | "private" },
  ): Promise<string>;
  getPrivateObjectDir(): string;
}

export function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  return {
    bucketName: pathParts[1] ?? "",
    objectName: pathParts.slice(2).join("/"),
  };
}

/** Reject path traversal before a key is sent to object storage. */
export function entityIdFromObjectPath(objectPath: string): string {
  if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
  const entityId = objectPath.slice("/objects/".length);
  if (!entityId || entityId.startsWith("/") || entityId.includes("..") || entityId.includes("\\") || entityId.includes("\0")) {
    throw new ObjectNotFoundError();
  }
  return entityId;
}
