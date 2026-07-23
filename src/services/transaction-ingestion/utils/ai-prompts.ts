export const createTypeClassificationPrompt = (transcript: string) =>
  `
Task: Classify transaction type.
Transcript: "${transcript}"

RULES:
- If "spent", "paid", "bought", or "for [item]" -> type is 0 (expense)
- If "received", "salary", "dividend", or "refund" -> type is 1 (income)
- If "transfer", "to bank", or "to savings" -> type is 2 (transfer)

Output Format: Output the number (0, 1, or 2) only.
`.trim();

export const createEntityResolutionPrompt = (
  transcript: string,
  type: string,
  role: 'SOURCE_ACCOUNT' | 'TARGET_CATEGORY',
  entities: string[],
) => {
  const entityList = entities.map((e, i) => `${i}: "${e}"`).join('\n');

  return `
Task: Identify the ${role}.
Input: "${transcript}"
Type: ${type}

LIST OF VALID NAMES:
${entityList}

RULE: Pick the index of the closest matching name from the LIST above. If unknown, use -1.
Output Format: Output the index number only.
`.trim();
};

export const createCompactSinglePassPrompt = (
  transcript: string,
  accounts: string[],
  categories: string[],
) => {
  const accountList = accounts.map((a, i) => `${i}: "${a}"`).join('\n');
  const categoryList = categories.map((c, i) => `${i}: "${c}"`).join('\n');

  return `
Task: Classify transaction type, source index, and target index from input transcript.

Input: "${transcript}"

ACCOUNTS:
${accountList}

CATEGORIES:
${categoryList}

RULES:
1. type index: 0 for expense, 1 for income, 2 for transfer.
2. source index: Choose closest matching index from ACCOUNTS (for type 0/2) or CATEGORIES (for type 1). If unknown, use -1.
3. target index: Choose closest matching index from CATEGORIES (for type 0) or ACCOUNTS (for type 1/2). If unknown, use -1.

Output format: [type_index, source_index, target_index]
Example: [0, 1, 2]
`.trim();
};
