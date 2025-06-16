import { default as prisma } from "@/lib/prisma";
import { errHelper } from "@/orm/err-helper";

export const getAccountByUserId = async (userId: string) => {
  try {
    const account = await prisma.account.findFirst({
      where: { userId }
    });
    return account;
  } catch (err) {
    errHelper(err, "info");
    return null;
  }
};
