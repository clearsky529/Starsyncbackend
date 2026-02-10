import { DataSource } from 'typeorm';
import { ConfigModule } from '@nestjs/config';
import database from '@app/config/database.config';

const configs = [database];

ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  load: configs,
  envFilePath: '.env',
});

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
