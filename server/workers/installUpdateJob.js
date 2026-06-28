const { runInstallJob } = require('../services/updateService');

async function main() {
  const jobId = String(process.argv[2] || '').trim();
  if (!jobId) {
    process.exitCode = 1;
    return;
  }

  await runInstallJob(jobId);
}

main()
  .catch(() => {
    process.exitCode = 1;
  });
