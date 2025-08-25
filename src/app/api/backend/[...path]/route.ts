import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return handleBackendRequest(request, "GET", resolvedParams.path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return handleBackendRequest(request, "POST", resolvedParams.path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return handleBackendRequest(request, "PUT", resolvedParams.path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return handleBackendRequest(request, "DELETE", resolvedParams.path);
}

async function handleBackendRequest(
  request: NextRequest,
  method: string,
  pathParts: string[]
) {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    const path = pathParts.join("/");
    // Forward exact path to backend, preserving trailing slash from original request
    const originalPathname = request.nextUrl.pathname;
    const hasTrailingSlash = originalPathname.endsWith("/");
    const url = `${backendUrl}/${path}${hasTrailingSlash ? "/" : ""}`;

    // Forward headers (including Authorization)
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      // Forward important headers but not host-specific ones
      if (
        !["host", "connection", "content-length"].includes(key.toLowerCase())
      ) {
        headers[key] = value;
      }
    });

    // Add search params
    const searchParams = request.nextUrl.searchParams.toString();
    const fullUrl = searchParams ? `${url}?${searchParams}` : url;

    console.log(`Proxying ${method} request to: ${fullUrl}`);
    console.log("Incoming Content-Type:", headers["content-type"]);
    console.log("Path parts:", pathParts);
    console.log("Path:", path);

    // Prepare outgoing body
    let outgoingBody: BodyInit | undefined = undefined;
    if (method !== "GET" && method !== "DELETE") {
      const ct = (headers["content-type"] || "").toLowerCase();
      const isMultipart = ct.includes("multipart/form-data");
      if (isMultipart) {
        try {
          // Best-effort: forward the exact original bytes (preserve original boundary header)
          const blob = await request.blob();
          outgoingBody = blob as unknown as BodyInit;
        } catch (e) {
          // Fallback: rebuild a fresh FormData so fetch sets a new boundary correctly
          const incoming = await request.formData();
          const fd = new FormData();
          for (const [key, val] of incoming.entries()) {
            if (val instanceof File) {
              fd.append(key, val, (val as File).name);
            } else {
              fd.append(key, String(val));
            }
          }
          // Let fetch set the correct multipart boundary
          delete headers["content-type"];
          outgoingBody = fd as unknown as BodyInit;
        }
      } else {
        // Forward raw bytes for JSON, x-www-form-urlencoded, etc.
        const buf = await request.arrayBuffer();
        outgoingBody = buf as unknown as BodyInit;
      }
    }

    const response = await fetch(fullUrl, {
      method,
      headers,
      body: outgoingBody,
    } as RequestInit);

    console.log(`Backend response status: ${response.status}`);

    // Stream the backend response back unchanged (works for JSON and binary)
    const proxyResponse = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
    });

    // Forward response headers
    response.headers.forEach((value, key) => {
      try {
        proxyResponse.headers.set(key, value);
      } catch {}
    });

    return proxyResponse;
  } catch (error) {
    console.error("Backend proxy error:", error);
    return NextResponse.json(
      { error: "Backend service unavailable" },
      { status: 503 }
    );
  }
}
