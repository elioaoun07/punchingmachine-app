import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for Google Apps Script.
 * Eliminates all CORS issues — the browser only talks to our own origin,
 * and the Next.js server talks to Google server-to-server (no CORS).
 *
 * GET  /api/sheets?url=<encoded>&date=...&month=...
 * POST /api/sheets  body: { url, ...payload }
 *
 * NOTE: Google Apps Script returns 302 redirects. We handle them manually
 * because Node.js fetch (undici) converts POST→GET on 302, which can
 * break the response chain on Vercel's serverless runtime.
 */

// Force dynamic — never cache this route
export const dynamic = 'force-dynamic';

/**
 * Follow Google Apps Script redirect chain manually.
 * GAS responds with 302 → googleusercontent.com to serve the actual response.
 */
async function followRedirects(url: string, options: RequestInit, maxRedirects = 5): Promise<Response> {
  let response = await fetch(url, { ...options, redirect: 'manual' });
  let redirects = 0;

  while ((response.status === 301 || response.status === 302 || response.status === 307) && redirects < maxRedirects) {
    const location = response.headers.get('location');
    if (!location) break;
    // Follow redirect as GET (body already processed by GAS)
    response = await fetch(location, { method: 'GET', redirect: 'manual' });
    redirects++;
  }

  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sheetUrl = searchParams.get('url');

  if (!sheetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Forward all query params except 'url' to the Apps Script
    const target = new URL(sheetUrl);
    searchParams.forEach((value, key) => {
      if (key !== 'url') target.searchParams.set(key, value);
    });

    const response = await followRedirects(target.toString(), { method: 'GET' });
    const text = await response.text();

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json(
        { error: 'Invalid response from Google Sheets', raw: text.substring(0, 500) },
        { status: 502 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to reach Google Sheets', message: error.message },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, ...payload } = body;

    if (!url) {
      return NextResponse.json({ error: 'Missing url in body' }, { status: 400 });
    }

    const response = await followRedirects(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch {
      // Apps Script sometimes returns non-JSON on success
      return NextResponse.json({ status: 'ok', raw: text.substring(0, 500) });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to reach Google Sheets', message: error.message },
      { status: 502 }
    );
  }
}
