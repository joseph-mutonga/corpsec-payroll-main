import { NextRequest } from 'next/server';
import { OfferService } from '@/lib/recruitment/OfferService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const offer = await OfferService.getOfferBySecureToken(params.token);
    return apiSuccess({ offer });
  } catch (error: any) {
    console.error('Error fetching offer by secure token:', error);
    return apiBadRequest(error.message || 'Invalid or expired offer link');
  }
}
