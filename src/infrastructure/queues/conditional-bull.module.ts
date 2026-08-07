import { BullModule, BullRegistrar, getQueueToken } from '@nestjs/bullmq';
import {
  DynamicModule,
  Global,
  Injectable,
  Module,
  OnModuleInit,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';

@Injectable()
class DisabledQueue implements OnApplicationShutdown {
  readonly opts: Record<string, never> = {};

  constructor(private readonly name: string) {}

  add(): Promise<never> {
    return Promise.reject(
      new ServiceUnavailableException(
        `Queue "${this.name}" is disabled because USE_REDIS=false.`,
      ),
    );
  }

  getJob(): Promise<null> {
    return Promise.resolve(null);
  }

  async close(): Promise<void> {
    // no-op
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}

function isRedisEnabled(configService: ConfigService): boolean {
  return configService.get<boolean>('USE_REDIS', false);
}

function isRedisEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.USE_REDIS;

  if (typeof value !== 'string') {
    return false;
  }

  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function createQueueInstance<T = unknown>(
  name: string,
  configService: ConfigService,
): Queue<T> | DisabledQueue {
  if (!isRedisEnabled(configService)) {
    return new DisabledQueue(name);
  }

  const redisUrl =
    configService.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
  const queue = new Queue<T>(name, {
    connection: { url: redisUrl },
  });

  const closableQueue = queue as Queue<T> &
    Pick<OnApplicationShutdown, 'onApplicationShutdown'>;
  closableQueue.onApplicationShutdown = async () => {
    await closableQueue.close();
  };

  return closableQueue;
}

@Injectable()
class ConditionalBullRegistrar implements OnModuleInit {
  constructor(
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    if (!isRedisEnabled(this.configService)) {
      return;
    }

    const bullRegistrar = this.moduleRef.get(BullRegistrar, {
      strict: false,
    });
    if (!bullRegistrar) {
      return;
    }

    bullRegistrar.register();
  }
}

@Global()
@Module({
  providers: [ConditionalBullRegistrar],
})
export class ConditionalBullModule {
  static forRoot(): DynamicModule {
    return {
      module: ConditionalBullModule,
      imports: [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          extraOptions: {
            manualRegistration: true,
          },
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            connection: {
              url:
                configService.get<string>('REDIS_URL') ??
                'redis://127.0.0.1:6379',
            },
          }),
        }),
      ],
      providers: [ConditionalBullRegistrar],
    };
  }

  static registerQueue(name: string): DynamicModule {
    const redisEnabled = isRedisEnabledFromEnv();

    return {
      module: ConditionalBullModule,
      imports: [
        ConfigModule,
        ...(redisEnabled ? [BullModule.registerQueue({ name })] : []),
      ],
      providers: redisEnabled
        ? []
        : [
            {
              provide: getQueueToken(name),
              inject: [ConfigService],
              useFactory: (configService: ConfigService) =>
                createQueueInstance(name, configService),
            },
          ],
      exports: [getQueueToken(name)],
    };
  }
}
