import { prismaClient as prisma } from "@/lib/prisma";
import { errHelper } from "@/orm/err-helper";

export const getUser = async <
  const T extends "id" | "email",
  const V extends string
>(
  target: T,
  identifier: V
) => {
  try {
    if (target === "email") {
      return await prisma.user.findUnique({ where: { email: identifier } });
    } else {
      return await prisma.user.findUnique({ where: { id: identifier } });
    }
  } catch (err) {
    errHelper(err, "info");
    return null;
  }
};
