import { Test, TestingModule } from '@nestjs/testing';
import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { prepareTestDatabase } from './test-db.helper.js';

export interface TestAppContext {
  app: INestApplication<App>;
  dataSource: DataSource;
  jwtService: JwtService;
  configService: ConfigService;
}

export async function createTestApp(): Promise<TestAppContext> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();

  try {
    // Mirror global pipes & interceptors configured in src/main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

    await app.init();

    const dataSource = moduleFixture.get(DataSource);
    const jwtService = moduleFixture.get(JwtService);
    const configService = moduleFixture.get(ConfigService);

    await prepareTestDatabase(dataSource);

    return { app, dataSource, jwtService, configService };
  } catch (err) {
    await app.close().catch(() => {});
    throw err;
  }
}
