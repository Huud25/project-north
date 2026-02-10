import { Command } from "commander";
import { evaluateChange } from "../core/evaluator";
import { recordAudit } from "../core/audit";

const program = new Command();

program
  .name("north")
  .description("Project North — Automated Change Governor")
  .argument("<request>", "change request description")
  .requiredOption("--env <env>", "dev | staging | prod")
  .option(
    "--type <type>",
    "deploy | restart | scale | delete | secrets | other",
    "other"
  )
  .parse(process.argv);

const request = program.args[0];
const options = program.opts();

const evaluation = evaluateChange(request, options.env);
const auditId = recordAudit(request, options.env, evaluation);

const output = {
  audit_id: auditId,
  request,
  env: options.env,
  type: options.type,
  ...evaluation
};

console.log(JSON.stringify(output, null, 2));
