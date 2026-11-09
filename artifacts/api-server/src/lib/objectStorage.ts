import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from "./objectAcl";
import { createS3Storage, selectStorageBackend } from "./s3-storage";
import {
  entityIdFromObjectPath,
  MediaObject,
  MediaStorage,
  ObjectNotFoundError,
  parseObjectPath,
  type ObjectHead,
} from "./storage-types";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export { ObjectNotFoundError, parseObjectPath };

type GcsFile = {
  name: string;
  bucket: { file(name: string, options?: { generation?: string }): GcsFile };
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[{
    size?: string | number;
    contentType?: string;
    generation?: string | number;
    metadata?: Record<string, unknown> | null;
  }]>;
  download(options: { start: number; end: number }): Promise<[Buffer]>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
  copy(destination: GcsFile): Promise<unknown>;
  createReadStream(options?: { start?: number; end?: number }): Readable;
  setMetadata(metadata: { metadata: Record<string, string> }): Promise<unknown>;
};

type GcsStorage = {
  bucket(name: string): { file(name: string): GcsFile };
};

let objectStorageClient: GcsStorage | undefined;

async function gcsClient(): Promise<GcsStorage> {
  if (!objectStorageClient) {
    const { Storage } = await import("@google-cloud/storage");
    objectStorageClient = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
          format: {
            type: "json",
            subject_token_field_name: "access_token",
          },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    }) as unknown as GcsStorage;
  }
  return objectStorageClient;
}

class GcsMediaObject implements MediaObject {
  constructor(private readonly file: GcsFile) {}

  get name() {
    return this.file.name;
  }

  bucket = {
    file: (name: string, options?: { generation?: string | number }) =>
      new GcsMediaObject(this.file.bucket.file(name, options?.generation == null ? undefined : { generation: String(options.generation) })),
  };

  async exists() {
    return this.file.exists();
  }

  async getMetadata(): Promise<[ObjectHead]> {
    const [metadata] = await this.file.getMetadata();
    const custom: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata.metadata ?? {})) {
      if (value != null) custom[key] = String(value);
    }
    return [{
      size: metadata.size,
      contentType: metadata.contentType,
      generation: metadata.generation,
      metadata: custom,
    }];
  }

  async download(options: { start: number; end: number }) {
    return this.file.download(options);
  }

  async delete(options?: { ignoreNotFound?: boolean }) {
    await this.file.delete(options);
  }

  async copy(destination: MediaObject) {
    if (!(destination instanceof GcsMediaObject)) {
      throw new Error("Cannot copy across storage backends");
    }
    await this.file.copy(destination.file);
  }

  createReadStream(options?: { start?: number; end?: number }) {
    return this.file.createReadStream(options);
  }

  async setMetadata(metadata: { metadata: Record<string, string> }) {
    await this.file.setMetadata(metadata);
  }
}

export class ObjectStorageService implements MediaStorage {
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths).",
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var.",
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<GcsMediaObject | null> {
    const client = await gcsClient();
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const file = client.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (exists) return new GcsMediaObject(file);
    }
    return null;
  }

  async downloadObject(file: MediaObject, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";
    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) headers["Content-Length"] = String(metadata.size);
    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
  }

  async reserveUpload(_input: { contentType: string }) {
    const uploadUrl = await this.getObjectEntityUploadURL();
    return { uploadUrl, objectPath: this.normalizeObjectEntityPath(uploadUrl) };
  }

  async getObjectEntityFile(objectPath: string): Promise<MediaObject> {
    const entityId = entityIdFromObjectPath(objectPath);
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
    const { bucketName, objectName } = parseObjectPath(`${entityDir}${entityId}`);
    const client = await gcsClient();
    const objectFile = client.bucket(bucketName).file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) throw new ObjectNotFoundError();
    return new GcsMediaObject(objectFile);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) return rawPath;
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) objectEntityDir = `${objectEntityDir}/`;
    if (!rawObjectPath.startsWith(objectEntityDir)) return rawObjectPath;
    return `/objects/${rawObjectPath.slice(objectEntityDir.length)}`;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: ObjectAclPolicy): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) return normalizedPath;
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: MediaObject;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, make sure you're running on Replit`,
    );
  }
  const { signed_url: signedURL } = await response.json() as { signed_url: string };
  return signedURL;
}

export function createStorage(): MediaStorage {
  return selectStorageBackend() === "s3" ? createS3Storage() : new ObjectStorageService();
}
