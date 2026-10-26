import { NextRequest } from 'next/server';
import { OfferService } from '@/lib/recruitment/OfferService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const body = await req.json();
    const { decision, declineReason } = body;

    if (!decision || (decision !== 'ACCEPT' && decision !== 'DECLINE')) {
      return apiBadRequest('Valid decision (ACCEPT or DECLINE) is required.');
    }

    const updated = await OfferService.respondToOffer(
      params.token,
      decision,
      declineReason
    );

    return apiSuccess({
      message: `Job offer successfully ${decision === 'ACCEPT' ? 'accepted' : 'declined'}.`,
      offer: {
        offerNumber: updated.offerNumber,
        status: updated.status,
        candidateResponse: updated.candidateResponse,
        respondedAt: updated.respondedAt,
      },
    });
  } catch (error: any) {
    console.error('Error responding to job offer:', error);
    return apiBadRequest(error.message || 'Failed to process offer response');
  }
}
