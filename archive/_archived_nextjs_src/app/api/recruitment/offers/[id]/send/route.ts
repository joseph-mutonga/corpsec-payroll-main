import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { OfferService } from '@/lib/recruitment/OfferService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('recruitment.offers.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const offer = await OfferService.sendOffer(params.id, auth.session.userId);
    return apiSuccess({
      offer,
      message: `Job offer ${offer.offerNumber} marked as sent. Public link ready.`,
    });
  } catch (error: any) {
    console.error('Error sending job offer:', error);
    return apiBadRequest(error.message || 'Failed to send job offer');
  }
}
