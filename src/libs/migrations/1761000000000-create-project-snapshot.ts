import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectSnapshot1761000000000 implements MigrationInterface {
  name = 'CreateProjectSnapshot1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`project_snapshot\` (
        \`id\` varchar(36) NOT NULL,
        \`projectId\` varchar(36) NOT NULL,
        \`snapshotData\` text NOT NULL,
        \`description\` varchar(500) NULL,
        \`createdBy\` varchar(36) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_project_snapshot_projectId\` ON \`project_snapshot\` (\`projectId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_project_snapshot_createdBy\` ON \`project_snapshot\` (\`createdBy\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_project_snapshot_created_at\` ON \`project_snapshot\` (\`created_at\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_snapshot\` ADD CONSTRAINT \`FK_project_snapshot_project\` FOREIGN KEY (\`projectId\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`project_snapshot\` DROP FOREIGN KEY \`FK_project_snapshot_project\``,
    );
    await queryRunner.query(`DROP INDEX \`IDX_project_snapshot_created_at\` ON \`project_snapshot\``);
    await queryRunner.query(`DROP INDEX \`IDX_project_snapshot_createdBy\` ON \`project_snapshot\``);
    await queryRunner.query(`DROP INDEX \`IDX_project_snapshot_projectId\` ON \`project_snapshot\``);
    await queryRunner.query(`DROP TABLE \`project_snapshot\``);
  }
}

