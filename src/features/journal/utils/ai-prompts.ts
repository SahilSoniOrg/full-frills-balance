export const createTypeClassificationPrompt = (transcript: string) =>
  `
Task: Classify transaction type.
Transcript: "${transcript}"

RULES:
- If "spent", "paid", "bought", or "for [item]" -> "expense"
- If "received", "salary", "dividend", or "refund" -> "income"
- If "transfer", "to bank", or "to savings" -> "transfer"

EXAMPLES:
"paid 100 for coffee" -> {"type": "expense"}
"salary received" -> {"type": "income"}

Output Format: {"type": "TYPE_HERE"}
`.trim();

export const createEntityResolutionPrompt = (
  transcript: string,
  type: string,
  role: 'SOURCE_ACCOUNT' | 'TARGET_CATEGORY',
  entities: string[],
) => {
  const entityList = entities.map(e => `- "${e}"`).join('\n');

  return `
Task: Identify the ${role}.
Input: "${transcript}"
Type: ${type}

LIST OF VALID NAMES:
${entityList}

RULE: Pick a name from the LIST above.
Output Format: {"name": "EXACT_NAME_FROM_LIST"}
`.trim();
};
