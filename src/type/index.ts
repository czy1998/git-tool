import type { Separator } from '@inquirer/prompts';
export type checkboxItem = {
  name: string;
  value: string;
  description?: string;
  disabled?: boolean;
};

export type handleCheckBoxConfig = {
  message: string;
  choices: (checkboxItem | Separator)[];
  emptyMessage: string;
};
