export const snakeToCamel = (str: string) => str.replace(/(_\w)/g, match => match[1].toUpperCase());
