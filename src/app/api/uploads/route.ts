import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    // Check content length before processing
    const contentLength = request.headers.get("content-length");
    const maxSizeBytes = 1024 * 1024; // 1MB limit to match backend

    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${
            maxSizeBytes / 1024 / 1024
          }MB`,
        },
        { status: 413 }
      );
    }

    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId") || "default";

    // Parse multipart form data
    const formData = await request.formData();
    // Accept common field names
    const fileField =
      formData.get("file") ||
      formData.get("image") ||
      formData.get("attachment");
    if (!fileField || typeof fileField === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const file = fileField as File;

    // Check individual file size as well
    if (file.size > maxSizeBytes) {
      return NextResponse.json(
        {
          error: `File too large (${(file.size / 1024 / 1024).toFixed(
            1
          )}MB). Maximum size is ${maxSizeBytes / 1024 / 1024}MB`,
        },
        { status: 413 }
      );
    }

    const fileName = file.name || `upload-${Date.now()}`;
    const contentType = file.type || "application/octet-stream";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure public/note_imgs/<orgId> exists
    const publicDir = path.join(process.cwd(), "public");
    const uploadsDir = path.join(publicDir, "note_imgs", String(orgId));
    await fs.promises.mkdir(uploadsDir, { recursive: true });

    // Sanitize filename and prepend timestamp
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const outName = `${Date.now()}-${safeName}`;
    const outPath = path.join(uploadsDir, outName);

    await fs.promises.writeFile(outPath, buffer);

    // Return path that matches backend database format: note_imgs/orgId/filename
    // This will be resolved by resolveAssetUrl to http://localhost:8000/media/note_imgs/filename
    const dbPath = `note_imgs/${String(orgId)}/${outName}`;
    return NextResponse.json(
      { url: dbPath, filename: outName, contentType },
      { status: 201 }
    );
  } catch (err) {
    console.error("/api/uploads error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
