import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleToCollaborator1732000000001 implements MigrationInterface {
  name = 'AddRoleToCollaborator1732000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`collaborator\` ADD \`role\` enum('owner', 'editor', 'viewer', 'commenter') NOT NULL DEFAULT 'editor'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`collaborator\` DROP COLUMN \`role\``);
  }
}

