import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiResponseOptions,
} from '@nestjs/swagger';

function buildErrorExample(
  statusCode: number,
  error: string,
  message: string | string[],
): Record<string, any> {
  return { statusCode, error, message };
}

export function ApiOperationSummary(
  summary: string,
  description?: string,
): MethodDecorator {
  return ApiOperation({ summary, description });
}

export function ApiAuthRequired(): MethodDecorator {
  return applyDecorators(
    ApiBearerAuth(),
    ApiResponse({
      status: 401,
      description: 'Unauthorized. Provide a valid Bearer access token.',
      schema: {
        example: buildErrorExample(401, 'Unauthorized', 'Unauthorized'),
      },
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden. Your role or permissions do not allow this action.',
      schema: {
        example: buildErrorExample(403, 'Forbidden', 'Forbidden resource'),
      },
    }),
  );
}

export function ApiValidationErrorResponse(): MethodDecorator {
  return ApiResponse({
    status: 400,
    description: 'Validation error for the submitted payload.',
    schema: {
      example: buildErrorExample(400, 'Bad Request', [
        'email must be an email',
        'password must be longer than or equal to 8 characters',
      ]),
    },
  });
}

export function ApiNotFoundResponse(resource = 'Resource'): MethodDecorator {
  return ApiResponse({
    status: 404,
    description: `${resource} was not found.`,
    schema: {
      example: buildErrorExample(404, 'Not Found', `${resource} not found`),
    },
  });
}

export function ApiConflictResponse(resource = 'Resource'): MethodDecorator {
  return ApiResponse({
    status: 409,
    description: `Conflict while processing ${resource}.`,
    schema: {
      example: buildErrorExample(
        409,
        'Conflict',
        `${resource} already exists`,
      ),
    },
  });
}

export function ApiSuccessResponse(
  status: number,
  description: string,
  options?: Omit<ApiResponseOptions, 'status' | 'description'>,
): MethodDecorator {
  return ApiResponse({
    status,
    description,
    ...options,
  });
}
