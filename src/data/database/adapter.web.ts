import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'

import { migrations } from '@/src/data/database/migrations'
import { schema } from '@/src/data/database/schema'

/**
 * Web/Test Adapter (LokiJS)
 * 
 * This file is used for Web builds and Jest/Node tests.
 * For Native (iOS/Android) builds, Metro will prioritize adapter.native.ts.
 */
const adapter = new LokiJSAdapter({
  schema,
  migrations,
  dbName: 'full-frills-balance',
  useWebWorker: false,
  useIncrementalIndexedDB: typeof process !== 'undefined' && process.env.NODE_ENV !== 'test',
})

export default adapter
