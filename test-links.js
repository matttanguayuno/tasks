// Test the exact query from the links API route
const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient();

async function main() {
  try {
    // Test GET (the query that's returning 500)
    const [linksFrom, linksTo] = await Promise.all([
      prisma.taskLink.findMany({
        where: { fromTaskId: 'cmmrxpqfj000nmoq97mgahz40' },
        include: { toTask: { select: { id: true, title: true, completed: true, parentId: true } } },
      }),
      prisma.taskLink.findMany({
        where: { toTaskId: 'cmmrxpqfj000nmoq97mgahz40' },
        include: { fromTask: { select: { id: true, title: true, completed: true, parentId: true } } },
      }),
    ]);
    console.log('GET success - from:', linksFrom.length, 'to:', linksTo.length);

    // Test POST (create a link)
    const link = await prisma.taskLink.create({
      data: {
        fromTaskId: 'cmmrxpqfj000nmoq97mgahz40',
        toTaskId: 'cmmrxnvvi000emoq9lrwtal3p',
        linkType: 'RELATED',
      },
      include: {
        toTask: { select: { id: true, title: true, completed: true, parentId: true } },
      },
    });
    console.log('POST success:', link.id);

    // Clean up
    await prisma.taskLink.delete({ where: { id: link.id } });
    console.log('Cleaned up test link');
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error('Full error:', e);
  } finally {
    await prisma['$disconnect']();
  }
}

main();
