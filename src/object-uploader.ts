import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import Runloop from '@runloop/api-client';

export interface UploadResult {
  objectId: string;
  objectName: string;
}

/**
 * Upload a tar.gz file directly.
 */
export async function uploadTarFile(
  client: Runloop,
  filePath: string,
  ttlDays?: number
): Promise<UploadResult> {
  core.info(`Uploading tar file: ${filePath}`);

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  // Determine content type based on file extension
  let contentType: 'tgz' | 'tar' | 'gzip';
  if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
    contentType = 'tgz';
  } else if (fileName.endsWith('.tar')) {
    contentType = 'tar';
  } else if (fileName.endsWith('.gz')) {
    contentType = 'gzip';
  } else {
    throw new Error(`Unsupported tar file extension: ${fileName}`);
  }

  return uploadBuffer(client, fileBuffer, fileName, contentType, ttlDays);
}

/**
 * Upload a single file (text or binary).
 */
export async function uploadSingleFile(
  client: Runloop,
  filePath: string,
  ttlDays?: number
): Promise<UploadResult> {
  core.info(`Uploading single file: ${filePath}`);

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  // Determine content type based on file
  const contentType = determineContentType(fileName, fileBuffer);

  return uploadBuffer(client, fileBuffer, fileName, contentType, ttlDays);
}

/**
 * Upload a buffer to Runloop as an object.
 * Implements the three-step upload process:
 * 1. Create object (get presigned URL)
 * 2. Upload to presigned URL
 * 3. Complete the upload
 */
async function uploadBuffer(
  client: Runloop,
  buffer: Buffer,
  objectName: string,
  contentType: 'text' | 'binary' | 'gzip' | 'tar' | 'tgz',
  ttlDays?: number
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
  };

  core.info('Creating object...');
  const createdObject = await client.objects.create(createParams);

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
  const completedObject = await client.objects.complete(createdObject.id);

  if (completedObject.state !== 'read_only') {
    core.warning(`Object state is ${completedObject.state}, expected read_only`);
  }

  core.info(`Object upload completed: ${completedObject.id}`);

  return {
    objectId: completedObject.id,
    objectName: objectName,
  };
}

/**
 * Determine content type based on file characteristics.
 */
function determineContentType(
  fileName: string,
  buffer: Buffer
): 'text' | 'binary' | 'gzip' | 'tar' | 'tgz' {
  // Check file extension first
  if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
    return 'tgz';
  }
  if (fileName.endsWith('.tar')) {
    return 'tar';
  }
  if (fileName.endsWith('.gz')) {
    return 'gzip';
  }

  // Check if file is text by looking at content
  // If it's mostly ASCII/UTF-8 printable characters, treat as text
  const sample = buffer.slice(0, Math.min(1024, buffer.length));
  let textBytes = 0;

  for (const byte of sample) {
    // Count printable ASCII and common whitespace
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      textBytes++;
    }
  }

  const textRatio = textBytes / sample.length;
  return textRatio > 0.85 ? 'text' : 'binary';
}

/**
 * Get HTTP Content-Type header for object upload.
 */
function getContentTypeHeader(contentType: string): string {
  const contentTypeMap: Record<string, string> = {
    text: 'text/plain',
    binary: 'application/octet-stream',
    gzip: 'application/gzip',
    tar: 'application/x-tar',
    tgz: 'application/gzip',
  };

  return contentTypeMap[contentType] || 'application/octet-stream';
}
