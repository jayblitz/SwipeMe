import { Client } from "@replit/object-storage";
import { randomBytes } from "crypto";
import path from "path";

const client = new Client();

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export async function uploadMedia(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<UploadResult> {
  try {
    const ext = path.extname(originalName) || getExtensionFromMimeType(mimeType);
    const key = `moments/${randomBytes(16).toString("hex")}${ext}`;
    
    const { ok, error } = await client.uploadFromBytes(key, buffer);
    
    if (!ok) {
      console.error("Object storage upload failed:", error);
      return { success: false, error: error?.message || "Upload failed" };
    }
    
    const publicUrl = await getPublicUrl(key);
    
    return { 
      success: true, 
      url: publicUrl,
      key 
    };
  } catch (error) {
    console.error("Media upload error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function getPublicUrl(key: string): Promise<string> {
  const domain = process.env.EXPO_PUBLIC_DOMAIN || "swipeme.app";
  return `https://${domain}/api/media/${encodeURIComponent(key)}`;
}

export async function getMediaBuffer(key: string): Promise<Buffer | null> {
  try {
    const { ok, value, error } = await client.downloadAsBytes(key);
    if (!ok || !value) {
      console.error("Failed to download media:", error);
      return null;
    }
    const byteArray = value as unknown as Uint8Array;
    return Buffer.from(byteArray);
  } catch (error) {
    console.error("Error downloading media:", error);
    return null;
  }
}

export async function deleteMedia(key: string): Promise<boolean> {
  try {
    const { ok } = await client.delete(key);
    return ok;
  } catch (error) {
    console.error("Error deleting media:", error);
    return false;
  }
}

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-m4v": ".m4v",
  };
  return mimeToExt[mimeType] || ".bin";
}

export function getMimeTypeFromKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  const extToMime: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".m4v": "video/x-m4v",
  };
  return extToMime[ext] || "application/octet-stream";
}
