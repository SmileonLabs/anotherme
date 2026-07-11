import express, { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function maxUploadBytes(contentType: string): number {
  return contentType.startsWith("image/") ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  // Images stay capped at 10MB; other files (documents, archives, …) may be
  // larger so the chat file-transfer flow allows up to 25MB.
  const isImage = contentType.startsWith("image/");
  const max = isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
  if (size > max) {
    res.status(400).json({
      error: isImage
        ? "이미지 크기는 10MB를 초과할 수 없습니다."
        : "파일 크기는 25MB를 초과할 수 없습니다.",
    });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/uploads/object
 *
 * Browser/PWA fallback for buckets that do not allow direct browser PUT CORS.
 * Native clients still use presigned URLs; web uploads raw bytes to the API and
 * the server writes the object with its S3 credentials.
 */
router.post(
  "/storage/uploads/object",
  requireAuth,
  express.raw({ type: "*/*", limit: MAX_FILE_BYTES }),
  async (req: Request, res: Response) => {
    const size = Number(req.query.size);
    const parsed = RequestUploadUrlBody.safeParse({
      name: typeof req.query.name === "string" ? req.query.name : "upload",
      size: Number.isFinite(size) ? size : 0,
      contentType:
        typeof req.query.contentType === "string"
          ? req.query.contentType
          : "application/octet-stream",
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    const { name, contentType } = parsed.data;
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (body.length < 1) {
      res.status(400).json({ error: "Missing upload body" });
      return;
    }

    const max = maxUploadBytes(contentType);
    if (body.length > max) {
      res.status(400).json({
        error: contentType.startsWith("image/")
          ? "이미지 크기는 10MB를 초과할 수 없습니다."
          : "파일 크기는 25MB를 초과할 수 없습니다.",
      });
      return;
    }

    try {
      const objectPath = await objectStorageService.uploadObjectEntity(body, contentType);
      res.json({ objectPath, metadata: { name, size: body.length, contentType } });
    } catch (error) {
      req.log.error({ err: error }, "Error uploading object via API");
      res.status(500).json({ error: "Failed to upload object" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    // Object content is user-uploaded. Stop the browser from MIME-sniffing it
    // and force everything except plain raster images to download rather than
    // render inline — otherwise an uploaded HTML/SVG could execute as
    // same-origin script (stored XSS) when its URL is opened directly.
    const ct = (response.headers.get("content-type") || "").toLowerCase();
    const inlineSafe = /^image\/(png|jpe?g|gif|webp|bmp)$/.test(ct);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!inlineSafe) {
      res.setHeader("Content-Disposition", "attachment");
    }

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
