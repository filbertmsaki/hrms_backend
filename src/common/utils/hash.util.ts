import * as bcrypt from 'bcrypt';

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10);
};

export const comparePasswords = async (
  password: string,
  hash: string | null | undefined,
): Promise<boolean> => {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
};
