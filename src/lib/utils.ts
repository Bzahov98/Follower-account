export function safeStringify(obj: any): string {
  const seen = new WeakSet();
  const replacer = (key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return undefined; // Drop the cyclic reference
      }
      seen.add(value);
    }
    return value;
  };
  return JSON.stringify(obj, replacer, 2);
}
