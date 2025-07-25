import { prismaClient as prisma } from "@/lib/prisma";



if (process.argv[3] === "users") {
  (async () => {
    try {
      prisma.$connect();
    } catch (err) {
      if (err instanceof Error) {
        console.error(err.message);
      } else console.error(JSON.stringify(err, null, 2));
    } finally {
      const data = await prisma.user.findMany({
        include: {
          accounts: true,
          profile: true,
          sessions: true,
          settings: true,
          _count: true
        }
      });
      return data;
    }
  })().then(res => {
    console.log(JSON.stringify(res, null, 2));
    prisma.$disconnect();
  });
}

if (process.argv[3] === "clear") {
  (async () => {
    try {
      prisma.$connect();
    } catch (err) {
      if (err instanceof Error) {
        console.error(err.message);
      } else console.error(JSON.stringify(err, null, 2));
    } finally {
      prisma.session.deleteMany();
      prisma.profile.deleteMany();
      prisma.settings.deleteMany();
      prisma.account.deleteMany();
      prisma.user.deleteMany();
    }
  })().then(res => {
    console.log(JSON.stringify(res, null, 2));
    prisma.$disconnect();
  });
}

if (process.argv[3] === "raw") {
  (async () => {
    try {
      prisma.$connect();
    } catch (err) {
      if (err instanceof Error) {
        console.error(err.message);
      } else console.error(JSON.stringify(err, null, 2));
    } finally {
      const raw = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1}`;
      return raw;
    }
  })().then(res => {
    console.log(JSON.stringify(res, null, 2));
    prisma.$disconnect();
  });
}
