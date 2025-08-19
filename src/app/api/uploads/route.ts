import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
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

    const fileName = (fileField as File).name || `upload-${Date.now()}`;
    const contentType = (fileField as File).type || "application/octet-stream";
    const arrayBuffer = await (fileField as File).arrayBuffer();
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

    // Return public URL path
    const publicPath = `/note_imgs/${encodeURIComponent(
      String(orgId)
    )}/${encodeURIComponent(outName)}`;
    return NextResponse.json(
      { url: publicPath, filename: outName, contentType },
      { status: 201 }
    );
  } catch (err) {
    console.error("/api/uploads error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
