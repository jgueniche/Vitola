import { NextResponse } from 'next/server'

/** Liveness probe. No authentication, no database access, no secrets. */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    phase: 'P0',
    timestamp: new Date().toISOString(),
  })
}
