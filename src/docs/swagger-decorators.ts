import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiResponseOptions,
  getSchemaPath,
} from '@nestjs/swagger';

// ──────────────────────────────────────────────
//  Error example builder
// ──────────────────────────────────────────────

function buildErrorExample(
  statusCode: number,
  error: string,
  message: string | string[],
): Record<string, any> {
  return { statusCode, error, message };
}

// ──────────────────────────────────────────────
//  Operation summary (replaces raw @ApiOperation)
// ──────────────────────────────────────────────

export function ApiOperationSummary(
  summary: string,
  description?: string,
  operationId?: string,
): MethodDecorator {
  const options: Record<string, any> = { summary };
  if (description) options.description = description;
  if (operationId) options.operationId = operationId;
  return ApiOperation(options);
}

// ──────────────────────────────────────────────
//  Authentication & authorization responses
// ──────────────────────────────────────────────

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

/**
 * For endpoints that don't require auth but want to document error responses.
 * e.g. Login (returns 401 for invalid creds, not missing token)
 */
export function ApiAuthErrorResponses(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: 401,
      description: 'Authentication failed (invalid credentials or expired token).',
      schema: {
        example: buildErrorExample(401, 'Unauthorized', 'Invalid email or password'),
      },
    }),
  );
}

// ──────────────────────────────────────────────
//  Common HTTP error responses
// ──────────────────────────────────────────────

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
      example: buildErrorExample(409, 'Conflict', `${resource} already exists`),
    },
  });
}

export function ApiGoneResponse(resource = 'Resource'): MethodDecorator {
  return ApiResponse({
    status: 410,
    description: `${resource} has expired or is no longer available.`,
    schema: {
      example: buildErrorExample(410, 'Gone', `${resource} expired`),
    },
  });
}

export function ApiTooManyRequestsResponse(): MethodDecorator {
  return ApiResponse({
    status: 429,
    description: 'Too many requests. Rate limit exceeded. Retry after some time.',
    schema: {
      example: buildErrorExample(
        429,
        'Too Many Requests',
        'Rate limit exceeded. Try again later.',
      ),
    },
  });
}

// ──────────────────────────────────────────────
//  Success response helpers
// ──────────────────────────────────────────────

/**
 * Generic success response with a plain description.
 */
export function ApiSuccessResponse(
  status: number,
  description: string,
  options?: Partial<ApiResponseOptions>,
): MethodDecorator {
  return ApiResponse({
    status,
    description,
    ...options,
  });
}

/**
 * Typed OK (200) response that references a DTO / entity model.
 * Usage: @ApiPaginatedResponse(MyDto)
 */
export function ApiOkResponseDto(
  dtoRef: Type<unknown>,
  description = 'Successful operation',
): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(dtoRef),
    ApiOkResponse({
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(dtoRef) },
        ],
      },
    }),
  );
}

/**
 * Paginated OK (200) response that wraps a DTO in { data, meta }.
 */
export function ApiPaginatedResponse(
  dtoRef: Type<unknown>,
  description = 'Paginated results',
): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(dtoRef),
    ApiOkResponse({
      description,
      schema: {
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(dtoRef) },
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'number', example: 100 },
              page: { type: 'number', example: 1 },
              limit: { type: 'number', example: 20 },
              totalPages: { type: 'number', example: 5 },
            },
          },
        },
      },
    }),
  );
}

/**
 * Created (201) response.
 */
export function ApiCreatedResponse(
  description = 'Resource created successfully',
): MethodDecorator {
  return ApiResponse({ status: 201, description });
}

/**
 * No Content (204) response for successful deletes.
 */
export function ApiNoContentResponse(
  description = 'Resource deleted successfully',
): MethodDecorator {
  return ApiResponse({ status: 204, description });
}

// ──────────────────────────────────────────────
//  Composite decorators for CRUD patterns
// ──────────────────────────────────────────────

/**
 * Standard decorator set for a CREATE (POST) endpoint.
 */
export function ApiCreateOperation(
  resource: string,
  summary?: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperationSummary(
      summary ?? `Create a new ${resource.toLowerCase()}`,
      `Creates a ${resource.toLowerCase()} record in the active company context.`,
    ),
    ApiAuthRequired(),
    ApiValidationErrorResponse(),
    ApiConflictResponse(resource),
    ApiSuccessResponse(201, `${resource} created successfully`),
  );
}

/**
 * Standard decorator set for a LIST / GET ALL endpoint.
 */
export function ApiListOperation(
  resource: string,
  summary?: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperationSummary(
      summary ?? `List all ${resource.toLowerCase()} records`,
      `Returns a paginated list of ${resource.toLowerCase()} records accessible in the active company.`,
    ),
    ApiAuthRequired(),
    ApiSuccessResponse(200, `${resource} list retrieved successfully`),
  );
}

/**
 * Standard decorator set for a GET ONE / FIND BY ID endpoint.
 */
export function ApiGetOneOperation(
  resource: string,
  summary?: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperationSummary(
      summary ?? `Get a ${resource.toLowerCase()} by ID`,
      `Returns the full details of a single ${resource.toLowerCase()} record by its primary key.`,
    ),
    ApiAuthRequired(),
    ApiNotFoundResponse(resource),
    ApiSuccessResponse(200, `${resource} retrieved successfully`),
  );
}

/**
 * Standard decorator set for an UPDATE (PATCH) endpoint.
 */
export function ApiUpdateOperation(
  resource: string,
  summary?: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperationSummary(
      summary ?? `Update a ${resource.toLowerCase()} record`,
      `Partially updates the fields of an existing ${resource.toLowerCase()} record.`,
    ),
    ApiAuthRequired(),
    ApiValidationErrorResponse(),
    ApiNotFoundResponse(resource),
    ApiConflictResponse(resource),
    ApiSuccessResponse(200, `${resource} updated successfully`),
  );
}

/**
 * Standard decorator set for a DELETE endpoint.
 */
export function ApiDeleteOperation(
  resource: string,
  summary?: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperationSummary(
      summary ?? `Delete a ${resource.toLowerCase()}`,
      `Permanently removes a ${resource.toLowerCase()} record from the system.`,
    ),
    ApiAuthRequired(),
    ApiNotFoundResponse(resource),
    ApiSuccessResponse(200, `${resource} deleted successfully`),
  );
}

/**
 * Standard decorator set for SUBMIT / ACTION endpoints (e.g. approve, cancel).
 */
export function ApiActionOperation(
  summary: string,
  description?: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperationSummary(summary, description),
    ApiAuthRequired(),
    ApiValidationErrorResponse(),
    ApiNotFoundResponse('Resource'),
    ApiSuccessResponse(200, 'Action completed successfully'),
  );
}