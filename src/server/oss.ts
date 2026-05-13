import OSS from "ali-oss";

let ossClient: OSS | null = null;

function getOSSClient(): OSS {
  if (ossClient) {
    return ossClient;
  }

  const region = process.env.ALIYUN_OSS_REGION;
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.ALIYUN_OSS_BUCKET;

  if (!region || !accessKeyId || !accessKeySecret || !bucket) {
    throw new Error("阿里云OSS配置不完整，请检查环境变量");
  }

  ossClient = new OSS({
    region,
    accessKeyId,
    accessKeySecret,
    bucket,
    endpoint: process.env.ALIYUN_OSS_ENDPOINT,
  });

  return ossClient;
}

export interface UploadResult {
  url: string;
  key: string;
}

export async function uploadFile(
  file: Buffer,
  key: string,
  contentType?: string
): Promise<UploadResult> {
  const client = getOSSClient();

  const options: OSS.PutObjectOptions = {};
  if (contentType) {
    options.headers = {
      "Content-Type": contentType,
    };
  }

  const result = await client.put(key, file, options);

  return {
    url: result.url,
    key: result.name,
  };
}

export async function uploadFileFromUrl(
  url: string,
  key: string
): Promise<UploadResult> {
  // Download file from URL
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());

  // Determine content type from URL
  const contentType = response.headers.get("content-type") || "application/octet-stream";

  return uploadFile(buffer, key, contentType);
}

export async function deleteFile(key: string): Promise<void> {
  const client = getOSSClient();
  await client.delete(key);
}

export async function getFileUrl(key: string): Promise<string> {
  const client = getOSSClient();
  return client.signatureUrl(key, {
    expires: 3600, // 1 hour
  });
}

export async function listFiles(prefix: string): Promise<OSS.ObjectMeta[]> {
  const client = getOSSClient();
  const result = await client.list({
    prefix,
    "max-keys": 100,
  }, {});
  return result.objects || [];
}

// Generate unique filename
export function generateFilename(
  projectId: string,
  type: string,
  extension: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${projectId}/${type}/${timestamp}_${random}.${extension}`;
}

// Get public URL for a file
export function getPublicUrl(key: string): string {
  const bucket = process.env.ALIYUN_OSS_BUCKET;
  const region = process.env.ALIYUN_OSS_REGION;

  if (!bucket || !region) {
    return "";
  }

  return `https://${bucket}.${region}.aliyuncs.com/${key}`;
}
