// src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cookieParser());
  app.enableCors({
    origin: (origin, callback) => {
      // Eğer origin yoksa (örneğin mobil uygulama veya doğrudan istek) veya listedeyse izin ver
      if (!origin || allowedOrigins.includes(origin) || origin.includes('192.168.') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger Ayarı
  const config = new DocumentBuilder()
    .setTitle('Nexus SaaS API')
    .setDescription('Çok kiracılı telefon dükkanı yönetim sistemi')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'JWT token girin',
        in: 'header',
      },
      'JWT-auth', // Bu isim güvenlik şeması için referans olacak
    )
    .addTag('auth', 'Kimlik doğrulama işlemleri')
    .addTag('companies', 'Şirket yönetimi')
    .addTag('products', 'Stok ve ürün yönetimi')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 5000, '0.0.0.0');
  const port = process.env.PORT ?? 5000;
  console.log(`Uygulama: http://localhost:${port}`);
  console.log(`Swagger: http://localhost:${port}/api-docs`);
  console.log(`Network access: http://192.168.1.111:${port}`);
}
bootstrap();
