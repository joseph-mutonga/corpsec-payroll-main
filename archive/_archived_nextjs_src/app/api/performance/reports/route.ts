import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PerformanceAnalyticsService } from '@/lib/performance/PerformanceAnalyticsService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['performance.reports.view', 'reports.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'PERFORMANCE_SUMMARY';
    const cycleId = searchParams.get('cycleId') || undefined;
    const format = searchParams.get('format'); // csv or json

    const data = await PerformanceAnalyticsService.getReportData(type, cycleId);

    if (format === 'csv') {
      if (data.length === 0) {
        return new NextResponse('No data found for this report filter.', {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${type.toLowerCase()}-report.csv"`,
          },
        });
      }

      const headers = Object.keys(data[0]);
      const csvRows = [
        headers.join(','),
        ...data.map((row: any) =>
          headers
            .map((h) => {
              const val = row[h] !== null && row[h] !== undefined ? String(row[h]) : '';
              return `"${val.replace(/"/g, '""')}"`;
            })
            .join(',')
        ),
      ];

      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${type.toLowerCase()}-report.csv"`,
        },
      });
    }

    return apiSuccess({ reportType: type, count: data.length, records: data });
  } catch (error: any) {
    console.error('Error generating performance report:', error);
    return apiError(error.message || 'Failed to generate performance report', 500);
  }
}
