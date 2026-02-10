import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectActivity1762000000000 implements MigrationInterface {
  name = 'CreateProjectActivity1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`project_activity\` (
        \`id\` varchar(36) NOT NULL,
        \`projectId\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`actionType\` varchar(100) NOT NULL,
        \`description\` text NULL,
        \`metadata\` text NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_project_activity_projectId\` ON \`project_activity\` (\`projectId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_project_activity_userId\` ON \`project_activity\` (\`userId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_project_activity_created_at\` ON \`project_activity\` (\`created_at\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_project_activity_created_at\` ON \`project_activity\``);
    await queryRunner.query(`DROP INDEX \`IDX_project_activity_userId\` ON \`project_activity\``);
    await queryRunner.query(`DROP INDEX \`IDX_project_activity_projectId\` ON \`project_activity\``);
    await queryRunner.query(`DROP TABLE \`project_activity\``);
  }
}

