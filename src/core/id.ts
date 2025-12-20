export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  const rnd = () => Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${rnd()}-${rnd()}`;
}
