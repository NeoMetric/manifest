import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds multi-key-per-agent support:
 * 1. Adds `api_key_id` column to `agent_messages` so each message can
 *    record which agent API key (OTLP ingest key) was used.
 * 2. Creates an index on `agent_messages(api_key_id)` for efficient
 *    filtering in the Messages log and Overview.
 * 3. Backfills `api_key_id` for existing messages from their agent's
 *    active key.
 *
 * The agent_api_keys→agents relationship changes from OneToOne to
 * ManyToOne at the TypeORM entity level only — no DB constraint changes
 * are needed because the foreign key and indexes already support
 * multiple rows per agent_id.
 */
export class AddMultiKeyPerAgent1790500000000 implements MigrationInterface {
  name = 'AddMultiKeyPerAgent1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add api_key_id column to agent_messages
    await queryRunner.query(
      `ALTER TABLE "agent_messages" ADD COLUMN IF NOT EXISTS "api_key_id" varchar`,
    );

    // 2. Create index for efficient filtering
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_messages_api_key_id" ON "agent_messages" ("api_key_id")`,
    );

    // 3. Backfill api_key_id for existing messages
    await queryRunner.query(
      `UPDATE agent_messages m
       SET api_key_id = sub.key_id
       FROM (
         SELECT DISTINCT ON (k.agent_id) k.id AS key_id, k.agent_id
         FROM agent_api_keys k
         WHERE k.is_active = true
         ORDER BY k.agent_id, k.created_at ASC
       ) sub
       WHERE m.agent_id = sub.agent_id
         AND m.api_key_id IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_messages_api_key_id"`);
    await queryRunner.query(
      `ALTER TABLE "agent_messages" DROP COLUMN IF EXISTS "api_key_id"`,
    );
  }
}
