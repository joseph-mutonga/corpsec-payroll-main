import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';

export function apiSuccess<T>(data: T, meta?: ApiResponse['meta'] | string, status = 200) {
  const metaObj = typeof meta === 'string' ? { message: meta } : meta;
  const payload: ApiResponse<T> = {
    success: true,
    data,
    meta: metaObj,
  };
  return NextResponse.json(payload, { status });
}

export function apiError(
  message: string,
  codeOrStatus: string | number = 'INTERNAL_ERROR',
  statusOrDetails: number | any = 500,
  details?: any
) {
  let code = 'INTERNAL_ERROR';
  let status = 500;
  let finalDetails = details;

  if (typeof codeOrStatus === 'number') {
    status = codeOrStatus;
    code =
      status === 404
        ? 'NOT_FOUND'
        : status === 400
        ? 'BAD_REQUEST'
        : status === 409
        ? 'CONFLICT'
        : status === 422
        ? 'VALIDATION_ERROR'
        : 'ERROR';
    if (typeof statusOrDetails !== 'number') {
      finalDetails = statusOrDetails;
    }
  } else {
    code = codeOrStatus;
    if (typeof statusOrDetails === 'number') {
      status = statusOrDetails;
    }
  }

  const payload: ApiResponse = {
    success: false,
    error: {
      message,
      code,
      details: finalDetails,
    },
  };
  return NextResponse.json(payload, { status });
}

export function apiUnauthorized(message = 'Unauthorized access. Please log in.') {
  return apiError(message, 'UNAUTHORIZED', 401);
}

export function apiForbidden(message = 'Access denied. You do not have permission to perform this action.') {
  return apiError(message, 'FORBIDDEN', 403);
}

export function apiNotFound(message = 'Requested resource was not found.') {
  return apiError(message, 'NOT_FOUND', 404);
}

export function apiBadRequest(message = 'Invalid request parameters.', details?: any) {
  return apiError(message, 'BAD_REQUEST', 400, details);
}

export function apiValidationError(details: any, message = 'Validation failed. Please check your inputs.') {
  return apiError(message, 'VALIDATION_ERROR', 422, details);
}
