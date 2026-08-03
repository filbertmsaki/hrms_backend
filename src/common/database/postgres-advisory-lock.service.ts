import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class PostgresAdvisoryLockService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async runWithLock<T>(
    key: string,
    callback: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const result = await queryRunner.query(
        `
        SELECT pg_try_advisory_lock(hashtext($1)) AS acquired
        `,
        [key],
      );

      const acquired = result[0]?.acquired === true;
      if (!acquired) {
        return { acquired: false };
      }

      return {
        acquired: true,
        result: await callback(),
      };
    } finally {
      try {
        await queryRunner.query(
          `
          SELECT pg_advisory_unlock(hashtext($1))
          `,
          [key],
        );
      } finally {
        await queryRunner.release();
      }
    }
  }
}
