import { SmsMessage } from '@/modules/expo-sms-inbox';

let injectedMessages: SmsMessage[] = [];

export function setE2eSmsInboxMessages(messages: SmsMessage[]): void {
  injectedMessages = messages;
}

export function getE2eSmsInboxMessages(): SmsMessage[] {
  return injectedMessages;
}

export function clearE2eSmsInboxMessages(): void {
  injectedMessages = [];
}
