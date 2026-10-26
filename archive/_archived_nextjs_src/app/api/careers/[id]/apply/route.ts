import { NextRequest } from 'next/server';
import { CandidateService } from '@/lib/recruitment/CandidateService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const {
      fullName,
      email,
      phone,
      location,
      currentOccupation,
      experienceYears,
      highestQualification,
      skills,
      relevantExperience,
      coverLetter,
      resumeUrl,
      resumeFilename,
      source,
    } = body;

    if (!fullName || !email || !phone) {
      return apiBadRequest('Full name, email address, and phone number are required.');
    }

    const candidate = await CandidateService.submitApplication({
      vacancyId: params.id,
      fullName,
      email,
      phone,
      location,
      currentOccupation,
      experienceYears: experienceYears ? parseFloat(experienceYears) : undefined,
      highestQualification,
      skills,
      relevantExperience,
      coverLetter,
      resumeUrl,
      resumeFilename,
      source,
    });

    return apiSuccess(
      {
        candidate: {
          id: candidate.id,
          applicationNumber: candidate.applicationNumber,
          fullName: candidate.fullName,
          email: candidate.email,
          createdAt: candidate.createdAt,
        },
        message: 'Your application has been received successfully.',
      },
      undefined,
      201
    );
  } catch (error: any) {
    console.error('Error submitting candidate application:', error);
    return apiBadRequest(error.message || 'Failed to submit application');
  }
}
