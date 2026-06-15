import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the unique constraint on agent_api_keys.agent_id so that multiple
 * API keys can coexist for the same agent. The OneToOne→ManyToOne entity
 * change was made earlier but the DB constraint was not removed.
 */
export class DropAgentApiKeyAgentIdUnique1790600000000 implements MigrationInterface {
  name = 'DropAgentApiKeyAgentIdUnique1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Find the auto-generated unique constraint name for agent_id
    const rows: Array<{ conname: string }> = await queryRunner.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'agent_api_keys'::regclass
         AND contype = 'u'
         AND array_length(conkey, 1) = 1
         AND conkey @> ARRAY[
           (SELECT attnum FROM pg_attribute
            WHERE attrelid = 'agent_api_keys'::regclass AND attname = 'agent_id')
         ]::smallint[]`,
    );
    if (rows.length > 0) {
      await queryRunner.query(`ALTER TABLE "agent_api_keys" DROP CONSTRAINT "${rows[0].conname}"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_api_keys" ADD CONSTRAINT "REL_8c341005a4d7642cd4b0f53e13" UNIQUE ("agent_id")`,
    );
  }
}
