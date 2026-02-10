import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPositionToPatternComments1734000000000
  implements MigrationInterface
{
  name = 'AddPositionToPatternComments1734000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`pattern_comments\` ADD \`track\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`pattern_comments\` ADD \`startBar\` float NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`pattern_comments\` DROP COLUMN \`startBar\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`pattern_comments\` DROP COLUMN \`track\``,
    );
  }
}

