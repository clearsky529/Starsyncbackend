import { MigrationInterface, QueryRunner } from 'typeorm';

export class InsertUsers1731420409980 implements MigrationInterface {
  name = 'InsertUsers1731420409980';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO \`user\` (\`id\`, \`username\`, \`password\`, \`email\`, \`first_name\`, \`last_name\`) values (uuid(), 'StarSync', '$P$BaRpF2laNq4qBC/Z9NosC48ubal7701', 'admin@starsync.org', 'Alex', 'M')`,
    );
    await queryRunner.query(
      `INSERT INTO \`user\` (\`id\`, \`username\`, \`password\`, \`email\`, \`first_name\`, \`last_name\`) values (uuid(), 'testuser', '$P$BaRpF2laNq4qBC/Z9NosC48ubal7701', 'user1@starsync.org', 'John', 'Doe')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`TRUNCATE \`user\``);
  }
}
