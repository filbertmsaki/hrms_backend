import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to the HRMS API. Use /api for endpoints and /api-documentation for Swagger docs.';
  }
}
