export async function roomCredentialsError({ name, password, user }, comparePassword) {
  if (name && (name.length < 3 || name.length > 80)) return "Le nom de table doit contenir entre 3 et 80 caractères.";
  if (password && (password.length < 4 || password.length > 128)) return "Le code d’accès doit contenir entre 4 et 128 caractères.";
  if (name && (/[^\s@]+@[^\s@]+\.[^\s@]+/u.test(name) || (user.email && name.toLowerCase().includes(user.email.toLowerCase())))) return "Le nom public d’une table ne peut pas contenir une adresse email.";
  if (name && ((password && name === password) || (user.passwordHash && await comparePassword(name, user.passwordHash)))) return "Le nom public d’une table ne peut pas être un mot de passe.";
  if (password && user.passwordHash && await comparePassword(password, user.passwordHash)) return "Choisis un code d’accès différent du mot de passe de ton compte.";
  return "";
}
