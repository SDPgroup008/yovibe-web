"use strict";
// Web-compatible R2 upload service
// In browser: calls Netlify function
// In Node.js: uses AWS SDK directly
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToR2 = uploadToR2;
exports.deleteFromR2 = deleteFromR2;
exports.getR2PublicUrl = getR2PublicUrl;
exports.uploadQRCode = uploadQRCode;
exports.uploadBuyerPhoto = uploadBuyerPhoto;
exports.uploadTicketDesignBackground = uploadTicketDesignBackground;
exports.uploadBatch = uploadBatch;
const supabase_1 = require("../config/supabase");
const isServerSide = typeof window === 'undefined';
const PUBLIC_URL = process.env.EXPO_PUBLIC_R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';
const FUNCTIONS_BASE_URL = process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL ||
    process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ||
    process.env.EXPO_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    '';
const UPLOAD_TIMEOUT_MS = 20000;
// Detect the actual image format from the file bytes. Upload callers can
// mislabel images (e.g. JPEG bytes sent as image/png); the stored object must
// carry the Content-Type/extension that matches its real format or every
// downstream decoder (resvg, native Image) silently drops it.
function sniffImageMime(bytes) {
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return "image/jpeg";
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
        return "image/webp";
    if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38)
        return "image/gif";
    let head = "";
    for (let i = 0; i < Math.min(bytes.length, 256); i++)
        head += String.fromCharCode(bytes[i]);
    if (head.toLowerCase().includes("<svg"))
        return "image/svg+xml";
    return null;
}
// Raster formats the server-side PDF rasterizer (@resvg/resvg-js) cannot decode.
// Anything in this list is re-encoded to PNG in the browser before uploading.
const RESVG_UNSUPPORTED_IMAGE_MIMES = new Set([
    "image/webp",
    "image/avif",
    "image/heic",
    "image/heif",
    "image/tiff",
    "image/bmp",
    "image/x-ms-bmp",
]);
// Re-encode an image blob to a PNG data URL in the browser. Used to normalize
// formats resvg cannot decode (WebP, AVIF, HEIC, TIFF, BMP) so ticket PDFs can
// always embed the background. Falls back to null so uploaders keep the
// original bytes when conversion is not possible.
async function convertImageBlobToPngDataUrl(input) {
    try {
        let bitmap = null;
        let source;
        if (typeof createImageBitmap === "function") {
            bitmap = await createImageBitmap(input);
            source = bitmap;
        }
        else {
            source = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error("image decode failed"));
                img.src = URL.createObjectURL(input);
            });
        }
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            return null;
        ctx.drawImage(source, 0, 0);
        if (bitmap)
            bitmap.close();
        return await new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (!blob)
                    return resolve(null);
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            }, "image/png");
        });
    }
    catch {
        return null;
    }
}
function resolveFunctionUrl(functionName) {
    const normalizedBase = FUNCTIONS_BASE_URL.replace(/\/$/, '');
    if (normalizedBase) {
        return `${normalizedBase}/.netlify/functions/${functionName}`;
    }
    if (!isServerSide && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        // In expo web dev, local server does not host Netlify functions by default.
        // Route to deployed function host unless an explicit base URL is provided.
        throw new Error(`Set NEXT_PUBLIC_FUNCTIONS_BASE_URL when using ${functionName} outside Netlify Dev.`);
    }
    return `/.netlify/functions/${functionName}`;
}
/**
 * Upload file to R2 and return public URL
 * Works in both browser and Node.js environments
 */
async function uploadToR2(options) {
    try {
        const { contentType, path, filename, body } = options;
        const key = `${path}/${filename}`;
        if (isServerSide)
            throw new Error('Use netlify/shared/r2.js for server-side storage');
        return await uploadToR2Browser(key, body, contentType, path, filename);
    }
    catch (error) {
        console.error('[R2Service] Upload error:', error);
        throw error;
    }
}
/**
 * Browser-side upload to R2 via Netlify function
 */
async function uploadToR2Browser(key, body, contentType, path, filename) {
    var _a;
    let fileData;
    let finalContentType = contentType;
    let finalFilename = filename;
    const blobToDataUrl = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('Failed to read file for upload'));
            reader.readAsDataURL(blob);
        });
    };
    if (typeof body === 'string') {
        if (body.startsWith('data:')) {
            fileData = body.replace(/^data:[^;]+;base64,/, '');
        }
        else {
            // Expo camera returns a local file URI. Resolve it to bytes before the
            // upload request; sending the URI text would create a corrupt object.
            try {
                const sourceResponse = await fetch(body);
                if (!sourceResponse.ok)
                    throw new Error(`Could not read image URI (${sourceResponse.status})`);
                const sourceBlob = await sourceResponse.blob();
                const dataUrl = await blobToDataUrl(sourceBlob);
                fileData = dataUrl.replace(/^data:[^;]+;base64,/, '');
                if (!finalContentType || finalContentType === 'application/octet-stream') {
                    finalContentType = sourceBlob.type || 'image/jpeg';
                }
            }
            catch (error) {
                throw new Error(`Could not prepare image for upload: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            }
        }
    }
    else if (body instanceof Blob) {
        const dataUrl = await blobToDataUrl(body);
        fileData = dataUrl.replace(/^data:[^;]+;base64,/, '');
    }
    else if (Buffer.isBuffer(body)) {
        fileData = body.toString('base64');
    }
    else {
        fileData = body;
    }
    // resvg (the server-side PDF rasterizer) cannot decode WebP/AVIF/HEIC/TIFF/BMP.
    // Re-encode those to PNG in the browser so every format still renders in the
    // generated ticket PDF.
    if (String(contentType || "").toLowerCase().startsWith("image/") && RESVG_UNSUPPORTED_IMAGE_MIMES.has(String(contentType).toLowerCase())) {
        try {
            const isDataUrl = typeof body === "string" && body.startsWith("data:");
            const sourceBlob = body instanceof Blob
                ? body
                : isDataUrl
                    ? await (await fetch(body)).blob()
                    : null;
            if (sourceBlob) {
                const pngDataUrl = await convertImageBlobToPngDataUrl(sourceBlob);
                if (pngDataUrl) {
                    fileData = pngDataUrl.replace(/^data:[^;]+;base64,/, "");
                    finalContentType = "image/png";
                    finalFilename = filename.replace(/\.[a-z0-9]{1,5}$/i, "") + ".png";
                    key = `${path}/${finalFilename}`;
                }
            }
        }
        catch (error) {
            console.warn("[R2Service] Format normalization failed, uploading original:", error);
        }
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    let response;
    try {
        const { data: { session } } = await supabase_1.supabase.auth.getSession();
        if (!(session === null || session === void 0 ? void 0 : session.access_token))
            throw new Error('Organiser authentication is required to upload public assets');
        response = await fetch(resolveFunctionUrl('uploadR2'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
                file: fileData,
                filename: finalFilename,
                contentType: finalContentType,
                path,
                type: 'media',
            }),
        });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.name) === 'AbortError') {
            throw new Error(`Upload request timed out after ${UPLOAD_TIMEOUT_MS / 1000}s. ` +
                `If running locally, set NEXT_PUBLIC_FUNCTIONS_BASE_URL or run via netlify dev.`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutId);
    }
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        // Provide helpful error message for configuration issues
        if ((_a = errorData.error) === null || _a === void 0 ? void 0 : _a.includes('R2 storage not configured')) {
            throw new Error('R2 storage is not configured. Please set up Cloudflare R2 credentials in your Netlify environment variables:\n' +
                '- R2_PUBLIC_ACCESS_KEY_ID\n' +
                '- R2_PUBLIC_SECRET_ACCESS_KEY\n' +
                '- R2_ACCOUNT_ID\n' +
                '- R2_PUBLIC_BUCKET_NAME\n' +
                '- R2_ENDPOINT\n' +
                '- R2_PUBLIC_URL\n\n' +
                'See: https://developers.cloudflare.com/r2/api/s3/tokens/');
        }
        throw new Error(`Upload failed: ${errorData.error || response.statusText}`);
    }
    const result = await response.json();
    return { url: result.url, key };
}
/**
 * Delete file from R2
 */
async function deleteFromR2(key) {
    void key;
    throw new Error('R2 deletion is server-only; call an authorized server workflow');
}
/**
 * Get public URL for R2 key
 */
function getR2PublicUrl(key) {
    if (!PUBLIC_URL)
        throw new Error('NEXT_PUBLIC_R2_PUBLIC_URL is not configured');
    return `${PUBLIC_URL}/${key}`;
}
/**
 * Upload QR code data URL to R2
 */
async function uploadQRCode(qrCodeDataUrl, ticketId) {
    try {
        return await uploadToR2({
            path: 'qr-codes',
            filename: `${ticketId}.png`,
            contentType: 'image/png',
            body: qrCodeDataUrl,
        });
    }
    catch (error) {
        console.error('[R2Service] QR Code upload error:', error);
        throw error;
    }
}
/**
 * Upload buyer photo to R2
 */
async function uploadBuyerPhoto(photoUri, ticketId, photoUploadToken) {
    try {
        if (!isServerSide) {
            const sourceResponse = photoUri.startsWith("data:") ? await fetch(photoUri) : await fetch(photoUri);
            if (!sourceResponse.ok)
                throw new Error(`Could not read photo (${sourceResponse.status})`);
            const blob = await sourceResponse.blob();
            if (blob.size > 10 * 1024 * 1024)
                throw new Error("Security photo exceeds the 10 MB limit");
            const contentType = ["image/jpeg", "image/png", "image/webp"].includes(blob.type)
                ? blob.type
                : "image/jpeg";
            const key = `buyer-photos/${ticketId}.jpg`;
            try {
                const response = await fetch(resolveFunctionUrl("presign-buyer-photo"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key, contentType, ticketId, token: photoUploadToken }),
                });
                const signed = await response.json();
                if (!response.ok || !signed.uploadUrl)
                    throw new Error(signed.error || "Could not prepare photo upload");
                const upload = await fetch(signed.uploadUrl, {
                    method: "PUT",
                    headers: { "Content-Type": contentType },
                    body: blob,
                });
                if (!upload.ok)
                    throw new Error(`R2 photo upload failed (${upload.status})`);
                return { url: signed.photoReference, key };
            }
            catch (directError) {
                throw directError;
            }
        }
        return await uploadToR2({
            path: 'buyer-photos',
            filename: `${ticketId}.jpg`,
            contentType: 'image/jpeg',
            body: photoUri,
        });
    }
    catch (error) {
        console.error('[R2Service] Buyer photo upload error:', error);
        throw error;
    }
}
/**
 * Upload ticket design background to R2
 */
async function uploadTicketDesignBackground(backgroundDataUrl, eventId, feeName) {
    try {
        // Extract content type from data URL
        const contentTypeMatch = backgroundDataUrl.match(/^data:(image\/[a-z]+)/i);
        const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/png';
        // Extract extension from content type
        const extension = contentType.split('/')[1] || 'png';
        const filename = `${eventId}_${feeName}_background.${extension}`;
        return await uploadToR2({
            path: 'ticket-designs',
            filename,
            contentType,
            body: backgroundDataUrl,
        });
    }
    catch (error) {
        console.error('[R2Service] Ticket design background upload error:', error);
        throw error;
    }
}
/**
 * Batch upload multiple files to R2
 */
async function uploadBatch(files) {
    const results = await Promise.allSettled(files.map(file => uploadToR2(file)));
    return results.map((result, index) => {
        if (result.status === 'fulfilled') {
            return { ...result.value, success: true };
        }
        else {
            console.error(`[R2Service] Batch upload failed for ${files[index].filename}:`, result.reason);
            return { url: '', key: files[index].filename, success: false };
        }
    });
}
