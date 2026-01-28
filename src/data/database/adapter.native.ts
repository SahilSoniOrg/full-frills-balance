import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { Platform } from 'react-native'

import { migrations } from '@/src/data/database/migrations'
import { schema } from '@/src/data/database/schema'
import { logger } from '@/src/utils/logger'

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: Platform.OS === 'ios', // iOS only
  onSetUpError: (error) => {
    logger.error('Database setup error', error)
  },
})

export default adapter
