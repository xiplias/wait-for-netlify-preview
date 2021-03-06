import Octokit from "@octokit/rest";
import pWaitFor from "p-wait-for";
import consola from "consola";
import envCi from "env-ci";
import shell from "shelljs";

const { commit, slug } = envCi();

const SimpleReporter = class {
  constructor({ stream } = {}) {
    this.stream = stream || process.stdout;
  }

  log(logObj) {
    this.stream.write(`${logObj.args[0]}\n`);
  }
};

consola.setReporters(new SimpleReporter());
const octokit = new Octokit({
  auth: `token ${process.env.DANGER_GITHUB_API_TOKEN ||
    process.env.GITHUB_API_TOKEN}`
});

const [owner, repo] = slug.split("/");

const hasDeployPreview = context =>
  [/^netlify\/.*\/deploy-preview$/, /^deploy\/netlify$/].some(expr =>
    expr.test(context)
  );
const successPreview = state => state === "success";
const failedPreview = state => state === "failure";

const getSuccessfulDeployment = async () => {
  const {
    data: { statuses }
  } = await octokit.repos.getCombinedStatusForRef({ owner, ref: commit, repo });

  if (
    statuses.find(
      ({ context, state }) => hasDeployPreview(context) && failedPreview(state)
    )
  ) {
    consola.error("Deploy preview failed");
    // Fail CI
    process.exit(1);
  }

  return statuses.find(
    ({ context, state }) => hasDeployPreview(context) && successPreview(state)
  );
};

const deployed = async () => Boolean(await getSuccessfulDeployment());
(async () => {
  await pWaitFor(deployed, { interval: 15000 });

  const { target_url: targetUrl } = await getSuccessfulDeployment();
  consola.log(targetUrl);
  shell.exec(
    "./node_modules/.bin/debugbear --pageId=744 --baseBranch=develop" +
      targetUrl
  );
  return targetUrl;
})();
