import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFriendRequestTable1732000000000 implements MigrationInterface {
  name = 'AddFriendRequestTable1732000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`friend_request\` (\`id\` varchar(36) NOT NULL, \`senderId\` varchar(255) NOT NULL, \`receiverId\` varchar(255) NOT NULL, \`status\` enum('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_friend_request_sender_receiver\` ON \`friend_request\` (\`senderId\`, \`receiverId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_friend_request_receiver_status\` ON \`friend_request\` (\`receiverId\`, \`status\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_friend_request_receiver_status\` ON \`friend_request\``);
    await queryRunner.query(`DROP INDEX \`IDX_friend_request_sender_receiver\` ON \`friend_request\``);
    await queryRunner.query(`DROP TABLE \`friend_request\``);
  }
}

