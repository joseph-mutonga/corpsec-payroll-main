import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { CompetencyService } from '@/lib/performance/CompetencyService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || undefined;

    // Ensure default competencies are seeded if empty
    let competencies = await CompetencyService.listCompetencies({ category });
    if (competencies.length === 0) {
      await CompetencyService.seedDefaultCompetencies();
      competencies = await CompetencyService.listCompetencies({ category });
    }

    return apiSuccess({ competencies });
  } catch (error: any) {
    console.error('Error listing competencies:', error);
    return apiError(error.message || 'Failed to list competencies', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['performance.competencies.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    if (!body.code || !body.name) {
      return apiError('Competency code and name are required.', 400);
    }

    const competency = await CompetencyService.createCompetency({
      code: body.code,
      name: body.name,
      description: body.description,
      category: body.category,
      defaultWeight: body.defaultWeight !== undefined ? parseFloat(body.defaultWeight) : undefined,
      createdById: auth.user.id,
    });

    return apiSuccess({ competency }, 'Competency created successfully', 201);
  } catch (error: any) {
    console.error('Error creating competency:', error);
    return apiError(error.message || 'Failed to create competency', 400);
  }
}
