import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { OfferService } from '@/lib/recruitment/OfferService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const vacancyId = searchParams.get('vacancyId') || undefined;
    const candidateId = searchParams.get('candidateId') || undefined;
    const status = searchParams.get('status') || undefined;

    const offers = await OfferService.getOffers({
      vacancyId,
      candidateId,
      status,
    });

    return apiSuccess({ offers, count: offers.length });
  } catch (error: any) {
    console.error('Error fetching job offers:', error);
    return apiError(error.message || 'Failed to fetch job offers');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.offers.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const {
      candidateId,
      vacancyId,
      positionId,
      departmentId,
      stationId,
      employmentType,
      proposedSalary,
      allowancesJson,
      startDate,
      offerExpiryDate,
      offerLetterContent,
    } = body;

    if (!candidateId || !vacancyId || !proposedSalary || !startDate || !offerExpiryDate) {
      return apiBadRequest('Candidate, vacancy, proposed salary, start date, and expiry date are required.');
    }

    const offer = await OfferService.createOffer(
      {
        candidateId,
        vacancyId,
        positionId,
        departmentId,
        stationId,
        employmentType,
        proposedSalary: parseFloat(proposedSalary),
        allowancesJson: typeof allowancesJson === 'object' ? JSON.stringify(allowancesJson) : allowancesJson,
        startDate,
        offerExpiryDate,
        offerLetterContent,
      },
      auth.session.userId
    );

    return apiSuccess({ offer }, undefined, 201);
  } catch (error: any) {
    console.error('Error creating job offer:', error);
    return apiBadRequest(error.message || 'Failed to create job offer');
  }
}
