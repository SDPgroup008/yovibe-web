const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { requiredEnv, assertR2Config } = require('./runtimeConfig');

const PRIVATE_REFERENCE_PREFIX = 'r2-private://';

function getR2Config(kind) {
  if (!['public', 'private'].includes(kind)) throw new Error('R2 kind must be public or private');
  const prefix = kind === 'public' ? 'R2_PUBLIC' : 'R2_PRIVATE';
  return assertR2Config({
    kind,
    endpoint: requiredEnv('R2_ENDPOINT'),
    bucket: requiredEnv(`${prefix}_BUCKET_NAME`),
    accessKeyId: requiredEnv(`${prefix}_ACCESS_KEY_ID`),
    secretAccessKey: requiredEnv(`${prefix}_SECRET_ACCESS_KEY`),
    publicUrl: kind === 'public' ? requiredEnv('R2_PUBLIC_URL').replace(/\/$/, '') : null,
  });
}

function getR2Client(kind) {
  const config = getR2Config(kind);
  return {
    config,
    client: new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    }),
  };
}

function encodePath(value) {
  return String(value).split('/').map((part) => encodeURIComponent(part)).join('/');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function presignR2({ kind, method, key, contentType, expiresSeconds = 300 }) {
  const config = getR2Config(kind);
  const endpointUrl = new URL(config.endpoint);
  const host = endpointUrl.host;
  const path = `${endpointUrl.pathname.replace(/\/$/, '')}/${encodePath(config.bucket)}/${encodePath(key)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const credentialScope = `${date}/auto/s3/aws4_request`;
  const signedHeaders = contentType ? 'content-type;host' : 'host';
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(1, Math.min(604800, expiresSeconds))),
    'X-Amz-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.keys(query).sort()
    .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(query[name])}`).join('&');
  const canonicalHeaders = `${contentType ? `content-type:${contentType}\n` : ''}host:${host}\n`;
  const canonicalRequest = [
    method.toUpperCase(), path, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, date), 'auto'), 's3'), 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  return `${endpointUrl.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function privateReference(key) {
  return `${PRIVATE_REFERENCE_PREFIX}${key}`;
}

function privateKeyFromReference(value) {
  const text = String(value || '');
  if (!text.startsWith(PRIVATE_REFERENCE_PREFIX)) return null;
  const key = text.slice(PRIVATE_REFERENCE_PREFIX.length);
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) return null;
  return key;
}

function publicUrlForKey(key) {
  return `${getR2Config('public').publicUrl}/${encodePath(key)}`;
}

async function uploadObject(kind, { key, body, contentType }) {
  const { client, config } = getR2Client(kind);
  await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
  return kind === 'public' ? publicUrlForKey(key) : privateReference(key);
}

async function getObject(kind, key) {
  const { client, config } = getR2Client(kind);
  return client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
}

async function deleteObject(kind, key) {
  const { client, config } = getR2Client(kind);
  return client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

async function listObjects(kind, input) {
  const { client, config } = getR2Client(kind);
  return client.send(new ListObjectsV2Command({ Bucket: config.bucket, ...input }));
}

module.exports = {
  PRIVATE_REFERENCE_PREFIX,
  getR2Config,
  getR2Client,
  presignR2,
  privateReference,
  privateKeyFromReference,
  publicUrlForKey,
  uploadObject,
  getObject,
  deleteObject,
  listObjects,
};
