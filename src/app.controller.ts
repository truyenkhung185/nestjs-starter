import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AppService } from './app.service.js';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Hello World API' })
  @ApiResponse({ status: 200, description: 'Default greeting' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('hello-i18n')
  @ApiOperation({ summary: 'Internationalized Hello API' })
  @ApiResponse({ status: 200, description: 'Localized message' })
  async getHelloI18n(@I18n() i18n: I18nContext): Promise<{ message: string; welcome: string; lang: string }> {
    const message = await i18n.t('common.HELLO');
    const welcome = await i18n.t('common.WELCOME');
    return {
      message,
      welcome,
      lang: i18n.lang,
    };
  }
}
