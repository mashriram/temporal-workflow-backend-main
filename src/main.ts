import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for React
  app.enableCors({
    origin: 'http://localhost:5173', // Your React URL
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = app.get(ConfigService).get<number>('PORT') || 3000;
  await app.listen(port);
  console.log(`🌍 API Server ready at http://localhost:${port}`);
}
bootstrap();
