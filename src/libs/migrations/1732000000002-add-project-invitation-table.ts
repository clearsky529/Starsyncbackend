import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectInvitationTable1732000000002 implements MigrationInterface {
  name = 'AddProjectInvitationTable1732000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`project_invitation\` (\`id\` varchar(36) NOT NULL, \`projectId\` varchar(255) NOT NULL, \`inviterId\` varchar(255) NOT NULL, \`inviteeId\` varchar(255) NOT NULL, \`role\` enum('owner', 'editor', 'viewer', 'commenter') NOT NULL DEFAULT 'editor', \`status\` enum('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending', \`expires_at\` datetime(6) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_invitation\` ADD CONSTRAINT \`FK_project_invitation_project\` FOREIGN KEY (\`projectId\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_project_invitation_invitee_status\` ON \`project_invitation\` (\`inviteeId\`, \`status\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_project_invitation_project\` ON \`project_invitation\` (\`projectId\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_project_invitation_project\` ON \`project_invitation\``);
    await queryRunner.query(`DROP INDEX \`IDX_project_invitation_invitee_status\` ON \`project_invitation\``);
    await queryRunner.query(
      `ALTER TABLE \`project_invitation\` DROP FOREIGN KEY \`FK_project_invitation_project\``,
    );
    await queryRunner.query(`DROP TABLE \`project_invitation\``);
  }
}

