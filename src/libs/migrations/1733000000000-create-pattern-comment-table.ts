import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePatternCommentTable1733000000000
  implements MigrationInterface
{
  name = 'CreatePatternCommentTable1733000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`pattern_comments\` (\`id\` varchar(36) NOT NULL, \`projectId\` varchar(255) NOT NULL, \`patternName\` varchar(255) NOT NULL, \`userId\` varchar(255) NOT NULL, \`commentText\` text NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`pattern_comments\` ADD CONSTRAINT \`FK_pattern_comments_project\` FOREIGN KEY (\`projectId\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`pattern_comments\` ADD CONSTRAINT \`FK_pattern_comments_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_pattern_comments_project_pattern\` ON \`pattern_comments\` (\`projectId\`, \`patternName\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_pattern_comments_user\` ON \`pattern_comments\` (\`userId\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_pattern_comments_user\` ON \`pattern_comments\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_pattern_comments_project_pattern\` ON \`pattern_comments\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`pattern_comments\` DROP FOREIGN KEY \`FK_pattern_comments_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`pattern_comments\` DROP FOREIGN KEY \`FK_pattern_comments_project\``,
    );
    await queryRunner.query(`DROP TABLE \`pattern_comments\``);
  }
}

