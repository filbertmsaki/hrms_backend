import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmployeeSelfServiceService } from '../self-service/employee-self-service.service';

@Injectable()
export class EmployeeDashboardService {
  constructor(
    private readonly employeeSelfServiceService: EmployeeSelfServiceService,
  ) {}

  async getDashboard(actor: AuthenticatedUser) {
    return this.employeeSelfServiceService.getDashboard(actor);
  }
}
