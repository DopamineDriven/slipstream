import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { detectDeviceWorkup } from "@/lib/server-cookies";

export async function GET(req: NextRequest) {
  return NextResponse.json(detectDeviceWorkup(req), { status: 200 });
}
