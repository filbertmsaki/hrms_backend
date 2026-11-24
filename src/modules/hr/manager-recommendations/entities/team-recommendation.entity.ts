import { Column, Entity, Index } from 'typeorm';
import { RecommendationRecord } from './manager-recommendation.entity';

@Entity('team_recommendations')
@Index('IDX_team_recommendations_queue', ['companyId', 'status', 'employeeId'])
@Index('IDX_team_recommendations_author', [
  'companyId',
  'submittedByCompanyUserId',
])
export class TeamRecommendation extends RecommendationRecord {
  @Column({ name: 'revises_id', type: 'int', nullable: true, unique: true })
  revisesId: number | null;
}
