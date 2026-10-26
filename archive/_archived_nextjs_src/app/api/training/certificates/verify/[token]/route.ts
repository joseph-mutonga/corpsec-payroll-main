import { NextRequest, NextResponse } from 'next/server';
import { CertificateService } from '@/lib/training/CertificateService';

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const result = await CertificateService.verifyCertificate(params.token);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
