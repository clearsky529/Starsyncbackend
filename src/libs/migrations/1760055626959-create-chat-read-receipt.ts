import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatReadReceipt1760055626959 implements MigrationInterface {
  name = 'CreateChatReadReceipt1760055626959';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`chat_read_receipts\` (\`id\` varchar(36) NOT NULL, \`message_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`read_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_chat_read_receipts_message_user\` ON \`chat_read_receipts\` (\`message_id\`, \`user_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_chat_read_receipts_user_id\` ON \`chat_read_receipts\` (\`user_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_chat_read_receipts_message_id\` ON \`chat_read_receipts\` (\`message_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_chat_read_receipts_read_at\` ON \`chat_read_receipts\` (\`read_at\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_chat_read_receipts_read_at\` ON \`chat_read_receipts\``);
    await queryRunner.query(`DROP INDEX \`IDX_chat_read_receipts_message_id\` ON \`chat_read_receipts\``);
    await queryRunner.query(`DROP INDEX \`IDX_chat_read_receipts_user_id\` ON \`chat_read_receipts\``);
    await queryRunner.query(`DROP INDEX \`IDX_chat_read_receipts_message_user\` ON \`chat_read_receipts\``);
    await queryRunner.query(`DROP TABLE \`chat_read_receipts\``);
  }
}

