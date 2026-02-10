import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatMessage1760055626958 implements MigrationInterface {
  name = 'CreateChatMessage1760055626958';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`chat_messages\` (\`id\` varchar(36) NOT NULL, \`room\` varchar(255) NOT NULL, \`sender_id\` varchar(36) NOT NULL, \`message\` text NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_chat_messages_room\` ON \`chat_messages\` (\`room\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_chat_messages_sender_id\` ON \`chat_messages\` (\`sender_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_chat_messages_created_at\` ON \`chat_messages\` (\`created_at\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_chat_messages_created_at\` ON \`chat_messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_chat_messages_sender_id\` ON \`chat_messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_chat_messages_room\` ON \`chat_messages\``);
    await queryRunner.query(`DROP TABLE \`chat_messages\``);
  }
}
