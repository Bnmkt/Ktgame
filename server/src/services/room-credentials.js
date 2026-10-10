const publicNameChecks = new WeakMap();
async function nameMatchesPassword(user, name, comparePassword) {
  let cache = publicNameChecks.get(user);
  if (!cache || cache.hash !== user.passwordHash || cache.compare !== comparePassword) {
    cache = { hash: user.passwordHash, compare: comparePassword, names: new Map() };
    publicNameChecks.set(user, cache);
  }
  if (cache.names.has(name)) return false;
  const hash = user.passwordHash;
  const matches = await comparePassword(name, hash);
  // Retain only validated public names, never successful account passwords.
  if (!matches && user.passwordHash === hash) {
    if (cache.names.size >= 8) cache.names.delete(cache.names.keys().next().value);
    cache.names.set(name, true);
  }
  return matches;
}

export async function roomCredentialsError({ name, password, user }, comparePassword) {
  if (name && (name.length < 3 || name.length > 80)) return "Le nom de table doit contenir entre 3 et 80 caractères.";
  if (password && (password.length < 4 || password.length > 128)) return "Le code d’accès doit contenir entre 4 et 128 caractères.";
  if (name && (/[^\s@]+@[^\s@]+\.[^\s@]+/u.test(name) || (user.email && name.toLowerCase().includes(user.email.toLowerCase())))) return "Le nom public d’une table ne peut pas contenir une adresse email.";
  if (name && ((password && name === password) || (user.passwordHash && await nameMatchesPassword(user, name, comparePassword)))) return "Le nom public d’une table ne peut pas être un mot de passe.";
  if (password && user.passwordHash && await comparePassword(password, user.passwordHash)) return "Choisis un code d’accès différent du mot de passe de ton compte.";
  return "";
}
