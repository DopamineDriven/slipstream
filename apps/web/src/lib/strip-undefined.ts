/** @see https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/null-and-undefined */
export function stripUndefined<const T>(obj: T) {
  const data = {} as T;
  for (const key in obj) if (obj[key] !== undefined) data[key] = obj[key];
  return { data };
}
