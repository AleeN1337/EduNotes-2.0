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

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    // Prefer an explicit relative path under /note_imgs
    let relPath = url.searchParams.get("path");
    const orgId = url.searchParams.get("orgId");
    const name = url.searchParams.get("name");

    if (!relPath) {
      if (!orgId || !name) {
        return NextResponse.json(
          { error: "Missing path or (orgId,name)" },
          { status: 400 }
        );
      }
      relPath = `/note_imgs/${encodeURIComponent(orgId)}/${encodeURIComponent(
        name
      )}`;
    }

    // Normalize: ensure it starts with /note_imgs/
    if (relPath.startsWith("/api/backend")) {
      relPath = relPath.replace(/^\/api\/backend/, "");
    }
    if (!relPath.startsWith("/note_imgs/")) {
      // also accept bare note_imgs/... without leading slash
      if (relPath.startsWith("note_imgs/")) {
        relPath = `/${relPath}`;
      } else {
        return NextResponse.json({ error: "Invalid path" }, { status: 400 });
      }
    }

    // Prevent path traversal
    const unsafe = relPath.includes("..") || relPath.includes("\\..")
      || relPath.includes("%2e%2e") || relPath.includes("%2E%2E");
    if (unsafe) {
      return NextResponse.json({ error: "Unsafe path" }, { status: 400 });
    }

    const publicDir = path.join(process.cwd(), "public");
    const absPath = path.join(publicDir, relPath);

    // Ensure target is within public/note_imgs
    const noteImgsDir = path.join(publicDir, "note_imgs");
    const resolved = path.resolve(absPath);
    if (!resolved.startsWith(path.resolve(noteImgsDir))) {
      return NextResponse.json({ error: "Path outside note_imgs" }, { status: 400 });
    }

    try {
      await fs.promises.unlink(absPath);
    } catch (e: any) {
      // If file not found, treat as success (idempotent delete)
      if (e?.code !== "ENOENT") throw e;
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("/api/uploads DELETE error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
