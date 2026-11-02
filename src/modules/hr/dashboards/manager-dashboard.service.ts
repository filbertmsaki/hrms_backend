import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ManagerSelfServiceService } from '../manager-self-service/manager-self-service.service';
import { ManagerDashboardQueryDto } from '../manager-self-service/dtos/manager-dashboard-query.dto';

@Injectable()
export class ManagerDashboardService {
  constructor(
    private readonly managerSelfServiceService: ManagerSelfServiceService,
  ) {}

  async getDashboard(
    actor: AuthenticatedUser,
    query: ManagerDashboardQueryDto,
  ) {
    return this.managerSelfServiceService.getDashboard(actor, {
      date_from: query.date_from,
      date_to: query.date_to,
    });
  }
}
