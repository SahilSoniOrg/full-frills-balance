import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, relation } from '@nozbe/watermelondb/decorators';
import Account from './Account';

export default class SmsAutoPostRule extends Model {
    static table = 'sms_auto_post_rules';

    @field('sender_match') senderMatch!: string;
    @field('body_match') bodyMatch?: string;
    @field('source_account_id') sourceAccountId!: string;
    @field('category_account_id') categoryAccountId!: string;
    @field('is_active') isActive!: boolean;

    @readonly @date('created_at') createdAt!: Date;
    @readonly @date('updated_at') updatedAt!: Date;

    @relation('accounts', 'source_account_id') sourceAccount!: Account;
    @relation('accounts', 'category_account_id') categoryAccount!: Account;
}
