import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ManagerSelfServiceService } from '../manager-self-service/manager-self-service.service';
import { DashboardQueryDto } from './dtos/dashboard-query.dto';

@Injectable()
export class ManagerDashboardService {
  constructor(
    private readonly managerSelfServiceService: ManagerSelfServiceService,
  ) {}

  async getDashboard(actor: AuthenticatedUser, query: DashboardQueryDto) {
    return this.managerSelfServiceService.getDashboard(actor, {
      date_from: query.date_from,
      date_to: query.date_to,
    });
  }
}
