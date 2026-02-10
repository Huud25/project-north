import { Command } from "commander";

const program = new Command();

program
  .name("north")
  .description("Project North — Automated Change Governor")
  .argument("<request>", "change request description")
  .requiredOption("--env <env>", "dev | staging | prod")
  .option("--type <type>", "deploy | restart | scale | delete | secrets | other", "other")
  .parse(process.argv);

const request = program.args[0];
const options = program.opts();

const output = {
  request,
  env: options.env,
  type: options.type,
  status: "CLI_OK",
  message: "North CLI is wired and ready"
};

console.log(JSON.stringify(output, null, 2));
