import { database } from '@/src/data/database/Database'
import { Q } from '@nozbe/watermelondb'

export class DatabaseRepository {
  async resetDatabase(): Promise<void> {
    await database.write(async () => {
      await database.unsafeResetDatabase()
    })
  }

  async cleanupDeletedRecords(tables: string[]): Promise<number> {
    let totalDeleted = 0
    await database.write(async () => {
      for (const table of tables) {
        const deletedRecords = await database.collections
          .get(table)
          .query(Q.where('deleted_at', Q.notEq(null)))
          .fetch()
        totalDeleted += deletedRecords.length
        for (const record of deletedRecords) {
          await record.destroyPermanently()
        }
      }
    })
    return totalDeleted
  }
}

export const databaseRepository = new DatabaseRepository()
