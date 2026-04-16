import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { RunloopSDK } from '@runloop/api-client';
import { ContentType } from './validators';

export interface UploadResult {
  objectId: string;
  objectName: string;
}

/**
 * Upload a tar.gz file directly.
 */
export async function uploadTarFile(
  client: RunloopSDK,
  filePath: string,
  ttlDays?: number,
  isPublic?: boolean,
  contentTypeOverride?: ContentType
): Promise<UploadResult> {
  core.info(`Uploading tar file: ${filePath}`);

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  let contentType: ContentType;
  if (contentTypeOverride) {
    contentType = contentTypeOverride;
  } else if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
    contentType = 'tgz';
  } else if (fileName.endsWith('.tar')) {
    contentType = 'tar';
  } else if (fileName.endsWith('.gz')) {
    contentType = 'gzip';
  } else {
    throw new Error(`Unsupported tar file extension: ${fileName}`);
  }

  return uploadBuffer(client, fileBuffer, fileName, contentType, ttlDays, isPublic);
}

/**
 * Upload a single file (text or binary).
 */
export async function uploadSingleFile(
  client: RunloopSDK,
  filePath: string,
  ttlDays?: number,
  isPublic?: boolean,
  contentTypeOverride?: ContentType
): Promise<UploadResult> {
  core.info(`Uploading single file: ${filePath}`);

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const contentType = contentTypeOverride ?? determineContentType(fileName, fileBuffer);

  return uploadBuffer(client, fileBuffer, fileName, contentType, ttlDays, isPublic);
}

/**
 * Upload a buffer to Runloop as an object.
 * Implements the three-step upload process:
 * 1. Create object (get presigned URL)
 * 2. Upload to presigned URL
 * 3. Complete the upload
 */
async function uploadBuffer(
  client: RunloopSDK,
  buffer: Buffer,
  objectName: string,
  contentType: ContentType,
  ttlDays?: number,
  isPublic?: boolean
): Promise<UploadResult> {
  core.info(`Starting object upload: ${objectName} (${buffer.length} bytes, type: ${contentType})`);

  // Step 1: Create object and get presigned URL
  const ttlMs = ttlDays ? ttlDays * 24 * 60 * 60 * 1000 : undefined;
  const createParams = {
    name: objectName,
    content_type: contentType,
    metadata: {
      source: 'github-action',
      uploaded_at: new Date().toISOString(),
    },
    ...(ttlMs && { ttl_ms: ttlMs }),
    ...(isPublic && { is_public: true }),
  };

  core.info('Creating object...');
  const createdObject = await client.api.objects.create(createParams);

  if (!createdObject.upload_url) {
    throw new Error('Object creation did not return an upload URL');
  }

  core.info(`Object created: ${createdObject.id}`);
  core.info(`Upload URL obtained: ${createdObject.upload_url.substring(0, 50)}...`);

  // Step 2: Upload to presigned URL
  core.info('Uploading to presigned URL...');
  const uploadResponse = await fetch(createdObject.upload_url, {
    method: 'PUT',
    body: buffer,
    headers: {
      'Content-Type': getContentTypeHeader(contentType),
      'Content-Length': buffer.length.toString(),
    },
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(
      `Upload to presigned URL failed: ${uploadResponse.status} ${uploadResponse.statusText}\n${errorText}`
    );
  }

  core.info('Upload successful');

  // Step 3: Complete the upload
  core.info('Completing object upload...');
  const completedObject = await client.api.objects.complete(createdObject.id);

  if (completedObject.state !== 'READ_ONLY') {
    core.warning(`Object state is ${completedObject.state}, expected READ_ONLY`);
  }

  core.info(`Object upload completed: ${completedObject.id}`);

  return {
    objectId: completedObject.id,
    objectName: objectName,
  };
}

// Magic byte signatures
const GZIP_MAGIC = [0x1f, 0x8b];
// Tar header: bytes 257-261 should be "ustar" in valid tar archives
const TAR_MAGIC_OFFSET = 257;
const TAR_MAGIC = [0x75, 0x73, 0x74, 0x61, 0x72]; // "ustar"

function hasGzipHeader(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === GZIP_MAGIC[0] && buffer[1] === GZIP_MAGIC[1];
}

function hasTarHeader(buffer: Buffer): boolean {
  if (buffer.length < TAR_MAGIC_OFFSET + TAR_MAGIC.length) return false;
  return TAR_MAGIC.every((byte, i) => buffer[TAR_MAGIC_OFFSET + i] === byte);
}

function hasTarHeaderInGzip(buffer: Buffer): boolean {
  if (!hasGzipHeader(buffer)) return false;
  try {
    const decompressed = zlib.gunzipSync(buffer, { maxOutputLength: 512 });
    return hasTarHeader(decompressed);
  } catch {
    return false;
  }
}

function isTextContent(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(1024, buffer.length));
  let textBytes = 0;
  for (const byte of sample) {
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      textBytes++;
    }
  }
  return sample.length > 0 && textBytes / sample.length > 0.85;
}

/**
 * Determine content type by cross-referencing file extension with actual
 * file contents (magic bytes). Falls back to content-based heuristics
 * when no extension match.
 */
function determineContentType(fileName: string, buffer: Buffer): ContentType {
  // .tar.gz / .tgz — verify gzip header and tar inside
  if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
    if (hasGzipHeader(buffer) && hasTarHeaderInGzip(buffer)) return 'tgz';
    if (hasGzipHeader(buffer)) return 'gzip';
    core.warning(`${fileName} has .tgz extension but no valid gzip+tar content`);
    return 'binary';
  }

  // .tar — verify tar header
  if (fileName.endsWith('.tar')) {
    if (hasTarHeader(buffer)) return 'tar';
    core.warning(`${fileName} has .tar extension but no valid tar header`);
    return 'binary';
  }

  // .gz — verify gzip header, check if tar inside
  if (fileName.endsWith('.gz')) {
    if (hasGzipHeader(buffer)) {
      if (hasTarHeaderInGzip(buffer)) return 'tgz';
      return 'gzip';
    }
    core.warning(`${fileName} has .gz extension but no valid gzip header`);
    return 'binary';
  }

  // No archive extension — pure content-based detection
  if (hasGzipHeader(buffer)) {
    if (hasTarHeaderInGzip(buffer)) return 'tgz';
    return 'gzip';
  }
  if (hasTarHeader(buffer)) return 'tar';
  if (isTextContent(buffer)) return 'text';
  return 'binary';
}

/**
 * Get HTTP Content-Type header for object upload.
 */
function getContentTypeHeader(contentType: ContentType): string {
  const contentTypeMap: Record<ContentType, string> = {
    unspecified: 'application/octet-stream',
    text: 'text/plain',
    binary: 'application/octet-stream',
    gzip: 'application/gzip',
    tar: 'application/x-tar',
    tgz: 'application/gzip',
  };

  return contentTypeMap[contentType];
}
