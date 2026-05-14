import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to the HRMS API. Use /api for endpoints, /api-swagger-documentation for Swagger UI, and /api-documentation for Scalar docs.';
  }
}
