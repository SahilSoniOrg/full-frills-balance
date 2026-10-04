import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountSection } from '@/src/utils/accountCategory';

export type AccountPickerSections = AccountSection[];

export type AccountPickerListItem =
  | {
      key: string;
      kind: 'section';
      section: AccountPickerSections[number];
      sectionIndex: number;
      collapsed: boolean;
    }
  | { key: string; kind: 'accounts'; accounts: AccountFields[] };

const PILLS_PER_CHUNK = 24;

/** Each recycled item retains the folder's original wrapping pill layout. */
export function buildAccountPickerRows(
  sections: AccountPickerSections,
  collapsedSections: ReadonlySet<string>,
): AccountPickerListItem[] {
  const rows: AccountPickerListItem[] = [];
  for (const [sectionIndex, section] of sections.entries()) {
    const collapsed = collapsedSections.has(section.key);
    rows.push({ key: section.key, kind: 'section', section, sectionIndex, collapsed });
    if (collapsed) continue;
    for (let index = 0; index < section.data.length; index += PILLS_PER_CHUNK) {
      rows.push({
        key: `${section.key}:${section.data[index].id}`,
        kind: 'accounts',
        accounts: section.data.slice(index, index + PILLS_PER_CHUNK),
      });
    }
  }
  return rows;
}
