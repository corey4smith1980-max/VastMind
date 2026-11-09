import { randomUUID } from "node:crypto";
import { PassThrough, type Readable } from "node:stream";
import { setObjectAclPolicy, type ObjectAclPolicy } from "./objectAcl";
import { readS3Config, selectStorageBackend, type S3Config } from "./s3-config";
import {
  entityIdFromObjectPath,
  parseObjectPath,
  ObjectNotFoundError,
  type MediaObject,
  type MediaStorage,
  type ObjectHead,
} from "./storage-types";

const ACL_METADATA_KEY = "aclpolicy";

type S3ClientLike = {
  send(command: unknown): Promise<{
    ContentLength?: number;
    ContentType?: string;
    ETag?: string;
    Metadata?: Record<string, string>;
    Body?: Readable & { transformToByteArray?: () => Promise<Uint8Array> };
  }>;
};

type S3Sdk = {
  S3Client: new (config: Record<string, unknown>) => S3ClientLike;
  HeadObjectCommand: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
  CopyObjectCommand: new (input: Record<string, unknown>) => unknown;
  getSignedUrl: (
    client: S3ClientLike,
    command: unknown,
    options: { expiresIn: number; signableHeaders?: Set<string> },
  ) => Promise<string>;
};

let sdkPromise: Promise<S3Sdk> | undefined;

async function loadSdk(): Promise<S3Sdk> {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const client = await import("@aws-sdk/client-s3");
      const presigner = await import("@aws-sdk/s3-request-presigner");
      return {
        S3Client: client.S3Client as unknown as S3Sdk["S3Client"],
        HeadObjectCommand: client.HeadObjectCommand as unknown as S3Sdk["HeadObjectCommand"],
        GetObjectCommand: client.GetObjectCommand as unknown as S3Sdk["GetObjectCommand"],
        PutObjectCommand: client.PutObjectCommand as unknown as S3Sdk["PutObjectCommand"],
        DeleteObjectCommand: client.DeleteObjectCommand as unknown as S3Sdk["DeleteObjectCommand"],
        CopyObjectCommand: client.CopyObjectCommand as unknown as S3Sdk["CopyObjectCommand"],
        getSignedUrl: presigner.getSignedUrl as unknown as S3Sdk["getSignedUrl"],
      };
    })();
  }
  return sdkPromise;
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const status = "$metadata" in error && error.$metadata && typeof error.$metadata === "object"
    ? Number((error.$metadata as { httpStatusCode?: number }).httpStatusCode)
    : 0;
  return status === 404 || name === "NotFound" || name === "NoSuchKey";
}

function copySource(bucket: string, key: string): string {
  return `${bucket}/${key.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

class S3MediaObject implements MediaObject {
  constructor(
    private readonly sdk: S3Sdk,
    private readonly client: S3ClientLike,
    private readonly bucketName: string,
    readonly name: string,
    private readonly etag?: string,
  ) {}

  bucket = {
    file: (name: string, options?: { generation?: string | number }) =>
      new S3MediaObject(
        this.sdk,
        this.client,
        this.bucketName,
        name,
        options?.generation == null ? undefined : String(options.generation),
      ),
  };

  private async head() {
    try {
      return await this.client.send(new this.sdk.HeadObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
        IfMatch: this.etag,
      }));
    } catch (error) {
      if (isMissing(error)) throw new ObjectNotFoundError();
      throw error;
    }
  }

  async exists(): Promise<[boolean]> {
    try {
      await this.head();
      return [true];
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return [false];
      throw error;
    }
  }

  async getMetadata(): Promise<[ObjectHead]> {
    const head = await this.head();
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(head.Metadata ?? {})) {
      if (key === ACL_METADATA_KEY) metadata["custom:aclPolicy"] = value;
      else metadata[key] = value;
    }
    return [{
      size: head.ContentLength,
      contentType: head.ContentType,
      generation: head.ETag,
      metadata,
    }];
  }

  async download(options: { start: number; end: number }): Promise<[Buffer]> {
    let response;
    try {
      response = await this.client.send(new this.sdk.GetObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
        Range: `bytes=${options.start}-${options.end}`,
        IfMatch: this.etag,
      }));
    } catch (error) {
      if (isMissing(error)) throw new ObjectNotFoundError();
      throw error;
    }
    const body = response.Body;
    if (!body) throw new ObjectNotFoundError();
    if (typeof body.transformToByteArray === "function") {
      return [Buffer.from(await body.transformToByteArray())];
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return [Buffer.concat(chunks)];
  }

  async delete(options?: { ignoreNotFound?: boolean }) {
    try {
      await this.client.send(new this.sdk.DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
      }));
    } catch (error) {
      if (options?.ignoreNotFound && isMissing(error)) return;
      throw error;
    }
  }

  async copy(destination: MediaObject) {
    if (!(destination instanceof S3MediaObject) || destination.bucketName !== this.bucketName) {
      throw new Error("Cannot copy across storage backends");
    }
    try {
      await this.client.send(new this.sdk.CopyObjectCommand({
        Bucket: this.bucketName,
        Key: destination.name,
        CopySource: copySource(this.bucketName, this.name),
        CopySourceIfMatch: this.etag,
        MetadataDirective: "COPY",
      }));
    } catch (error) {
      if (isMissing(error)) throw new ObjectNotFoundError();
      throw error;
    }
  }

  createReadStream(options?: { start?: number; end?: number }): Readable {
    const pass = new PassThrough();
    const range = options?.start != null && options.end != null ? `bytes=${options.start}-${options.end}` : undefined;
    this.client.send(new this.sdk.GetObjectCommand({
      Bucket: this.bucketName,
      Key: this.name,
      Range: range,
      IfMatch: this.etag,
    })).then((response) => {
      const body = response.Body;
      if (!body || typeof body.pipe !== "function") {
        pass.destroy(new ObjectNotFoundError());
        return;
      }
      body.on("error", (error: Error) => pass.destroy(error));
      body.pipe(pass);
    }).catch((error: unknown) => {
      pass.destroy(isMissing(error) ? new ObjectNotFoundError() : error as Error);
    });
    return pass;
  }

  async setMetadata(metadata: { metadata: Record<string, string> }) {
    const head = await this.head();
    const userMeta: Record<string, string> = { ...(head.Metadata ?? {}) };
    for (const [key, value] of Object.entries(metadata.metadata)) {
      userMeta[key === "custom:aclPolicy" ? ACL_METADATA_KEY : key] = value;
    }
    await this.client.send(new this.sdk.CopyObjectCommand({
      Bucket: this.bucketName,
      Key: this.name,
      CopySource: copySource(this.bucketName, this.name),
      CopySourceIfMatch: head.ETag,
      MetadataDirective: "REPLACE",
      ContentType: head.ContentType,
      Metadata: userMeta,
    }));
  }
}

export class S3ObjectStorage implements MediaStorage {
  private readonly sdkPromise = loadSdk();
  private clientPromise: Promise<S3ClientLike> | undefined;

  constructor(private readonly config: S3Config = readS3Config()) {
    // Browser uploads send only Content-Type. Don't require checksum headers
    // that the AWS SDK would otherwise fold into the presigned PUT.
    if (!process.env.AWS_REQUEST_CHECKSUM_CALCULATION) {
      process.env.AWS_REQUEST_CHECKSUM_CALCULATION = "WHEN_REQUIRED";
    }
    if (!process.env.AWS_RESPONSE_CHECKSUM_VALIDATION) {
      process.env.AWS_RESPONSE_CHECKSUM_VALIDATION = "WHEN_REQUIRED";
    }
  }

  private async client(): Promise<{ sdk: S3Sdk; client: S3ClientLike }> {
    const sdk = await this.sdkPromise;
    if (!this.clientPromise) {
      this.clientPromise = Promise.resolve(new sdk.S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        forcePathStyle: this.config.forcePathStyle,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      }));
    }
    return { sdk, client: await this.clientPromise };
  }

  getPrivateObjectDir(): string {
    return `/${this.config.bucket}/${this.config.prefix}`;
  }

  private objectKey(objectPath: string): string {
    const entityId = entityIdFromObjectPath(objectPath);
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
    const parsed = parseObjectPath(`${entityDir}${entityId}`);
    if (parsed.bucketName !== this.config.bucket || !parsed.objectName) throw new ObjectNotFoundError();
    return parsed.objectName;
  }

  async reserveUpload(input: { contentType: string }) {
    const objectPath = `/objects/uploads/${randomUUID()}`;
    const key = this.objectKey(objectPath);
    const { sdk, client } = await this.client();
    const uploadUrl = await sdk.getSignedUrl(client, new sdk.PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: input.contentType,
    }), { expiresIn: 900, signableHeaders: new Set(["content-type"]) });
    return { uploadUrl, objectPath };
  }

  async getObjectEntityFile(objectPath: string): Promise<MediaObject> {
    const key = this.objectKey(objectPath);
    const { sdk, client } = await this.client();
    const file = new S3MediaObject(sdk, client, this.config.bucket, key);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) return rawPath;
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: ObjectAclPolicy): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) return normalizedPath;
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }
}

export function createS3Storage(): MediaStorage {
  return new S3ObjectStorage();
}

export { selectStorageBackend };
