// RFC 8785: ECMAScript primitive serialization and UTF-16 property ordering.
// Limits also make malformed/cyclic in-memory values fail before hashing.
export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  let nodes = 0;
  function validString(value: string): string {
    for (let index = 0; index < value.length; index++) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++index);
        if (!(next >= 0xdc00 && next <= 0xdfff))
          throw new TypeError("Unpaired Unicode surrogate.");
      } else if (unit >= 0xdc00 && unit <= 0xdfff)
        throw new TypeError("Unpaired Unicode surrogate.");
    }
    return JSON.stringify(value);
  }
  function encode(value: unknown, depth: number): string {
    if (++nodes > 100_000 || depth > 64)
      throw new TypeError("Canonical JSON exceeds limits.");
    if (value === null) return "null";
    if (typeof value === "string") return validString(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number" && Number.isFinite(value))
      return JSON.stringify(value);
    if (typeof value !== "object")
      throw new TypeError("Only finite JSON values may be canonicalized.");
    if (active.has(value)) throw new TypeError("Cyclic JSON value.");
    active.add(value);
    try {
      if (Array.isArray(value)) {
        const parts: string[] = [];
        for (let index = 0; index < value.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, index);
          if (!descriptor || !("value" in descriptor))
            throw new TypeError("Sparse/accessor arrays are not JSON.");
          parts.push(encode(descriptor.value, depth + 1));
        }
        return `[${parts.join(",")}]`;
      }
      if (
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      )
        throw new TypeError("Non-JSON object.");
      if (Object.getOwnPropertySymbols(value).length > 0)
        throw new TypeError("Symbol properties are not JSON.");
      return `{${Object.keys(value)
        .sort()
        .map((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
          if (!("value" in descriptor))
            throw new TypeError("Accessor properties are not JSON.");
          return `${validString(key)}:${encode(descriptor.value, depth + 1)}`;
        })
        .join(",")}}`;
    } finally {
      active.delete(value);
    }
  }
  return encode(value, 0);
}
