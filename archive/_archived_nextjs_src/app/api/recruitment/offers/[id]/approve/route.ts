import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { OfferService } from '@/lib/recruitment/OfferService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('recruitment.offers.approve');
    if ('errorResponse' in auth) return auth.errorResponse;

    const offer = await OfferService.approveOffer(params.id, auth.session.userId);
    return apiSuccess({
      offer,
      message: `Job offer ${offer.offerNumber} approved successfully.`,
    });
  } catch (error: any) {
    console.error('Error approving job offer:', error);
    return apiBadRequest(error.message || 'Failed to approve job offer');
  }
}
