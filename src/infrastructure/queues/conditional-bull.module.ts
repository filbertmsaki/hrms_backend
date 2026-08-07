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
class DisabledQueue<T = unknown> implements OnApplicationShutdown {
  readonly opts: Record<string, never> = {};

  constructor(private readonly name: string) {}

  async add(): Promise<never> {
    throw new ServiceUnavailableException(
      `Queue "${this.name}" is disabled because USE_REDIS=false.`,
    );
  }

  async getJob(): Promise<null> {
    return null;
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

function createQueueInstance<T = unknown>(
  name: string,
  configService: ConfigService,
): Queue<T> | DisabledQueue<T> {
  if (!isRedisEnabled(configService)) {
    return new DisabledQueue<T>(name);
  }

  const redisUrl =
    configService.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
  const queue = new Queue<T>(name, {
    connection: { url: redisUrl },
  });

  (
    queue as Queue<T> & Pick<OnApplicationShutdown, 'onApplicationShutdown'>
  ).onApplicationShutdown = async function () {
    await this.close();
  };

  return queue;
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
    return {
      module: ConditionalBullModule,
      imports: [ConfigModule],
      providers: [
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
