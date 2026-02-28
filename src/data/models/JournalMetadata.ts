import Journal from '@/src/data/models/Journal'
import { Model, Relation } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'

export default class JournalMetadata extends Model {
    static table = 'journal_metadata'
    static associations = {
        journals: { type: 'belongs_to', key: 'journal_id' },
    } as const

    @relation('journals', 'journal_id') journal!: Relation<Journal>

    @field('import_source') importSource!: string
    @field('original_sms_id') originalSmsId?: string
    @field('original_sms_sender') originalSmsSender?: string
    @field('original_sms_body') originalSmsBody?: string
    @field('metadata_json') metadataJson?: string

    @date('created_at') createdAt!: Date
    @date('updated_at') updatedAt!: Date
}
